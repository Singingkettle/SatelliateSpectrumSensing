import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';

/**
 * Orbit class - exactly following satvis/src/modules/Orbit.js architecture
 */
class Orbit {
  constructor(name, tle) {
    this.name = name;
    this.tle = tle.split("\n");
    this.satrec = satellite.twoline2satrec(this.tle[1], this.tle[2]);
  }

  get satnum() {
    return this.satrec.satnum;
  }

  get error() {
    return this.satrec.error;
  }

  get julianDate() {
    return this.satrec.jdsatepoch;
  }

  get orbitalPeriod() {
    const meanMotionRad = this.satrec.no;
    const period = (2 * Math.PI) / meanMotionRad;
    return period;
  }

  positionECI(time) {
    return satellite.propagate(this.satrec, time).position;
  }

  positionECF(time) {
    const positionEci = this.positionECI(time);
    const gmst = satellite.gstime(time);
    const positionEcf = satellite.eciToEcf(positionEci, gmst);
    return positionEcf;
  }
}

/**
 * SatelliteProperties class - following satvis architecture exactly
 * This replaces the old OrbitCalculator with satvis-compatible design
 */
class SatelliteProperties {
  constructor(tle, tags = []) {
    this.name = tle.split("\n")[0].trim();
    if (tle.startsWith("0 ")) {
      this.name = this.name.substring(2);
    }
    this.orbit = new Orbit(this.name, tle);
    this.satnum = this.orbit.satnum;
    this.tags = tags;

    // Initialize sampledPosition as undefined - will be created when needed
    this.sampledPosition = undefined;
  }

  position(time) {
    if (!this.sampledPosition) return null;
    return this.sampledPosition.fixed.getValue(time);
  }

  /**
   * Get sampled positions for the next orbit - EXACTLY like satvis
   */
  getSampledPositionsForNextOrbit(start, reference = "inertial", loop = true) {
    if (!this.sampledPosition) return [];

    const end = Cesium.JulianDate.addSeconds(start, this.orbit.orbitalPeriod * 60, new Cesium.JulianDate());
    const positions = this.sampledPosition[reference].getRawValues(start, end);
    if (loop) {
      // Readd the first position to the end of the array to close the loop
      return [...positions, positions[0]];
    }
    return positions;
  }

  /**
   * Update sampled position - Enhanced for long-term simulations
   */
  updateSampledPosition(time) {
    // Determine sampling interval based on sampled positions per orbit and orbital period
    // 120 samples per orbit seems to be a good compromise between performance and accuracy
    const samplingPointsPerOrbit = 120;
    const orbitalPeriod = this.orbit.orbitalPeriod * 60;
    const samplingInterval = orbitalPeriod / samplingPointsPerOrbit;

    // Smart time window sizing for long-term simulations
    // For LEO satellites (90-120 min period), we need to handle 24+ hour simulations
    const minWindowHours = 6; // Minimum 6 hours of data
    const minWindowSeconds = minWindowHours * 3600;
    const orbitsInMinWindow = Math.max(4, Math.ceil(minWindowSeconds / orbitalPeriod));

    // Keep dynamic window: at least 6 hours, or 8 orbits, whichever is larger
    const backwardOrbits = Math.max(2, orbitsInMinWindow / 3);
    const forwardOrbits = Math.max(6, orbitsInMinWindow * 2 / 3);

    // console.log(`[${this.name}] Time window: ${backwardOrbits.toFixed(1)} orbits backward, ${forwardOrbits.toFixed(1)} orbits forward`);

    const request = new Cesium.TimeInterval({
      start: Cesium.JulianDate.addSeconds(time, -orbitalPeriod * backwardOrbits, new Cesium.JulianDate()),
      stop: Cesium.JulianDate.addSeconds(time, orbitalPeriod * forwardOrbits, new Cesium.JulianDate()),
    });

    // (Re)create sampled position if it does not exist or if it does not contain the current time
    if (!this.sampledPosition || !Cesium.TimeInterval.contains(this.sampledPosition.interval, time)) {
      this.initSampledPosition(request.start);
    }

    // Determine which parts of the requested interval are missing
    const intersect = Cesium.TimeInterval.intersect(this.sampledPosition.interval, request);
    const missingSecondsEnd = Cesium.JulianDate.secondsDifference(request.stop, intersect.stop);
    const missingSecondsStart = Cesium.JulianDate.secondsDifference(intersect.start, request.start);

    if (missingSecondsStart > 0) {
      const samplingStart = Cesium.JulianDate.addSeconds(intersect.start, -missingSecondsStart, new Cesium.JulianDate());
      const samplingStop = this.sampledPosition.interval.start;
      this.addSamples(samplingStart, samplingStop, samplingInterval);
    }
    if (missingSecondsEnd > 0) {
      const samplingStart = this.sampledPosition.interval.stop;
      const samplingStop = Cesium.JulianDate.addSeconds(intersect.stop, missingSecondsEnd, new Cesium.JulianDate());
      this.addSamples(samplingStart, samplingStop, samplingInterval);
    }

    // Remove no longer needed samples
    const removeBefore = new Cesium.TimeInterval({
      start: Cesium.JulianDate.fromIso8601("1957"),
      stop: request.start,
      isStartIncluded: false,
      isStopIncluded: false,
    });
    const removeAfter = new Cesium.TimeInterval({
      start: request.stop,
      stop: Cesium.JulianDate.fromIso8601("2100"),
      isStartIncluded: false,
      isStopIncluded: false,
    });
    this.sampledPosition.fixed.removeSamples(removeBefore);
    this.sampledPosition.inertial.removeSamples(removeBefore);
    this.sampledPosition.fixed.removeSamples(removeAfter);
    this.sampledPosition.inertial.removeSamples(removeAfter);

    this.sampledPosition.interval = request;
  }

  /**
   * Initialize sampled position - EXACTLY like satvis
   */
  initSampledPosition(currentTime) {
    this.sampledPosition = {};
    this.sampledPosition.interval = new Cesium.TimeInterval({
      start: currentTime,
      stop: currentTime,
      isStartIncluded: false,
      isStopIncluded: false,
    });
    this.sampledPosition.fixed = new Cesium.SampledPositionProperty();
    this.sampledPosition.fixed.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    this.sampledPosition.fixed.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    this.sampledPosition.fixed.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
    });
    this.sampledPosition.inertial = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
    this.sampledPosition.inertial.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    this.sampledPosition.inertial.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    this.sampledPosition.inertial.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
    });
    this.sampledPosition.valid = true;
  }

  /**
   * Add samples - EXACTLY like satvis
   */
  addSamples(start, stop, samplingInterval) {
    const times = [];
    const positionsFixed = [];
    const positionsInertial = [];
    for (let time = start; Cesium.JulianDate.compare(stop, time) >= 0; time = Cesium.JulianDate.addSeconds(time, samplingInterval, new Cesium.JulianDate())) {
      const { positionFixed, positionInertial } = this.computePosition(time);
      times.push(time);
      positionsFixed.push(positionFixed);
      positionsInertial.push(positionInertial);
    }
    // Add all samples at once as adding a sorted array avoids searching for the correct position every time
    this.sampledPosition.fixed.addSamples(times, positionsFixed);
    this.sampledPosition.inertial.addSamples(times, positionsInertial);
  }

  /**
   * Compute position in TEME frame - EXACTLY like satvis
   */
  computePositionInertialTEME(time) {
    const eci = this.orbit.positionECI(Cesium.JulianDate.toDate(time));
    if (this.orbit.error) {
      this.sampledPosition.valid = false;
      return Cesium.Cartesian3.ZERO;
    }
    return new Cesium.Cartesian3(eci.x * 1000, eci.y * 1000, eci.z * 1000);
  }

  /**
   * Compute position - EXACTLY like satvis
   */
  computePosition(timestamp) {
    const positionInertialTEME = this.computePositionInertialTEME(timestamp);

    const temeToFixed = Cesium.Transforms.computeTemeToPseudoFixedMatrix(timestamp);
    if (!Cesium.defined(temeToFixed)) {
      console.error("Reference frame transformation data failed to load");
    }
    const positionFixed = Cesium.Matrix3.multiplyByVector(temeToFixed, positionInertialTEME, new Cesium.Cartesian3());

    const fixedToIcrf = Cesium.Transforms.computeFixedToIcrfMatrix(timestamp);
    if (!Cesium.defined(fixedToIcrf)) {
      console.error("Reference frame transformation data failed to load");
    }
    const positionInertialICRF = Cesium.Matrix3.multiplyByVector(fixedToIcrf, positionFixed, new Cesium.Cartesian3());

    return { positionFixed, positionInertial: positionInertialICRF };
  }

  /**
   * Create sampled position - EXACTLY like satvis
   */
  createSampledPosition(viewer, callback) {
    this.updateSampledPosition(viewer.clock.currentTime);
    callback(this.sampledPosition);

    // Use Cesium clock-based callback like satvis, not setInterval
    // More frequent updates for long-term simulations: every 1/8 orbit or 5 minutes, whichever is smaller
    const baseRefreshRate = (this.orbit.orbitalPeriod * 60) / 8; // Every 1/8 orbit
    const maxRefreshRate = 5 * 60; // Maximum 5 minutes
    const samplingRefreshRate = Math.min(baseRefreshRate, maxRefreshRate);

    // console.log(`[${this.name}] Sampling refresh rate: ${samplingRefreshRate.toFixed(1)} seconds`);
    let lastUpdated = viewer.clock.currentTime;

    const removeCallback = viewer.clock.onTick.addEventListener(() => {
      const time = viewer.clock.currentTime;
      const delta = Math.abs(Cesium.JulianDate.secondsDifference(time, lastUpdated));
      if (delta < samplingRefreshRate) {
        return;
      }

      // console.log(`[${this.name}] Updating sampledPosition at time: ${Cesium.JulianDate.toIso8601(time)}`);
      this.updateSampledPosition(time);
      callback(this.sampledPosition);
      lastUpdated = time;
    });

    return () => {
      removeCallback();
      this.sampledPosition = undefined;
    };
  }
}

/**
 * SatelliteComponentCollection - EXACTLY like satvis
 * Manages individual satellite components (Point, Orbit, Label, etc.)
 */
class SatelliteComponentCollection {
  constructor(viewer, tle, tags = [], color = Cesium.Color.WHITE) {
    this.viewer = viewer;
    this.props = new SatelliteProperties(tle, tags);
    this.color = color; // Store the constellation color
    this.components = {};
    this.created = false;
    this.eventListeners = {};
  }

  /**
   * Initialize sampled position - EXACTLY like satvis
   */
  init() {
    if (this.created) return;

    // CRITICAL: Create sampled position first - like satvis.init()
    this.eventListeners.sampledPosition = this.props.createSampledPosition(this.viewer, () => {
      this.updatedSampledPositionForComponents(true);
    });

    this.created = true;
  }

  /**
 * Show specified components - EXACTLY like satvis
 */
  show(componentNames) {
    // console.log(`[${this.props.name}] show() called with components: ${componentNames.join(', ')}`);

    if (!this.created) {
      // console.log(`[${this.props.name}] Initializing satellite...`);
      this.init();
    }

    // First, disable all existing components that are not in the new list
    Object.keys(this.components).forEach(existingComponentName => {
      if (!componentNames.includes(existingComponentName)) {
        this.disableComponent(existingComponentName);
      }
    });

    // Store pending components to create later if sampledPosition isn't ready
    this.pendingComponents = this.pendingComponents || [];

    // Also remove pending components that are not in the new list
    this.pendingComponents = this.pendingComponents.filter(pendingName =>
      componentNames.includes(pendingName)
    );

    componentNames.forEach(name => {
      if (!this.props.sampledPosition || !this.props.sampledPosition.valid) {
        // If sampledPosition isn't ready, store for later creation
        if (!this.pendingComponents.includes(name)) {
          this.pendingComponents.push(name);
          // console.log(`[${this.props.name}] Deferring creation of ${name} component until sampledPosition is ready`);
        }
      } else {
        // sampledPosition is ready, create component immediately
        // console.log(`[${this.props.name}] Creating ${name} component immediately`);
        this.enableComponent(name);
      }
    });
  }

  /**
   * Enable a component - EXACTLY like satvis
   */
  enableComponent(name) {
    if (!(name in this.components)) {
      this.createComponent(name);
      this.updatedSampledPositionForComponents();
    }

    if (this.components[name]) {
      this.components[name].show = true;
    }
  }

  /**
   * Create specific component - EXACTLY like satvis
   */
  createComponent(name) {
    switch (name) {
      case "Point":
        this.createPoint();
        break;
      case "Orbit":
        this.createOrbit();
        break;
      case "Label":
        this.createLabel();
        break;
      default:
        console.error("Unknown component:", name);
    }
  }

  /**
   * Create point component - EXACTLY like satvis
   */
  createPoint() {
    const point = new Cesium.PointGraphics({
      pixelSize: 8,
      color: this.color, // Use constellation color
      outlineColor: Cesium.Color.DIMGREY,
      outlineWidth: 1,
    });

    const entity = new Cesium.Entity({
      name: this.props.name,
      position: this.props.sampledPosition.fixed,
      point: point
    });

    this.viewer.entities.add(entity);
    this.components.Point = entity;
  }

  /**
   * Create orbit component - EXACTLY like satvis
   */
  createOrbit() {
    // console.log(`Creating orbit for ${this.props.name}...`);

    // Check if sampledPosition is available
    if (!this.props.sampledPosition) {
      console.error(`No sampledPosition available for ${this.props.name}`);
      return;
    }

    // console.log(`SampledPosition available, creating orbit path...`);

    // Use PathGraphics first - simpler and more reliable like satvis
    const orbitalPeriod = this.props.orbit.orbitalPeriod * 60; // Convert to seconds

    const path = new Cesium.PathGraphics({
      leadTime: orbitalPeriod / 2 + 5,
      trailTime: orbitalPeriod / 2 + 5,
      material: this.color.withAlpha(0.4), // Use constellation color with transparency
      resolution: 600,
      width: 2,
    });

    const entity = new Cesium.Entity({
      name: `${this.props.name}_orbit`,
      position: this.props.sampledPosition.inertial,
      path: path
    });

    this.viewer.entities.add(entity);
    this.components.Orbit = entity;

    // console.log(`Orbit path created for ${this.props.name} with color: ${this.color}`);
  }

  /**
   * Create label component - EXACTLY like satvis
   */
  createLabel() {
    const label = new Cesium.LabelGraphics({
      text: this.props.name,
      font: "15px Arial",
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Cesium.Color.DIMGREY,
      outlineWidth: 2,
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      pixelOffset: new Cesium.Cartesian2(10, 0),
    });

    const entity = new Cesium.Entity({
      name: `${this.props.name}_label`,
      position: this.props.sampledPosition.fixed,
      label: label
    });

    this.viewer.entities.add(entity);
    this.components.Label = entity;
  }

  /**
   * Update sampled position for components - EXACTLY like satvis
   */
  updatedSampledPositionForComponents(update = false) {
    if (!this.props.sampledPosition || !this.props.sampledPosition.valid) {
      return;
    }

    const { fixed, inertial } = this.props.sampledPosition;

    // Check if we have pending components to create now that sampledPosition is ready
    if (this.pendingComponents && this.pendingComponents.length > 0) {
      // console.log(`[${this.props.name}] Creating pending components: ${this.pendingComponents.join(', ')}`);
      const pendingToCreate = [...this.pendingComponents];
      this.pendingComponents = []; // Clear pending list

      pendingToCreate.forEach(name => {
        // console.log(`[${this.props.name}] Creating pending component: ${name}`);
        this.enableComponent(name);
      });
    }

    // Update existing components
    Object.entries(this.components).forEach(([type, component]) => {
      if (type === "Orbit") {
        // Orbit uses inertial frame - PathGraphics auto-updates, no manual update needed
      } else {
        // Point and Label use fixed frame
        if (component.position) {
          component.position = fixed;
        }
      }
    });
  }

  /**
   * Disable component
   */
  disableComponent(name) {
    if (this.components[name]) {
      // Now all components are entities, so remove from entities collection
      this.viewer.entities.remove(this.components[name]);

      // Clean up any intervals if needed
      if (name === "Orbit" && this.orbitPrimitiveUpdater) {
        clearInterval(this.orbitPrimitiveUpdater);
        this.orbitPrimitiveUpdater = null;
      }

      delete this.components[name];
    }
  }

  /**
   * Hide all components
   */
  hide() {
    Object.keys(this.components).forEach(name => {
      this.disableComponent(name);
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    this.hide();
    if (this.eventListeners.sampledPosition) {
      this.eventListeners.sampledPosition();
    }
  }
}

/**
 * SatelliteManager - EXACTLY like satvis architecture
 */
class SatelliteManager {
  constructor(viewer) {
    this.viewer = viewer;
    this.satellites = new Map(); // Map of satellite name -> SatelliteComponentCollection
  }

  /**
   * Add satellite from TLE - EXACTLY like satvis
   */
  addFromTle(tle, tags = [], color = Cesium.Color.WHITE) {
    const satelliteCollection = new SatelliteComponentCollection(this.viewer, tle, tags, color);
    const name = satelliteCollection.props.name;

    this.satellites.set(name, satelliteCollection);
    return satelliteCollection;
  }

  /**
   * Get satellite by name
   */
  getSatellite(name) {
    return this.satellites.get(name);
  }

  /**
   * Show satellite with components
   */
  showSatellite(name, components = ["Point"]) {
    const satellite = this.satellites.get(name);
    if (satellite) {
      satellite.show(components);
    }
  }

  /**
   * Hide satellite and remove from manager
   */
  hideSatellite(name) {
    const satellite = this.satellites.get(name);
    if (satellite) {
      satellite.destroy();
      this.satellites.delete(name);
    }
  }

  /**
   * Clear all satellites
   */
  clearAll() {
    this.satellites.forEach(satellite => {
      satellite.destroy();
    });
    this.satellites.clear();
  }
}

// Export the classes and manager constructor 
export { Orbit, SatelliteProperties, SatelliteComponentCollection, SatelliteManager };
