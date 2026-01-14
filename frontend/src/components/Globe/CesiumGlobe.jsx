/**
 * CesiumGlobe - Main 3D globe component with dark space theme
 * High-performance satellite visualization using CesiumJS
 * Styled to match satellitemap.space aesthetic
 * 
 * Integrates with timeStore for synchronized time control
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import { useTimeStore } from '../../store/timeStore';
import SatelliteLayer from './SatelliteLayer';
import GroundStationLayer from './GroundStationLayer';
import '../../styles/CesiumViewer.css';

// Cesium Ion token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Y2Q0YTI2OC01MGYzLTRhOGEtYTVkYi04ZWMyZWQzY2YxNjIiLCJpZCI6MTUzMjk0LCJpYXQiOjE2ODkyMTYwOTF9.fMWg2AegsO1Ontmb1YC1fR9g6gSenOv85ILOe1vD5YU';

// Initial camera position (Africa centered like satellitemap.space)
const INITIAL_CAMERA = {
  destination: Cesium.Cartesian3.fromDegrees(20.0, 10.0, 25000000.0),
  orientation: {
    heading: 0,
    pitch: -Cesium.Math.PI_OVER_TWO,
    roll: 0,
  },
};

// Dark space theme colors
const THEME_COLORS = {
  background: Cesium.Color.fromCssColorString('#0a0a0a'),
  globe: Cesium.Color.fromCssColorString('#1a1a2e'),
  globeBase: Cesium.Color.fromCssColorString('#0f1729'),
  water: Cesium.Color.fromCssColorString('#0a1628'),
  atmosphere: Cesium.Color.fromCssColorString('#1a3a5c'),
  gridLine: Cesium.Color.fromCssColorString('rgba(255, 140, 60, 0.15)'),
};

/**
 * Apply dark space theme settings to the viewer
 */
const applySpaceTheme = (viewer) => {
  const scene = viewer.scene;
  const globe = scene.globe;

  // Performance settings
  // IMPORTANT: We need continuous ticking so satellites move with the clock.
  // `requestRenderMode` can prevent Cesium's clock from advancing unless renders are triggered.
  // satellitemap.space behaves like a continuously-animating scene.
  scene.requestRenderMode = false;
  scene.maximumRenderTimeChange = Infinity; // Allow any time jump

  // Set dark background color
  scene.backgroundColor = THEME_COLORS.background;

  // Configure globe appearance for dark theme
  if (globe) {
    // Enable lighting for realistic day/night
    globe.enableLighting = false; // Disabled for consistent dark look
    
    // Set base color (visible where there's no imagery)
    globe.baseColor = THEME_COLORS.globeBase;
    
    // Adjust globe material for darker look
    globe.showGroundAtmosphere = false;
    globe.atmosphereLightIntensity = 5.0;
    globe.atmosphereRayleighScaleHeight = 10000;
    globe.atmosphereMieScaleHeight = 3200;
    
    // Enable depth testing against terrain
    globe.depthTestAgainstTerrain = false;
    
    // Translucency settings for underwater visibility
    globe.translucency.enabled = false;
  }

  // Configure atmosphere for subtle glow
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.hueShift = -0.1;
    scene.skyAtmosphere.saturationShift = -0.5;
    scene.skyAtmosphere.brightnessShift = -0.4;
    
    // Atmosphere scattering settings for dark look
    if ('atmosphereLightIntensity' in scene.skyAtmosphere) {
      scene.skyAtmosphere.atmosphereLightIntensity = 5.0;
    }
  }

  // HDR and lighting
  scene.highDynamicRange = false;
  
  // Hide sun and moon for cleaner look
  if (scene.sun) {
    scene.sun.show = false;
  }
  if (scene.moon) {
    scene.moon.show = false;
  }

  // Configure skybox for stars
  if (scene.skyBox) {
    scene.skyBox.show = true;
  }

  // Use uniform lighting (no sun light)
  scene.light = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(1, 0, 0),
    intensity: 0.3,
  });

  // Set fog for depth effect
  scene.fog.enabled = true;
  scene.fog.density = 0.00002;
  scene.fog.screenSpaceErrorFactor = 4;

  // Enable anti-aliasing
  scene.postProcessStages.fxaa.enabled = true;

  // Set time to current and start animation
  viewer.clock.currentTime = Cesium.JulianDate.now();
  viewer.clock.shouldAnimate = true;
  viewer.clock.multiplier = 1.0;
  // Ensure clock advances using system time and multiplier
  viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
  
  console.log('[CesiumGlobe] Clock initialized:', {
    currentTime: Cesium.JulianDate.toDate(viewer.clock.currentTime),
    shouldAnimate: viewer.clock.shouldAnimate,
    multiplier: viewer.clock.multiplier,
    clockStep: viewer.clock.clockStep,
    requestRenderMode: scene.requestRenderMode,
  });

  scene.requestRender();
};

/**
 * Apply simple dark globe style like satellitemap.space
 * Ocean = dark blue, Land = slightly lighter gray-blue
 */
const applyDarkImagery = async (viewer) => {
  const imageryLayers = viewer.imageryLayers;
  
  // Remove default imagery - we want a clean dark globe
  imageryLayers.removeAll();
  
  // Set the globe base color to dark blue (ocean color like satellitemap.space)
  // This creates the solid dark blue appearance for the OCEAN
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1929');
  
  // Disable globe lighting for consistent dark appearance
  viewer.scene.globe.enableLighting = false;
  
  console.log('[CesiumGlobe] Dark globe style applied (ocean base)');
};

// Land polygons removed - using coastlines/borders to distinguish land from ocean
// This matches satellitemap.space approach which uses lines, not filled polygons

/**
 * Add coastlines AND country borders as simple polylines
 * Using Natural Earth 110m simplified datasets (lines only)
 * This creates the same effect as satellitemap.space
 */
const addCountryBorders = async (viewer, dataSourceRef) => {
  const dataSources = [];
  
  try {
    // 1. Load COASTLINES first - this shows land/ocean boundary
    console.log('[CesiumGlobe] Loading coastlines...');
    const coastlineUrl = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_coastline.geojson';
    
    const coastlineDataSource = await Cesium.GeoJsonDataSource.load(coastlineUrl, {
      stroke: Cesium.Color.fromCssColorString('rgba(150, 160, 180, 0.6)'),
      strokeWidth: 1.5,
      clampToGround: false,
    });
    
    // Style coastlines - brighter to clearly distinguish land from ocean
    const coastlineEntities = coastlineDataSource.entities.values;
    for (const entity of coastlineEntities) {
      if (entity.polyline) {
        entity.polyline.material = Cesium.Color.fromCssColorString('rgba(140, 150, 170, 0.8)');
        entity.polyline.width = 1.5;
      }
    }
    
    viewer.dataSources.add(coastlineDataSource);
    dataSources.push(coastlineDataSource);
    console.log('[CesiumGlobe] Coastlines loaded:', coastlineEntities.length, 'lines');
    
    // 2. Load COUNTRY BORDERS (inland boundaries between countries)
    console.log('[CesiumGlobe] Loading country borders...');
    const borderUrl = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_boundary_lines_land.geojson';
    
    const borderDataSource = await Cesium.GeoJsonDataSource.load(borderUrl, {
      stroke: Cesium.Color.fromCssColorString('rgba(120, 130, 150, 0.5)'),
      strokeWidth: 1,
      clampToGround: false,
    });
    
    // Style country borders - slightly dimmer than coastlines
    const borderEntities = borderDataSource.entities.values;
    for (const entity of borderEntities) {
      if (entity.polyline) {
        entity.polyline.material = Cesium.Color.fromCssColorString('rgba(120, 130, 150, 0.6)');
        entity.polyline.width = 1;
      }
    }
    
    viewer.dataSources.add(borderDataSource);
    dataSources.push(borderDataSource);
    console.log('[CesiumGlobe] Country borders loaded:', borderEntities.length, 'lines');
    
    // Store both data sources in ref as an array
    dataSourceRef.current = dataSources;
    
    return dataSources;
  } catch (e) {
    console.warn('[CesiumGlobe] Failed to load borders/coastlines:', e);
    
    // Fallback: try just coastlines
    try {
      const fallbackUrl = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_coastline.geojson';
      
      const dataSource = await Cesium.GeoJsonDataSource.load(fallbackUrl, {
        stroke: Cesium.Color.fromCssColorString('rgba(150, 160, 180, 0.6)'),
        strokeWidth: 1.5,
        clampToGround: false,
      });
      
      viewer.dataSources.add(dataSource);
      dataSourceRef.current = [dataSource];
      console.log('[CesiumGlobe] Coastlines loaded as fallback');
      return [dataSource];
    } catch (e2) {
      console.warn('[CesiumGlobe] Fallback coastlines also failed:', e2);
      return null;
    }
  }
};

/**
 * Add grid lines to the globe
 */
const addGridLines = (viewer) => {
  const scene = viewer.scene;
  
  // Add graticule (lat/lon grid)
  // This creates the orange-tinted grid lines visible in satellitemap.space
  const gridMaterial = new Cesium.GridMaterialProperty({
    color: Cesium.Color.fromCssColorString('rgba(255, 140, 60, 0.08)'),
    cellAlpha: 0.0,
    lineCount: new Cesium.Cartesian2(36, 18), // 10-degree grid
    lineThickness: new Cesium.Cartesian2(1.0, 1.0),
    lineOffset: new Cesium.Cartesian2(0, 0),
  });

  // We'll handle grid differently - through scene primitives
  // For now, the globe shows country borders from imagery
};

const CesiumGlobe = () => {
  const viewerRef = useRef(null);
  const initRef = useRef(false);
  const clockSyncRef = useRef(null);
  const autoRotateRef = useRef(null);
  const lastAppliedStoreTimeRef = useRef(0);
  const borderDataSourceRef = useRef(null);
  
  // Create stable credit container reference to avoid Viewer recreation
  const creditContainerRef = useRef(null);
  if (creditContainerRef.current === null && typeof document !== 'undefined') {
    creditContainerRef.current = document.createElement('div');
  }
  
  // UI Store
  const sceneMode = useUiStore(s => s.sceneMode);
  const showGrid = useUiStore(s => s.showGrid);
  const lightingEnabled = useUiStore(s => s.lightingEnabled);
  const showAtmosphere = useUiStore(s => s.showAtmosphere);
  const showBorders = useUiStore(s => s.showBorders);
  
  // Satellite Store
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const selectSatellite = useSatelliteStore(s => s.selectSatellite);
  
  // Time Store
  const isPlaying = useTimeStore(s => s.isPlaying);
  const speedMultiplier = useTimeStore(s => s.speedMultiplier);
  const setCurrentTime = useTimeStore(s => s.setCurrentTime);
  const storeCurrentTime = useTimeStore(s => s.currentTime);
  
  // Reset camera to initial position
  const resetCameraView = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: INITIAL_CAMERA.destination,
      orientation: INITIAL_CAMERA.orientation,
      duration: 1.5,
    });
  }, []);
  
  // Take screenshot
  const takeScreenshot = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    viewer.render();
    const canvas = viewer.scene.canvas;
    const dataUrl = canvas.toDataURL('image/png');
    
    // Create download link
    const link = document.createElement('a');
    link.download = `changshuospace-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, []);
  
  // Initialize viewer on mount - separate effect with proper dependencies
  useEffect(() => {
    let tickListener = null;
    
    // Add a small delay to ensure Cesium viewer is fully ready
    const initTimer = setTimeout(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) {
        console.log('[CesiumGlobe] Viewer not ready yet');
        return;
      }
      if (initRef.current) {
        console.log('[CesiumGlobe] Already initialized, skipping');
        return;
      }
      
      console.log('[CesiumGlobe] Starting initialization...');
      initRef.current = true;
      
      // Set initial camera position
      viewer.camera.setView(INITIAL_CAMERA);
      
      // Apply space theme
      applySpaceTheme(viewer);
      
      // Apply dark imagery (simple dark globe - sets ocean color)
      applyDarkImagery(viewer);
      
      // Add country borders and coastlines (loaded async)
      // Coastlines clearly distinguish land from ocean
      addCountryBorders(viewer, borderDataSourceRef);
      
      // Add grid lines
      addGridLines(viewer);
      
      // Optimize for high-DPI displays and performance
      if (window.devicePixelRatio > 1.5) {
        viewer.resolutionScale = 0.85;
      }
      
      // Performance optimizations for large constellations
      const scene = viewer.scene;
      scene.globe.tileCacheSize = 100;
      scene.globe.maximumScreenSpaceError = 2;
      scene.fxaa = false;
      scene.globe.depthTestAgainstTerrain = false;
      
      console.log('[CesiumGlobe] Performance optimizations applied');
      
      // Disable automatic camera tracking but allow selection
      viewer.trackedEntity = undefined;
      
      // Set up clock tick listener to sync time back to store
      tickListener = (clock) => {
        const jsDate = Cesium.JulianDate.toDate(clock.currentTime);
        setCurrentTime(jsDate);
      };
      viewer.clock.onTick.addEventListener(tickListener);
      
      console.log('[CesiumGlobe] Clock tick listener registered');
      
      // Backup interval to ensure time updates
      clockSyncRef.current = setInterval(() => {
        if (viewer && !viewer.isDestroyed() && viewer.clock) {
          const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
          setCurrentTime(jsDate);
        }
      }, 100);
    }, 100); // Small delay to ensure Cesium is ready
    
    // Cleanup function
    return () => {
      clearTimeout(initTimer);
      
      // Clean up clock sync interval
      if (clockSyncRef.current) {
        clearInterval(clockSyncRef.current);
        clockSyncRef.current = null;
      }
      
      // Remove tick listener
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed() && viewer.clock && tickListener) {
        viewer.clock.onTick.removeEventListener(tickListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Sync timeStore state to Cesium clock
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed() || !viewer.clock) return;
    
    // Update animation state
    viewer.clock.shouldAnimate = isPlaying;
    
    // Update clock multiplier
    viewer.clock.multiplier = speedMultiplier;
    
    viewer.scene.requestRender();
  }, [isPlaying, speedMultiplier]);

  // Sync timeStore currentTime -> Cesium clock when user changes time (reset/jump/step).
  // Avoid feedback loops by only applying when drift is significant.
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed() || !viewer.clock || !storeCurrentTime) return;

    const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const driftMs = Math.abs(clockDate.getTime() - storeCurrentTime.getTime());

    // If store time matches clock (normal case), do nothing.
    // If user changed store time (e.g. reset/jump), apply to Cesium clock.
    if (driftMs > 1500) {
      // Prevent spamming: only apply once per distinct requested time.
      const requestedMs = storeCurrentTime.getTime();
      if (lastAppliedStoreTimeRef.current !== requestedMs) {
        lastAppliedStoreTimeRef.current = requestedMs;
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(storeCurrentTime);
        viewer.scene.requestRender();
      }
    }
  }, [storeCurrentTime]);
  
  // Listen for custom events from BottomToolbar
  useEffect(() => {
    const handleResetCamera = () => resetCameraView();
    const handleScreenshot = () => takeScreenshot();
    
    const handleToggleAutoRotate = (event) => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) return;
      
      const enabled = event.detail?.enabled;
      
      if (enabled) {
        // Start auto-rotation
        const rotateAmount = 0.5; // degrees per frame
        autoRotateRef.current = setInterval(() => {
          viewer.camera.rotateRight(Cesium.Math.toRadians(rotateAmount / 60));
          viewer.scene.requestRender();
        }, 16); // ~60fps
      } else {
        // Stop auto-rotation
        if (autoRotateRef.current) {
          clearInterval(autoRotateRef.current);
          autoRotateRef.current = null;
        }
      }
    };
    
    window.addEventListener('resetCameraView', handleResetCamera);
    window.addEventListener('takeScreenshot', handleScreenshot);
    window.addEventListener('toggleAutoRotate', handleToggleAutoRotate);
    
    return () => {
      window.removeEventListener('resetCameraView', handleResetCamera);
      window.removeEventListener('takeScreenshot', handleScreenshot);
      window.removeEventListener('toggleAutoRotate', handleToggleAutoRotate);
      
      // Clean up auto-rotate
      if (autoRotateRef.current) {
        clearInterval(autoRotateRef.current);
      }
    };
  }, [resetCameraView, takeScreenshot]);
  
  // Update grid visibility - use a ref to track the grid primitive
  const gridPrimitiveRef = useRef(null);
  
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    // Remove existing grid if present
    if (gridPrimitiveRef.current) {
      try {
        viewer.scene.primitives.remove(gridPrimitiveRef.current);
      } catch (e) {
        // Ignore removal errors
      }
      gridPrimitiveRef.current = null;
    }
    
    // Add grid if enabled
    if (showGrid) {
      try {
        // Create graticule (lat/lon grid lines)
        const gridLines = [];
        // Use more visible orange color for grid
        const gridColor = Cesium.Color.fromCssColorString('rgba(255, 140, 60, 0.4)');
        
        // Longitude lines (every 30 degrees)
        for (let lon = -180; lon <= 180; lon += 30) {
          const positions = [];
          for (let lat = -90; lat <= 90; lat += 5) {
            positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
          }
          gridLines.push(positions);
        }
        
        // Latitude lines (every 30 degrees)
        for (let lat = -60; lat <= 60; lat += 30) {
          const positions = [];
          for (let lon = -180; lon <= 180; lon += 5) {
            positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
          }
          gridLines.push(positions);
        }
        
        // Create geometry instances for all grid lines
        const instances = gridLines.map((positions, index) => {
          return new Cesium.GeometryInstance({
            geometry: new Cesium.PolylineGeometry({
              positions: positions,
              width: 1.0,
            }),
            id: `grid-line-${index}`,
          });
        });
        
        // Create the primitive with polyline appearance
        gridPrimitiveRef.current = viewer.scene.primitives.add(
          new Cesium.Primitive({
            geometryInstances: instances,
            appearance: new Cesium.PolylineMaterialAppearance({
              material: Cesium.Material.fromType('Color', {
                color: gridColor,
              }),
            }),
            asynchronous: false,
          })
        );
        console.log('Grid created successfully with', gridLines.length, 'lines');
      } catch (e) {
        console.warn('Failed to create grid:', e);
      }
    }
    
    viewer.scene.requestRender();
    
    return () => {
      // Cleanup grid on unmount
      if (gridPrimitiveRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(gridPrimitiveRef.current);
        } catch (e) {
          // Ignore
        }
        gridPrimitiveRef.current = null;
      }
    };
  }, [showGrid]);
  
  // Update scene mode (2D/3D)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    if (sceneMode === '2D' && viewer.scene.mode !== Cesium.SceneMode.SCENE2D) {
      viewer.scene.morphTo2D(0.5);
    } else if (sceneMode === '3D' && viewer.scene.mode !== Cesium.SceneMode.SCENE3D) {
      viewer.scene.morphTo3D(0.5);
    }
  }, [sceneMode]);
  
  // Update lighting
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    if (viewer.scene.globe) {
      viewer.scene.globe.enableLighting = lightingEnabled;
    }
    
    if (viewer.scene.sun) {
      viewer.scene.sun.show = lightingEnabled;
    }
    if (viewer.scene.moon) {
      viewer.scene.moon.show = lightingEnabled;
    }
    
    viewer.scene.requestRender();
  }, [lightingEnabled]);
  
  // Handle atmosphere/sky toggle
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = showAtmosphere;
    }
    if (viewer.scene.globe) {
      viewer.scene.globe.showGroundAtmosphere = showAtmosphere;
    }
    
    viewer.scene.requestRender();
  }, [showAtmosphere]);
  
  // Handle country borders toggle (coastlines + borders)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    // Toggle border visibility - handle both single dataSource and array
    const dataSources = borderDataSourceRef.current;
    if (dataSources) {
      if (Array.isArray(dataSources)) {
        // Multiple data sources (coastlines + borders)
        dataSources.forEach(ds => {
          if (ds) ds.show = showBorders;
        });
      } else {
        // Single data source
        dataSources.show = showBorders;
      }
      viewer.scene.requestRender();
      console.log('[CesiumGlobe] Borders/Coastlines visibility:', showBorders);
    }
  }, [showBorders]);
  
  // DON'T fly to selected satellite - keep camera centered on Earth
  // useEffect(() => {
  //   const viewer = viewerRef.current?.cesiumElement;
  //   if (!viewer || !selectedSatellite) return;
  //   
  //   // Find entity by NORAD ID
  //   const entities = viewer.entities.values;
  //   for (const entity of entities) {
  //     if (entity.properties?.norad_id?.getValue() === selectedSatellite.norad_id) {
  //       viewer.flyTo(entity, { duration: 1.5 });
  //       break;
  //     }
  //   }
  // }, [selectedSatellite]);
  
  return (
    <div className="globe-wrapper">
      <Viewer
        ref={viewerRef}
        className="cesium-viewer-dark"
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        navigationHelpButton={false}
        sceneModePicker={false}
        selectionIndicator={true}
        infoBox={false}
        fullscreenButton={false}
        vrButton={false}
        creditContainer={creditContainerRef.current} // Hide credits (stable ref)
        shouldAnimate={true} // Force clock animation
        requestRenderMode={false} // Force continuous rendering
      >
        <SatelliteLayer />
        <GroundStationLayer />
      </Viewer>
    </div>
  );
};

export default React.memo(CesiumGlobe);
