import React, { useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import SatelliteEntityManager from './SatelliteEntityManager';
import StatusDisplay from './StatusDisplay';
import InfoBoxOverlay from './InfoBoxOverlay';
import '../styles/CesiumViewer.css';
import { useConstellationStore } from '../store/constellationStore';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Y2Q0YTI2OC01MGYzLTRhOGEtYTVkYi04ZWMyZWQzY2YxNjIiLCJpZCI6MTUzMjk0LCJpYXQiOjE2ODkyMTYwOTF9.fMWg2AegsO1Ontmb1YC1fR9g6gSenOv85ILOe1vD5YU';

const chinaCameraPosition = Cesium.Cartesian3.fromDegrees(104.0, 36.0, 10000000.0);

const applyLighting = (viewer, lightingEnabled) => {
  const scene = viewer.scene
  scene.requestRenderMode = true
  scene.maximumRenderTimeChange = 1 / 30

  // Atmosphere and HDR
  scene.skyAtmosphere = scene.skyAtmosphere || new Cesium.SkyAtmosphere()
  scene.skyAtmosphere.show = true
  if (scene.skyAtmosphere && 'dynamicAtmosphereLighting' in scene.skyAtmosphere) {
    scene.skyAtmosphere.dynamicAtmosphereLighting = true
    scene.skyAtmosphere.dynamicAtmosphereLightingFromSun = true
  }
  scene.highDynamicRange = true

  // Celestial lights
  scene.sun = scene.sun || new Cesium.Sun()
  scene.sun.show = true
  scene.moon = scene.moon || new Cesium.Moon()
  scene.moon.show = true
  scene.light = new Cesium.SunLight()

  if (scene.globe) scene.globe.enableLighting = !!lightingEnabled

  // Ensure time is set so the Sun position is valid
  if (!viewer.clock.currentTime) viewer.clock.currentTime = Cesium.JulianDate.now()
  viewer.clock.shouldAnimate = true

  scene.requestRender()
}

const CesiumViewer = () => {
  const viewerRef = useRef(null);
  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);
  const lightingEnabled = useConstellationStore((s) => s.lightingEnabled)
  const sceneMode = useConstellationStore((s) => s.sceneMode)

  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      viewer.camera.flyTo({ destination: chinaCameraPosition, duration: 0 });

      applyLighting(viewer, lightingEnabled)

      if (window.devicePixelRatio && window.devicePixelRatio > 1.5) viewer.resolutionScale = 0.7;
    }
  }, []);

  useEffect(() => {
    const v = viewerRef.current?.cesiumElement
    if (!v) return
    // Re-apply lighting configuration reactively
    applyLighting(v, lightingEnabled)
    if (sceneMode === '2D' && v.scene.mode !== Cesium.SceneMode.SCENE2D) v.scene.morphTo2D(0.5)
    if (sceneMode === '3D' && v.scene.mode !== Cesium.SceneMode.SCENE3D) v.scene.morphTo3D(0.5)
    v.scene.requestRender()
  }, [lightingEnabled, sceneMode])

  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement && startTime && endTime) {
      const viewer = viewerRef.current.cesiumElement;
      const start = Cesium.JulianDate.fromDate(startTime);
      const stop = Cesium.JulianDate.fromDate(endTime);

      if (!Cesium.JulianDate.equals(viewer.clock.startTime, start) ||
        !Cesium.JulianDate.equals(viewer.clock.stopTime, stop)) {
        viewer.clock.startTime = start;
        viewer.clock.stopTime = stop;
        viewer.clock.currentTime = start;
        viewer.clock.shouldAnimate = true;
      }
      if (viewer.timeline) viewer.timeline.zoomTo(start, stop);
      viewer.scene.requestRender();
    }
  }, [startTime, endTime]);

  return (
    <Viewer
      ref={viewerRef}
      className="viewer-container"
      timeline={true}
      animation={true}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      navigationHelpButton={false}
      sceneModePicker={false}
      selectionIndicator={true}
      infoBox={false}
    >
      <StatusDisplay />
      <SatelliteEntityManager />
      <InfoBoxOverlay />
    </Viewer>
  );
};

export default CesiumViewer;
