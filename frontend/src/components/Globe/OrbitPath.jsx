import React, { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useSatelliteStore } from '../../store/satelliteStore';
import * as satellite from 'satellite.js';

const OrbitPath = () => {
  const { viewer } = useCesium();
  const entityRef = useRef(null);
  
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  
  useEffect(() => {
    if (!viewer || !selectedSatellite || !selectedSatellite.line1) {
      if (entityRef.current) {
        viewer.entities.remove(entityRef.current);
        entityRef.current = null;
      }
      return;
    }
    
    try {
      const satrec = satellite.twoline2satrec(selectedSatellite.line1, selectedSatellite.line2);
      
      // Calculate orbit path (past 45 mins, future 45 mins)
      const property = new Cesium.SampledPositionProperty();
      const start = Cesium.JulianDate.addMinutes(viewer.clock.currentTime, -45, new Cesium.JulianDate());
      const stop = Cesium.JulianDate.addMinutes(viewer.clock.currentTime, 45, new Cesium.JulianDate());
      
      // 1 minute steps
      for (let i = 0; i <= 90; i++) {
        const time = Cesium.JulianDate.addMinutes(start, i, new Cesium.JulianDate());
        const jsTime = Cesium.JulianDate.toDate(time);
        
        const positionAndVelocity = satellite.propagate(satrec, jsTime);
        if (positionAndVelocity.position) {
          const gmst = satellite.gstime(jsTime);
          const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
          
          const position = Cesium.Cartesian3.fromDegrees(
            satellite.degreesLong(positionGd.longitude),
            satellite.degreesLat(positionGd.latitude),
            positionGd.height * 1000
          );
          
          property.addSample(time, position);
        }
      }
      
      // Interpolation
      property.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
      });
      
      if (entityRef.current) {
        viewer.entities.remove(entityRef.current);
      }
      
      entityRef.current = viewer.entities.add({
        position: property,
        path: {
          resolution: 60,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.1,
            color: Cesium.Color.CYAN,
          }),
          width: 2,
          leadTime: 45 * 60,
          trailTime: 45 * 60,
        },
      });
      
    } catch (e) {
      console.error("Error calculating orbit path", e);
    }
    
    return () => {
      if (entityRef.current && viewer && !viewer.isDestroyed()) {
        viewer.entities.remove(entityRef.current);
        entityRef.current = null;
      }
    };
  }, [viewer, selectedSatellite]); // Re-run when selected satellite changes
  
  return null;
};

export default OrbitPath;
