import React, { useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import SatelliteEntityManager from './SatelliteEntityManager';
import { useConstellationStore } from '../store/constellationStore';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Y2Q0YTI2OC01MGYzLTRhOGEtYTVkYi04ZWMyZWQzY2YxNjIiLCJpZCI6MTUzMjk0LCJpYXQiOjE2ODkyMTYwOTF9.fMWg2AegsO1Ontmb1YC1fR9g6gSenOv85ILOe1vD5YU';

const chinaCameraPosition = Cesium.Cartesian3.fromDegrees(104.0, 36.0, 10000000.0);

const CesiumViewer = () => {
  const viewerRef = useRef(null);
  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);

  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      viewer.camera.flyTo({
        destination: chinaCameraPosition,
        duration: 0,
      });
    }
  }, []);

  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement && startTime && endTime) {
      const viewer = viewerRef.current.cesiumElement;
      const start = Cesium.JulianDate.fromDate(startTime);
      const stop = Cesium.JulianDate.fromDate(endTime);

      viewer.clock.startTime = start;
      viewer.clock.stopTime = stop;
      viewer.clock.currentTime = start;
      viewer.clock.shouldAnimate = true;

      if (viewer.timeline) {
        viewer.timeline.zoomTo(start, stop);
      }
    }
  }, [startTime, endTime]);

  return (
    <Viewer 
      ref={viewerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      timeline={true}
      animation={true}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      navigationHelpButton={false}
      sceneModePicker={false}
      selectionIndicator={true}
    >
      <SatelliteEntityManager />
    </Viewer>
  );
};

export default CesiumViewer;