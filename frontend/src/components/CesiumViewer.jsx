import React, { useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import SatelliteEntityManager from './SatelliteEntityManager';
import StatusDisplay from './StatusDisplay';
import '../styles/CesiumViewer.css';
import { useConstellationStore } from '../store/constellationStore';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Y2Q0YTI2OC01MGYzLTRhOGEtYTVkYi04ZWMyZWQzY2YxNjIiLCJpZCI6MTUzMjk0LCJpYXQiOjE2ODkyMTYwOTF9.fMWg2AegsO1Ontmb1YC1fR9g6gSenOv85ILOe1vD5YU';

const chinaCameraPosition = Cesium.Cartesian3.fromDegrees(104.0, 36.0, 10000000.0);

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

      // Render & performance
      viewer.scene.requestRenderMode = true;
      viewer.scene.maximumRenderTimeChange = 1 / 30;

      // Atmosphere & lighting for day/night terminator
      viewer.scene.skyAtmosphere.show = true;
      // Ensure sun/moon exist and visible
      viewer.scene.sun = viewer.scene.sun || new Cesium.Sun();
      viewer.scene.sun.show = true;
      viewer.scene.moon = viewer.scene.moon || new Cesium.Moon();
      viewer.scene.moon.show = true;
      // Use sunlight model
      if (Cesium.SunLight) viewer.scene.light = new Cesium.SunLight();

      viewer.clock.shouldAnimate = true;
      if (window.devicePixelRatio && window.devicePixelRatio > 1.5) viewer.resolutionScale = 0.7;
    }
  }, []);

  // Handles day/night lighting effect
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer?.scene?.globe) {
      viewer.scene.globe.enableLighting = !!lightingEnabled;
      viewer.scene.requestRender();
    }
  }, [lightingEnabled]);

  // Handles 2D/3D scene mode changes
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      const targetMode = sceneMode === '2D' ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D;
      if (viewer.scene.mode !== targetMode) {
        if (targetMode === Cesium.SceneMode.SCENE2D) {
          viewer.scene.morphTo2D(0.5);
        } else {
          viewer.scene.morphTo3D(0.5);
        }
        viewer.scene.requestRender();
      }
    }
  }, [sceneMode]);

  // Sync clock interval
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
    >
      <StatusDisplay />
      <SatelliteEntityManager />
    </Viewer>
  );
};

export default CesiumViewer;
