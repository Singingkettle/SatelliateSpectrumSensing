import React, { useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import SatelliteEntityManager from './SatelliteEntityManager';
import StatusDisplay from './StatusDisplay';
import '../styles/CesiumViewer.css'; // Import the new component
import { useConstellationStore } from '../store/constellationStore';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Y2Q0YTI2OC01MGYzLTRhOGEtYTVkYi04ZWMyZWQzY2YxNjIiLCJpZCI6MTUzMjk0LCJpYXQiOjE2ODkyMTYwOTF9.fMWg2AegsO1Ontmb1YC1fR9g6gSenOv85ILOe1vD5YU';

const chinaCameraPosition = Cesium.Cartesian3.fromDegrees(104.0, 36.0, 10000000.0);

const CesiumViewer = () => {
  const viewerRef = useRef(null);
  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);

  // Effect for initial camera position
  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      viewer.camera.flyTo({
        destination: chinaCameraPosition,
        duration: 0,
      });
    }
  }, []);

  // Effect to synchronize component state with Cesium clock
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

      if (viewer.timeline) {
        viewer.timeline.zoomTo(start, stop);
      }
    }
  }, [startTime, endTime]);

  // Effect to disable the "Today" button
  useEffect(() => {
    if (viewerRef.current && viewerRef.current.cesiumElement && viewerRef.current.cesiumElement.timeline) {
      const viewer = viewerRef.current.cesiumElement;

      // Wait for the timeline to be fully initialized
      const checkTimeline = () => {
        if (viewer.timeline && viewer.timeline.viewModel) {
          // Disable the "Today" button by removing its functionality
          const timelineViewModel = viewer.timeline.viewModel;

          // Override the setTime function to prevent "Today" button from working
          const originalSetTime = timelineViewModel.setTime;
          timelineViewModel.setTime = function (time) {
            // Only allow manual time setting, not the "Today" button
            if (viewer.clock.clockRange !== Cesium.ClockRange.UNBOUNDED) {
              originalSetTime.call(timelineViewModel, time);
            }
            // If it's the "Today" button (UNBOUNDED), we simply ignore it
          };

          // Also try to hide the "Today" button if possible
          setTimeout(() => {
            const todayButton = viewer.timeline.container.querySelector('.cesium-timeline-todayButton');
            if (todayButton) {
              todayButton.style.display = 'none';
            }
          }, 100);
        } else {
          // If timeline is not ready yet, try again in a short while
          setTimeout(checkTimeline, 50);
        }
      };

      checkTimeline();
    }
  }, []);

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
