/**
 * SatelliteLayer - Renders satellites on the globe
 * Uses inclination-based color coding matching satellitemap.space
 * 
 * PERFORMANCE OPTIMIZED for 6000+ satellites using:
 * - PointPrimitiveCollection (much faster than Entities)
 * - Batch position updates with chunked SGP4 calculations
 * - Reduced update frequency for smooth performance
 */
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useSatelliteStore } from '../../store/satelliteStore';
import * as satellite from 'satellite.js';

// Satellite marker sizes - matching satellitemap.space (very small dots)
const SATELLITE_SIZE_BASE = 3;        // Small base size like satellitemap.space
const SATELLITE_SIZE_HOVER = 8;       // Moderate size on hover
const SATELLITE_SIZE_SELECTED = 10;   // Selected satellite - stands out

// Performance tuning constants
const POSITION_UPDATE_INTERVAL = 200;  // Update every 200ms (5 FPS for positions)
const BATCH_SIZE = 500;                // Process satellites in batches
const PICK_THROTTLE_MS = 50;           // Throttle hover picking

// Picking tolerance - how close (in pixels) mouse needs to be to pick
const PICK_TOLERANCE = 15;

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
 */
const getInclinationColor = (inclination) => {
  if (inclination === undefined || inclination === null) {
    return INCLINATION_COLORS.low;
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
 */
const extractInclination = (line2) => {
  try {
    const incStr = line2.substring(8, 16).trim();
    return parseFloat(incStr);
  } catch {
    return 53;
  }
};

/**
 * Calculate satellite position from TLE at given time
 * Returns Cartesian3 directly for performance
 */
const getSatelliteCartesian = (satrec, time, gmst) => {
  try {
    const positionAndVelocity = satellite.propagate(satrec, time);
    if (!positionAndVelocity.position) return null;
    
    // Convert ECI to ECF (Earth-fixed)
    const ecf = satellite.eciToEcf(positionAndVelocity.position, gmst);
    if (!ecf || isNaN(ecf.x)) return null;
    
    // Convert km to meters and return Cartesian3
    return new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000);
  } catch {
    return null;
  }
};

/**
 * Pre-calculate ECI orbit positions for orbit display
 */
const precalculateOrbitEci = (line1, line2, centerTime, periodMinutes = null, numPoints = 360) => {
  try {
    if (!line1 || !line2) return [];
    
    const satrec = satellite.twoline2satrec(line1, line2);
    if (!satrec || satrec.error) return [];
    
    const meanMotion = satrec.no * 1440 / (2 * Math.PI);
    const calculatedPeriod = periodMinutes || (1440 / meanMotion);
    
    const eciPoints = [];
    const halfPeriod = calculatedPeriod / 2;
    const stepMinutes = calculatedPeriod / numPoints;
    const startTime = new Date(centerTime.getTime() - halfPeriod * 60000);
    
    for (let i = 0; i <= numPoints; i++) {
      const time = new Date(startTime.getTime() + i * stepMinutes * 60000);
      const positionAndVelocity = satellite.propagate(satrec, time);
      
      if (positionAndVelocity.position && !isNaN(positionAndVelocity.position.x)) {
        eciPoints.push({
          position: positionAndVelocity.position,
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

const SatelliteLayer = () => {
  const { viewer } = useCesium();
  
  // Refs for high-performance rendering
  const pointCollectionRef = useRef(null);        // PointPrimitiveCollection
  const pointMapRef = useRef(new Map());          // norad_id -> point primitive
  const satrecCacheRef = useRef(new Map());       // norad_id -> satrec (cached)
  const lastUpdateRef = useRef(0);
  const lastPickRef = useRef(0);
  
  // Refs for orbit display
  const orbitEntitiesRef = useRef(new Map());
  const orbitEciPointsRef = useRef(new Map());
  
  // Refs for selection/hover state
  const hoveredNoradIdRef = useRef(null);
  const labelEntityRef = useRef(null);            // Single label entity for hover/selected
  const selectedLabelEntityRef = useRef(null);    // Label for selected satellite
  
  // Store state
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellationData = useSatelliteStore(s => s.constellationData);
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const orbitSatellites = useSatelliteStore(s => s.orbitSatellites);
  const selectSatellite = useSatelliteStore(s => s.selectSatellite);
  const setSelectedSatellite = useSatelliteStore(s => s.setSelectedSatellite);
  const toggleOrbitSatellite = useSatelliteStore(s => s.toggleOrbitSatellite);
  
  // Get all satellites with pre-computed data
  const satellites = useMemo(() => {
    const allSats = [];
    for (const slug of selectedConstellations) {
      const data = constellationData[slug];
      if (data?.satellites) {
        data.satellites.forEach(sat => {
          if (!sat.line1 || !sat.line2) return;
          
          const inclination = sat.inclination || (sat.line2 ? extractInclination(sat.line2) : 53);
          const color = getInclinationColor(inclination);
          
          allSats.push({
            norad_id: sat.norad_id,
            name: sat.name,
            line1: sat.line1,
            line2: sat.line2,
            constellation: slug,
            inclination,
            color,
          });
        });
      }
    }
    return allSats;
  }, [selectedConstellations, constellationData]);
  
  // Initialize PointPrimitiveCollection
  useEffect(() => {
    if (!viewer) return;
    
    // Create PointPrimitiveCollection for high-performance rendering
    const pointCollection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(pointCollection);
    pointCollectionRef.current = pointCollection;
    
    console.log('[SatelliteLayer] PointPrimitiveCollection initialized');
    
    return () => {
      if (viewer && !viewer.isDestroyed() && pointCollection) {
        viewer.scene.primitives.remove(pointCollection);
      }
      pointMapRef.current.clear();
      satrecCacheRef.current.clear();
    };
  }, [viewer]);
  
  // Main satellite rendering and position updates
  useEffect(() => {
    if (!viewer || !pointCollectionRef.current) return;
    
    const pointCollection = pointCollectionRef.current;
    const pointMap = pointMapRef.current;
    const satrecCache = satrecCacheRef.current;
    
    // Clear existing points and cache when satellites change
    pointCollection.removeAll();
    pointMap.clear();
    satrecCache.clear();
    
    // Pre-compute satrec for all satellites (one-time cost)
    for (const sat of satellites) {
      try {
        const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
        if (satrec && !satrec.error) {
          satrecCache.set(sat.norad_id, satrec);
        }
      } catch {
        // Skip invalid TLE
      }
    }
    
    console.log(`[SatelliteLayer] Processing ${satellites.length} satellites, ${satrecCache.size} valid TLEs`);
    
    // Initial position calculation and point creation
    const currentTime = viewer.clock?.currentTime 
      ? Cesium.JulianDate.toDate(viewer.clock.currentTime)
      : new Date();
    const gmst = satellite.gstime(currentTime);
    
    for (const sat of satellites) {
      const satrec = satrecCache.get(sat.norad_id);
      if (!satrec) continue;
      
      const position = getSatelliteCartesian(satrec, currentTime, gmst);
      if (!position) continue;
      
      // Create point primitive
      const point = pointCollection.add({
        position: position,
        pixelSize: SATELLITE_SIZE_BASE,
        color: sat.color,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
        outlineWidth: 0.5,
        disableDepthTestDistance: 0, // Allow earth occlusion
      });
      
      // Store reference with satellite data
      point._satelliteData = sat;
      pointMap.set(sat.norad_id, point);
    }
    
    console.log(`[SatelliteLayer] Created ${pointMap.size} point primitives`);
    
    // Position update function - called periodically
    const updatePositions = () => {
      if (!viewer || viewer.isDestroyed() || !viewer.clock) return;
      
      const now = Date.now();
      if (now - lastUpdateRef.current < POSITION_UPDATE_INTERVAL) return;
      lastUpdateRef.current = now;
      
      const cesiumTime = viewer.clock.currentTime;
      const jsTime = Cesium.JulianDate.toDate(cesiumTime);
      const gmst = satellite.gstime(jsTime);
      
      // Batch update positions
      let updated = 0;
      for (const [noradId, point] of pointMap) {
        const satrec = satrecCache.get(noradId);
        if (!satrec) continue;
        
        const newPosition = getSatelliteCartesian(satrec, jsTime, gmst);
        if (newPosition) {
          point.position = newPosition;
          updated++;
        }
      }
      
      viewer.scene.requestRender();
    };
    
    // Use scene.preUpdate for efficient updates
    const removeListener = viewer.scene.preUpdate.addEventListener(updatePositions);
    
    // Force initial render
    viewer.scene.requestRender();
    
    return () => {
      removeListener();
    };
  }, [viewer, satellites]);
  
  // Handle selected satellite highlighting
  useEffect(() => {
    if (!viewer || !pointCollectionRef.current) return;
    
    const pointMap = pointMapRef.current;
    
    // Reset all points to base size
    for (const [noradId, point] of pointMap) {
      const isSelected = selectedSatellite?.norad_id === noradId;
      point.pixelSize = isSelected ? SATELLITE_SIZE_SELECTED : SATELLITE_SIZE_BASE;
      point.outlineWidth = isSelected ? 2 : 0.5;
      point.outlineColor = isSelected ? Cesium.Color.CYAN : Cesium.Color.WHITE.withAlpha(0.3);
    }
    
    // Update/create selected satellite label
    if (selectedLabelEntityRef.current) {
      try {
        viewer.entities.remove(selectedLabelEntityRef.current);
      } catch (e) {}
      selectedLabelEntityRef.current = null;
    }
    
    if (selectedSatellite) {
      const point = pointMap.get(selectedSatellite.norad_id);
      if (point) {
        // Create label entity for selected satellite
        selectedLabelEntityRef.current = viewer.entities.add({
          position: new Cesium.CallbackProperty(() => point.position, false),
          label: {
            text: selectedSatellite.name,
            font: '14px "Segoe UI", Arial, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.8)'),
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(8, 5),
          },
        });
      }
    }
    
    viewer.scene.requestRender();
  }, [viewer, selectedSatellite]);
  
  // Handle orbit displays
  useEffect(() => {
    if (!viewer) return;
    
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
      }
    }
    
    // Add new orbits
    for (const [noradId, sat] of orbitSatellites) {
      if (orbitEntitiesRef.current.has(noradId)) continue;
      if (!sat.line1 || !sat.line2) continue;
      
      const currentTime = viewer.clock?.currentTime 
        ? Cesium.JulianDate.toDate(viewer.clock.currentTime)
        : new Date();
      
      const eciPoints = precalculateOrbitEci(sat.line1, sat.line2, currentTime, null, 360);
      orbitEciPointsRef.current.set(noradId, eciPoints);
      
      if (eciPoints.length > 2) {
        const capturedNoradId = noradId;
        
        const positionsCallback = new Cesium.CallbackProperty((time) => {
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
      }
    }
    
    viewer.scene.requestRender();
    
    return () => {
      // Cleanup handled in main unmount effect
    };
  }, [viewer, orbitSatellites]);
  
  // Click and hover handlers
  useEffect(() => {
    if (!viewer || !pointCollectionRef.current) return;
    
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const pointCollection = pointCollectionRef.current;
    const pointMap = pointMapRef.current;
    
    // Helper to find satellite point near position
    const findSatelliteAtPosition = (screenPosition) => {
      // Use scene.pick for point primitives
      const pickedObject = viewer.scene.pick(screenPosition);
      
      if (Cesium.defined(pickedObject) && pickedObject.primitive === pointCollection) {
        // Find which point was picked by checking proximity
        const ray = viewer.camera.getPickRay(screenPosition);
        if (!ray) return null;
        
        // Get the picked point's satellite data
        if (pickedObject.id !== undefined) {
          // Cesium assigns sequential IDs to primitives
          const pointIndex = pickedObject.id;
          const points = [];
          for (let i = 0; i < pointCollection.length; i++) {
            points.push(pointCollection.get(i));
          }
          if (pointIndex < points.length) {
            const point = points[pointIndex];
            if (point._satelliteData) {
              return point._satelliteData;
            }
          }
        }
      }
      
      // Fallback: manual proximity check for better picking
      let closestSat = null;
      let closestDistance = PICK_TOLERANCE * 2;
      
      for (const [noradId, point] of pointMap) {
        if (!point.position || !point._satelliteData) continue;
        
        // Use worldToWindowCoordinates (newer Cesium API)
        const screenPos = Cesium.SceneTransforms.worldToWindowCoordinates(
          viewer.scene, point.position
        );
        if (!screenPos) continue;
        
        const dx = screenPos.x - screenPosition.x;
        const dy = screenPos.y - screenPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < PICK_TOLERANCE && distance < closestDistance) {
          closestDistance = distance;
          closestSat = point._satelliteData;
        }
      }
      
      return closestSat;
    };
    
    // Click handler - toggle orbit
    handler.setInputAction((movement) => {
      const satData = findSatelliteAtPosition(movement.position);
      
      if (satData) {
        const hasOrbit = orbitSatellites.has(satData.norad_id);
        console.log('[SatelliteLayer] Click on:', satData.name, 'hasOrbit:', hasOrbit);
        
        if (hasOrbit) {
          toggleOrbitSatellite(satData);
          if (selectedSatellite?.norad_id === satData.norad_id) {
            setSelectedSatellite(null);
          }
        } else {
          setSelectedSatellite(satData);
        }
      } else {
        // Clicked empty space
        setSelectedSatellite(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
    // Hover handler with throttling
    handler.setInputAction((movement) => {
      const now = Date.now();
      if (now - lastPickRef.current < PICK_THROTTLE_MS) return;
      lastPickRef.current = now;
      
      const satData = findSatelliteAtPosition(movement.endPosition);
      const newHoveredId = satData?.norad_id || null;
      
      if (newHoveredId !== hoveredNoradIdRef.current) {
        // Restore previous hovered point
        if (hoveredNoradIdRef.current) {
          const prevPoint = pointMap.get(hoveredNoradIdRef.current);
          if (prevPoint && hoveredNoradIdRef.current !== selectedSatellite?.norad_id) {
            prevPoint.pixelSize = SATELLITE_SIZE_BASE;
            prevPoint.outlineWidth = 0.5;
            prevPoint.outlineColor = Cesium.Color.WHITE.withAlpha(0.3);
          }
        }
        
        // Remove hover label
        if (labelEntityRef.current) {
          try {
            viewer.entities.remove(labelEntityRef.current);
          } catch (e) {}
          labelEntityRef.current = null;
        }
        
        hoveredNoradIdRef.current = newHoveredId;
        
        // Highlight new hovered point
        if (newHoveredId && newHoveredId !== selectedSatellite?.norad_id) {
          const point = pointMap.get(newHoveredId);
          if (point) {
            point.pixelSize = SATELLITE_SIZE_HOVER;
            point.outlineWidth = 2;
            point.outlineColor = Cesium.Color.YELLOW;
            
            // Create hover label
            labelEntityRef.current = viewer.entities.add({
              position: new Cesium.CallbackProperty(() => point.position, false),
              label: {
                text: satData.name,
                font: '12px "Segoe UI", Arial, sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -12),
                backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.7)'),
                showBackground: true,
                backgroundPadding: new Cesium.Cartesian2(6, 4),
              },
            });
          }
        }
        
        // Update cursor
        viewer.container.style.cursor = newHoveredId ? 'pointer' : 'grab';
        viewer.scene.requestRender();
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    return () => {
      handler.destroy();
      if (labelEntityRef.current) {
        try {
          viewer.entities.remove(labelEntityRef.current);
        } catch (e) {}
        labelEntityRef.current = null;
      }
    };
  }, [viewer, selectedSatellite, orbitSatellites, setSelectedSatellite, toggleOrbitSatellite]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewer && !viewer.isDestroyed()) {
        // Remove orbit entities
        for (const entity of orbitEntitiesRef.current.values()) {
          try {
            viewer.entities.remove(entity);
          } catch (e) {}
        }
        orbitEntitiesRef.current.clear();
        orbitEciPointsRef.current.clear();
        
        // Remove label entities
        if (labelEntityRef.current) {
          try {
            viewer.entities.remove(labelEntityRef.current);
          } catch (e) {}
        }
        if (selectedLabelEntityRef.current) {
          try {
            viewer.entities.remove(selectedLabelEntityRef.current);
          } catch (e) {}
        }
      }
    };
  }, [viewer]);
  
  return null;
};

// Export inclination colors for use in legend
export { INCLINATION_COLORS, getInclinationColor };
export default React.memo(SatelliteLayer);
