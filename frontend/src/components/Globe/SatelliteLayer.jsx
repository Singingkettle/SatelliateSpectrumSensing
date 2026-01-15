/**
 * SatelliteLayer - Renders satellites on the globe
 * Uses inclination-based color coding matching satellitemap.space
 * Optimized for performance with thousands of satellites
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useSatelliteStore } from '../../store/satelliteStore';
import * as satellite from 'satellite.js';

// Satellite marker sizes - matching satellitemap.space (very small dots)
// Visual sizes are small, but picking tolerance is increased for easier selection
const SATELLITE_SIZE_BASE = 2;        // Small base size like satellitemap.space
const SATELLITE_SIZE_HOVER = 6;       // Moderate size on hover
const SATELLITE_SIZE_SELECTED = 8;    // Selected satellite - stands out but not too large

// Zoom thresholds (camera altitude in meters)
const ZOOM_FAR = 30000000;    // 30,000km - earth overview

// Labels are DISABLED by default - only show on hover/select
// This matches satellitemap.space behavior where labels only appear on interaction
const LABELS_ALWAYS_HIDDEN = true;  // Set to true to match reference site

// Picking tolerance - how close (in pixels) mouse needs to be to pick an entity
// IMPORTANT: Keep this large even with small satellites for easier selection
const PICK_TOLERANCE = 15; // Larger tolerance for easier selection with small dots

// Update interval for satellite positions (milliseconds)
const POSITION_UPDATE_INTERVAL = 100; // Update every 100ms for smooth animation

// Inclination-based color scheme (matching satellitemap.space)
const INCLINATION_COLORS = {
  equatorial: Cesium.Color.fromCssColorString('#ef4444'),  // 0-30° Red
  low: Cesium.Color.fromCssColorString('#f97316'),         // 30-60° Orange
  medium: Cesium.Color.fromCssColorString('#eab308'),      // 60-90° Yellow
  high: Cesium.Color.fromCssColorString('#22c55e'),        // 90-120° Green
  retrograde: Cesium.Color.fromCssColorString('#3b82f6'),  // 120-180° Blue
};

/**
 * Get color based on orbital inclination
 * @param {number} inclination - Orbital inclination in degrees
 * @returns {Cesium.Color} - Color for the satellite marker
 */
const getInclinationColor = (inclination) => {
  if (inclination === undefined || inclination === null) {
    return INCLINATION_COLORS.low; // Default
  }
  
  const inc = Math.abs(inclination);
  
  if (inc < 30) return INCLINATION_COLORS.equatorial;
  if (inc < 60) return INCLINATION_COLORS.low;
  if (inc < 90) return INCLINATION_COLORS.medium;
  if (inc < 120) return INCLINATION_COLORS.high;
  return INCLINATION_COLORS.retrograde;
};

/**
 * Extract inclination from TLE Line 2
 * @param {string} line2 - TLE Line 2
 * @returns {number} - Inclination in degrees
 */
const extractInclination = (line2) => {
  try {
    // Line 2 format: columns 9-16 contain inclination
    const incStr = line2.substring(8, 16).trim();
    return parseFloat(incStr);
  } catch {
    return 53; // Default Starlink-like inclination
  }
};

/**
 * Calculate satellite position from TLE at given time
 */
const getSatellitePosition = (line1, line2, time) => {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    const positionAndVelocity = satellite.propagate(satrec, time);
    
    if (!positionAndVelocity.position) return null;
    
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    
    return {
      longitude: satellite.degreesLong(positionGd.longitude),
      latitude: satellite.degreesLat(positionGd.latitude),
      height: positionGd.height * 1000, // Convert to meters
    };
  } catch (error) {
    return null;
  }
};

/**
 * Pre-calculate ECI (Inertial) orbit positions.
 * These are fixed in inertial space (TEME frame) and only need to be calculated once per TLE.
 * They can then be rotated to ECEF (Earth-fixed) in real-time based on the current time (GMST).
 */
const precalculateOrbitEci = (line1, line2, centerTime, periodMinutes = null, numPoints = 360) => {
  try {
    if (!line1 || !line2) return [];
    
    const satrec = satellite.twoline2satrec(line1, line2);
    if (!satrec || satrec.error) return [];
    
    const meanMotion = satrec.no * 1440 / (2 * Math.PI); // rev/day
    const calculatedPeriod = periodMinutes || (1440 / meanMotion); // minutes
    
    const eciPoints = [];
    const halfPeriod = calculatedPeriod / 2;
    const stepMinutes = calculatedPeriod / numPoints;
    const startTime = new Date(centerTime.getTime() - halfPeriod * 60000);
    
    for (let i = 0; i <= numPoints; i++) {
      const time = new Date(startTime.getTime() + i * stepMinutes * 60000);
      const positionAndVelocity = satellite.propagate(satrec, time);
      
      if (positionAndVelocity.position && !isNaN(positionAndVelocity.position.x)) {
        // Store ECI position (km) and the time it corresponds to (for potential specialized propagators)
        eciPoints.push({
          position: positionAndVelocity.position, // x, y, z in km
          date: time
        });
      }
    }
    return eciPoints;
  } catch (error) {
    console.error('[precalculateOrbitEci] Error:', error);
    return [];
  }
};

/**
 * Check if labels should be shown based on zoom
 * Following satellitemap.space: labels are ONLY shown on hover/select, never by zoom alone
 */
const shouldShowLabels = (cameraHeight) => {
  // Labels are disabled by default - only show on hover/select
  if (LABELS_ALWAYS_HIDDEN) return false;
  return false; // Never show labels based on zoom alone
};

const SatelliteLayer = () => {
  const { viewer } = useCesium();
  const entitiesRef = useRef(new Map());
  const orbitEntitiesRef = useRef(new Map());  // Map of norad_id -> orbit entity (supports multiple orbits)
  const orbitEciPointsRef = useRef(new Map()); // Map of norad_id -> ECI points for fast rotation
  const selectionBoxRef = useRef(null); // Selection box around selected satellite
  const lastUpdateRef = useRef(0);
  const animationFrameRef = useRef(null);
  const hoveredEntityRef = useRef(null);
  const currentSizeRef = useRef(SATELLITE_SIZE_BASE);
  const lastCesiumTimeRef = useRef(null);
  const pulseAnimationRef = useRef(null);  // For hover pulse animation
  const selectionPulseRef = useRef(null);  // For selected satellite pulse
  const lastSelectedIdRef = useRef(null);  // Track last selected satellite to clear styles
  
  // Store state
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellationData = useSatelliteStore(s => s.constellationData);
  const showOrbits = useSatelliteStore(s => s.showOrbits);
  const showLabels = useSatelliteStore(s => s.showLabels);
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const orbitSatellites = useSatelliteStore(s => s.orbitSatellites);  // Map of satellites with orbits displayed
  const selectSatellite = useSatelliteStore(s => s.selectSatellite);
  
  // Get all satellites to render with inclination colors
  const satellites = useMemo(() => {
    const allSats = [];
    for (const slug of selectedConstellations) {
      const data = constellationData[slug];
      if (data?.satellites) {
        data.satellites.forEach(sat => {
          const inclination = sat.inclination || (sat.line2 ? extractInclination(sat.line2) : 53);
          const color = getInclinationColor(inclination);
          
          allSats.push({
            ...sat,
            constellation: slug,
            inclination,
            color,
          });
        });
      }
    }
    return allSats;
  }, [selectedConstellations, constellationData]);
  
  // Update satellite positions periodically using Cesium render loop
  useEffect(() => {
    if (!viewer) return;
    
    const updatePositions = (scene, time) => {
      // Guard against destroyed or incomplete viewer
      if (!viewer || viewer.isDestroyed() || !viewer.clock) {
        return;
      }
      
      const now = Date.now();
      // Throttle updates for performance (every 100ms)
      if (now - lastUpdateRef.current < POSITION_UPDATE_INTERVAL) {
        return;
      }
      lastUpdateRef.current = now;
      
      // Get current Cesium time
      const cesiumTime = viewer.clock.currentTime;
      const cesiumTimeMs = Cesium.JulianDate.toDate(cesiumTime).getTime();
      
      // Check if time has actually changed (for paused state)
      const timeChanged = lastCesiumTimeRef.current === null || Math.abs(cesiumTimeMs - lastCesiumTimeRef.current) > 50;
      lastCesiumTimeRef.current = cesiumTimeMs;
      
      // Use Cesium clock time
      const currentTime = Cesium.JulianDate.toDate(cesiumTime);
      const existingIds = new Set(entitiesRef.current.keys());
      const newIds = new Set();
      
      // Get camera height for label display decision (currently unused, labels only shown on hover)
      currentSizeRef.current = SATELLITE_SIZE_BASE;
      
      // Skip position updates if time hasn't changed and we already have entities
      const shouldUpdatePositions = timeChanged || entitiesRef.current.size === 0;
      
      // Add or update satellites
      for (const sat of satellites) {
        const id = `sat-${sat.norad_id}`;
        newIds.add(id);
        
        if (!sat.line1 || !sat.line2) continue;
        
        let entity = entitiesRef.current.get(id);
        const isSelected = selectedSatellite?.norad_id === sat.norad_id;
        const isHovered = hoveredEntityRef.current === id;
        
        // FIXED size - doesn't change with zoom (like satellitemap.space)
        let pointSize = SATELLITE_SIZE_BASE;
        if (isSelected) {
          pointSize = SATELLITE_SIZE_SELECTED;
        } else if (isHovered) {
          pointSize = SATELLITE_SIZE_HOVER;
        }
        
        // Calculate position only when needed
        let position = null;
        if (shouldUpdatePositions || !entity) {
          position = getSatellitePosition(sat.line1, sat.line2, currentTime);
          if (!position) continue;
        }
        
        if (!entity) {
          if (!position) continue;
          
          // Create new entity with inclination-based color
          // FIXED size - no scaleByDistance (like satellitemap.space)
          entity = viewer.entities.add({
            id,
            name: sat.name,
            position: Cesium.Cartesian3.fromDegrees(
              position.longitude,
              position.latitude,
              position.height
            ),
            point: {
              pixelSize: pointSize,
              color: sat.color,
              outlineColor: isSelected ? Cesium.Color.CYAN : Cesium.Color.WHITE.withAlpha(0.5),
              outlineWidth: isSelected ? 3 : 0,
              // REMOVED disableDepthTestDistance to allow earth occlusion
              heightReference: Cesium.HeightReference.NONE,
              // NO scaleByDistance - fixed size at all zoom levels
            },
            label: {
              text: sat.name,
              font: '12px "Segoe UI", Arial, sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -15),
              // REMOVED disableDepthTestDistance to allow earth occlusion
              backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.7)'),
              showBackground: true,
              backgroundPadding: new Cesium.Cartesian2(6, 4),
              // ONLY show labels on hover or select - NEVER by default
              // This matches satellitemap.space behavior exactly
              show: isSelected || isHovered,
            },
            properties: {
              norad_id: sat.norad_id,
              constellation: sat.constellation,
              inclination: sat.inclination,
              name: sat.name,
              line1: sat.line1,
              line2: sat.line2,
            },
          });
          
          entitiesRef.current.set(id, entity);
        } else {
          // Update existing entity position if time changed
          if (shouldUpdatePositions && position) {
          entity.position = Cesium.Cartesian3.fromDegrees(
            position.longitude,
            position.latitude,
            position.height
          );
          }
          
          // Update point appearance
          if (entity.point) {
            entity.point.pixelSize = pointSize;
            entity.point.outlineWidth = isSelected ? 2 : (isHovered ? 1 : 0.5);
            entity.point.outlineColor = isSelected ? Cesium.Color.WHITE : Cesium.Color.WHITE.withAlpha(0.5);
          }
          
          // Update label visibility - ONLY on hover or select
          if (entity.label) {
            entity.label.show = isSelected || isHovered;
          }
        }
      }
      
      // Remove entities that are no longer in the data
      for (const id of existingIds) {
        if (!newIds.has(id)) {
          const entity = entitiesRef.current.get(id);
          if (entity) {
            viewer.entities.remove(entity);
            entitiesRef.current.delete(id);
          }
        }
      }
    };
    
    // Use scene.preUpdate to hook into Cesium's render loop
    // This is more robust than requestAnimationFrame for Cesium
    const removeListener = viewer.scene.preUpdate.addEventListener(updatePositions);
    
    // Force initial update
    updatePositions();
    
    // Capture ref for cleanup
    const currentAnimationFrame = animationFrameRef.current;
    
    return () => {
      removeListener();
      if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame);
      }
    };
  }, [viewer, satellites, showOrbits, showLabels, selectedSatellite]);
  
  // Handle selection styles (pulse effect, outline) when satellite is selected for info panel
  useEffect(() => {
    if (!viewer) return;
    
    // Clear previous selection styles
    if (lastSelectedIdRef.current && (!selectedSatellite || `sat-${selectedSatellite.norad_id}` !== lastSelectedIdRef.current)) {
      const prevEntity = entitiesRef.current.get(lastSelectedIdRef.current);
      if (prevEntity && prevEntity.point) {
        prevEntity.point.pixelSize = SATELLITE_SIZE_BASE;
        prevEntity.point.outlineWidth = 0;
        prevEntity.point.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
        if (prevEntity.label) {
          prevEntity.label.show = false;
        }
      }
    }
    
    // Update current selection ID
    if (selectedSatellite) {
      lastSelectedIdRef.current = `sat-${selectedSatellite.norad_id}`;
    } else {
      lastSelectedIdRef.current = null;
    }
    
    // Stop previous selection pulse animation
    if (selectionPulseRef.current) {
      cancelAnimationFrame(selectionPulseRef.current);
      selectionPulseRef.current = null;
    }
    
    // Remove previous selection box
    if (selectionBoxRef.current) {
      try {
        viewer.entities.remove(selectionBoxRef.current);
      } catch (e) {}
      selectionBoxRef.current = null;
    }
    
    // Add selection pulse effect to the selected satellite entity
    if (selectedSatellite) {
      const selectedEntity = entitiesRef.current.get(`sat-${selectedSatellite.norad_id}`);
      if (selectedEntity && selectedEntity.point) {
        selectedEntity.point.pixelSize = SATELLITE_SIZE_SELECTED;
        selectedEntity.point.outlineWidth = 3;
        selectedEntity.point.outlineColor = Cesium.Color.CYAN;
        if (selectedEntity.label) {
          selectedEntity.label.show = true;
        }
        
        // Start selection pulse animation with reduced amplitude
        let selPhase = 0;
        const currentSelectedNoradId = selectedSatellite.norad_id; // Capture for closure
        const selectionPulse = () => {
          // Stop if satellite changed or entity no longer exists
          if (!selectedEntity.point || selectedSatellite?.norad_id !== currentSelectedNoradId) {
            return;
          }
          selPhase += 0.08; // Slower pulse
          const pulse = Math.sin(selPhase) * 0.12 + 1; // Oscillates between 0.88 and 1.12
          selectedEntity.point.pixelSize = SATELLITE_SIZE_SELECTED * pulse;
          selectedEntity.point.outlineWidth = 3 + Math.sin(selPhase) * 0.5;
          viewer.scene.requestRender();
          selectionPulseRef.current = requestAnimationFrame(selectionPulse);
        };
        selectionPulseRef.current = requestAnimationFrame(selectionPulse);
      }
    }
    
    return () => {
      if (selectionPulseRef.current) {
        cancelAnimationFrame(selectionPulseRef.current);
        selectionPulseRef.current = null;
      }
      if (selectionBoxRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.entities.remove(selectionBoxRef.current);
        } catch (e) {}
        selectionBoxRef.current = null;
      }
    };
  }, [viewer, selectedSatellite]);
  
  // Handle multiple orbit displays - supports showing many orbits simultaneously
  // Orbits remain visible even when info panel is closed
  // Orbits are cleared when constellation is switched (handled in store)
  useEffect(() => {
    if (!viewer) return;
    
    const updateOrbits = () => {
      // Get current orbit norad IDs from the Map
      const currentOrbitIds = new Set(orbitSatellites.keys());
      const existingOrbitIds = new Set(orbitEntitiesRef.current.keys());
      
      // Remove orbits that are no longer in the store
      for (const noradId of existingOrbitIds) {
        if (!currentOrbitIds.has(noradId)) {
          const entity = orbitEntitiesRef.current.get(noradId);
          if (entity) {
            try {
              viewer.entities.remove(entity);
            } catch (e) {}
          }
          orbitEntitiesRef.current.delete(noradId);
          orbitEciPointsRef.current.delete(noradId);
          console.log('[SatelliteLayer] Removed orbit for NORAD:', noradId);
        }
      }
      
      // Add new orbits
      for (const [noradId, sat] of orbitSatellites) {
        // Skip if already exists
        if (orbitEntitiesRef.current.has(noradId)) continue;
        
        if (!sat.line1 || !sat.line2) {
          console.warn('[SatelliteLayer] Orbit satellite missing TLE:', sat.name);
          continue;
        }
        
        console.log('[SatelliteLayer] Creating orbit for:', sat.name);
        
        // Use Cesium clock time for orbit calculation
        const currentTime = viewer.clock?.currentTime 
          ? Cesium.JulianDate.toDate(viewer.clock.currentTime)
          : new Date();
        
        // Pre-calculate ECI points (inertial)
        const eciPoints = precalculateOrbitEci(sat.line1, sat.line2, currentTime, null, 360);
        orbitEciPointsRef.current.set(noradId, eciPoints);
        
        if (eciPoints.length > 2) {
          // Create closure to capture the norad_id for this specific orbit
          const capturedNoradId = noradId;
          
          // Use CallbackProperty to rotate ECI -> ECEF in real-time
          const positionsCallback = new Cesium.CallbackProperty((time, result) => {
            const jsDate = Cesium.JulianDate.toDate(time);
            const gmst = satellite.gstime(jsDate);
            const positions = [];
            
            const points = orbitEciPointsRef.current.get(capturedNoradId) || [];
            for (let i = 0; i < points.length; i++) {
              const ecf = satellite.eciToEcf(points[i].position, gmst);
              if (ecf && typeof ecf.x === 'number' && !isNaN(ecf.x)) {
                positions.push(new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000));
              }
            }
            return positions;
          }, false);
          
          // Generate color based on satellite inclination for variety
          const inclination = sat.inclination || extractInclination(sat.line2);
          const orbitColor = getInclinationColor(inclination).withAlpha(0.9);
          
          const orbitEntity = viewer.entities.add({
            id: `orbit-${noradId}-${Date.now()}`,
            polyline: {
              positions: positionsCallback,
              width: 3,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.4,
                color: orbitColor,
              }),
              depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: orbitColor.withAlpha(0.25),
              }),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              clampToGround: false,
            },
          });
          
          orbitEntitiesRef.current.set(noradId, orbitEntity);
          console.log('[SatelliteLayer] Orbit created for:', sat.name, 'Total orbits:', orbitEntitiesRef.current.size);
        }
      }
      
      viewer.scene.requestRender();
    };
    
    // Initial orbit creation
    updateOrbits();
    
    return () => {
      // Cleanup all orbits when component unmounts
      // Copy refs to local variables for cleanup (React hooks best practice)
      const orbitEntities = orbitEntitiesRef.current;
      const orbitEciPoints = orbitEciPointsRef.current;
      
      for (const entity of orbitEntities.values()) {
        if (viewer && !viewer.isDestroyed()) {
          try {
            viewer.entities.remove(entity);
          } catch (e) {}
        }
      }
      orbitEntities.clear();
      orbitEciPoints.clear();
    };
  }, [viewer, orbitSatellites]);
  
  // Cleanup on unmount
  useEffect(() => {
    // Capture refs to local variables for cleanup (React hooks best practice)
    const entities = entitiesRef.current;
    const orbitEntities = orbitEntitiesRef.current;
    const orbitEciPoints = orbitEciPointsRef.current;
    const animationFrame = animationFrameRef.current;
    
    return () => {
      if (viewer && !viewer.isDestroyed()) {
        // Remove satellite entities
        for (const entity of entities.values()) {
          try {
            viewer.entities.remove(entity);
          } catch (e) {}
        }
        entities.clear();
        
        // Remove all orbit entities
        for (const entity of orbitEntities.values()) {
          try {
            viewer.entities.remove(entity);
          } catch (e) {}
        }
        orbitEntities.clear();
        orbitEciPoints.clear();
      }
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [viewer]);
  
  // Get setSelectedSatellite and orbit functions for direct state update
  const setSelectedSatellite = useSatelliteStore(s => s.setSelectedSatellite);
  const toggleOrbitSatellite = useSatelliteStore(s => s.toggleOrbitSatellite);
  
  // Set up click and hover handlers
  useEffect(() => {
    if (!viewer) return;
    
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    
    // Click handler - directly set satellite data to avoid API call delay
    // Use drillPick for better tolerance - picks all objects at position
    // Supports multiple orbits: clicking toggles individual orbit on/off
    handler.setInputAction((movement) => {
      // Try regular pick first
      let pickedObject = viewer.scene.pick(movement.position);
      
      // If no direct hit, try drillPick to get nearby objects
      if (!Cesium.defined(pickedObject) || !pickedObject.id) {
        const pickedObjects = viewer.scene.drillPick(movement.position, 5, PICK_TOLERANCE, PICK_TOLERANCE);
        // Find first satellite entity
        for (const picked of pickedObjects) {
          if (picked.id && picked.id.properties && picked.id.properties.hasProperty('norad_id')) {
            pickedObject = picked;
            break;
          }
        }
      }
      
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        // Check if entity has properties (it might be a primitive or something else)
        if (entity.properties && entity.properties.hasProperty('norad_id')) {
          // Get all properties directly from entity to ensure TLE data is available
          const noradId = entity.properties.norad_id.getValue();
          const name = entity.properties.name?.getValue() || entity.name;
          const line1 = entity.properties.line1?.getValue();
          const line2 = entity.properties.line2?.getValue();
          const inclination = entity.properties.inclination?.getValue();
          const constellation = entity.properties.constellation?.getValue();
          
          console.log('[SatelliteLayer] Satellite clicked:', name, 'NORAD:', noradId);
          
          const satData = {
            norad_id: noradId,
            name: name,
            line1: line1,
            line2: line2,
            inclination: inclination,
            constellation: constellation,
          };
          
          // Check if this satellite already has orbit displayed
          const hasOrbit = orbitSatellites.has(noradId);
          
          if (hasOrbit) {
            // Toggle OFF: Remove orbit line, close info panel
            console.log('[SatelliteLayer] Toggling orbit OFF for:', name);
            toggleOrbitSatellite(satData);
            // Close info panel if it's showing this satellite
            if (selectedSatellite?.norad_id === noradId) {
              setSelectedSatellite(null);
            }
          } else {
            // Toggle ON: Add orbit line, show info panel
            console.log('[SatelliteLayer] Toggling orbit ON for:', name);
            // setSelectedSatellite also adds to orbitSatellites
            setSelectedSatellite(satData);
          }
        }
      } else {
        // Clicked empty space - only close info panel, keep orbits
        console.log('[SatelliteLayer] Empty space clicked - closing info panel (orbits preserved)');
        if (setSelectedSatellite) {
          setSelectedSatellite(null);
        } else {
          selectSatellite(null);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
    // Hover handler - mouse move with expanded picking area
    handler.setInputAction((movement) => {
      // Try regular pick first
      let pickedObject = viewer.scene.pick(movement.endPosition);
      
      // If no direct hit, try drillPick with expanded area
      if (!Cesium.defined(pickedObject) || !pickedObject.id || !pickedObject.id.properties?.hasProperty('norad_id')) {
        const pickedObjects = viewer.scene.drillPick(movement.endPosition, 3, PICK_TOLERANCE, PICK_TOLERANCE);
        for (const picked of pickedObjects) {
          if (picked.id && picked.id.properties && picked.id.properties.hasProperty('norad_id')) {
            pickedObject = picked;
            break;
          }
        }
      }
      
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        if (entity.properties && entity.properties.hasProperty('norad_id')) {
          const entityId = entity.id;
          if (hoveredEntityRef.current !== entityId) {
            // Update hovered entity
            const prevHovered = hoveredEntityRef.current;
            hoveredEntityRef.current = entityId;
            
            // Stop previous pulse animation
            if (pulseAnimationRef.current) {
              cancelAnimationFrame(pulseAnimationRef.current);
              pulseAnimationRef.current = null;
            }
            
            // Update previous hovered entity appearance - restore to base size
            if (prevHovered) {
              const prevEntity = entitiesRef.current.get(prevHovered);
              if (prevEntity?.point) {
                prevEntity.point.pixelSize = SATELLITE_SIZE_BASE;
                prevEntity.point.outlineWidth = 0;
                if (prevEntity.label) {
                  // Hide label when not hovered (unless selected)
                  const isSelected = selectedSatellite?.norad_id === prevEntity.properties?.norad_id?.getValue();
                  prevEntity.label.show = isSelected;
                }
              }
            }
            
            // Update current hovered entity appearance - larger size with bright glow effect
            if (entity.point) {
              entity.point.pixelSize = SATELLITE_SIZE_HOVER;
              entity.point.outlineWidth = 3;
              entity.point.outlineColor = Cesium.Color.YELLOW;
              if (entity.label) {
                entity.label.show = true;
              }
              
              // Start pulse animation for hovered satellite - moderate effect
              let pulsePhase = 0;
              const pulseAnimation = () => {
                if (!entity.point || hoveredEntityRef.current !== entityId) return;
                pulsePhase += 0.15; // Moderate pulse speed
                const pulse = Math.sin(pulsePhase) * 0.2 + 1; // Oscillates between 0.8 and 1.2
                entity.point.pixelSize = SATELLITE_SIZE_HOVER * pulse;
                entity.point.outlineWidth = 2 + Math.sin(pulsePhase) * 1;
                // Subtle outline color change
                entity.point.outlineColor = Cesium.Color.YELLOW;
                viewer.scene.requestRender();
                pulseAnimationRef.current = requestAnimationFrame(pulseAnimation);
              };
              pulseAnimationRef.current = requestAnimationFrame(pulseAnimation);
            }
            
            // Change cursor
            viewer.container.style.cursor = 'pointer';
            viewer.scene.requestRender();
          }
        }
      } else {
        // Not hovering over any satellite - restore appearance
        if (hoveredEntityRef.current) {
          // Stop pulse animation
          if (pulseAnimationRef.current) {
            cancelAnimationFrame(pulseAnimationRef.current);
            pulseAnimationRef.current = null;
          }
          
          const prevEntity = entitiesRef.current.get(hoveredEntityRef.current);
          if (prevEntity?.point) {
            const isSelected = selectedSatellite?.norad_id === prevEntity.properties?.norad_id?.getValue();
            if (!isSelected) {
              prevEntity.point.pixelSize = SATELLITE_SIZE_BASE;
              prevEntity.point.outlineWidth = 0;
              if (prevEntity.label) {
                // Hide label when not hovered and not selected
                prevEntity.label.show = false;
              }
            }
          }
          hoveredEntityRef.current = null;
          viewer.container.style.cursor = 'grab'; // Reset to default grab cursor
          viewer.scene.requestRender();
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    return () => {
      handler.destroy();
      // Clean up pulse animation on unmount
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
        pulseAnimationRef.current = null;
      }
    };
  }, [viewer, selectSatellite, setSelectedSatellite, orbitSatellites, toggleOrbitSatellite, selectedSatellite, showLabels]);
  
  return null;
};

// Export inclination colors for use in legend
export { INCLINATION_COLORS, getInclinationColor };
export default React.memo(SatelliteLayer);
