/**
 * GroundStationLayer - Renders ground stations on the globe
 * Styled to match satellitemap.space appearance
 */
import React, { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useSatelliteStore } from '../../store/satelliteStore';

// Ground station marker styling - small red squares like satellitemap.space
const STATION_COLOR = Cesium.Color.fromCssColorString('#e74c3c'); // Red
const STATION_SIZE = 5;
const STATION_SIZE_HOVER = 8;

const GroundStationLayer = () => {
  const { viewer } = useCesium();
  const entitiesRef = useRef(new Map());
  const hoveredRef = useRef(null);
  
  const groundStations = useSatelliteStore(s => s.groundStations);
  const showGroundStations = useSatelliteStore(s => s.showGroundStations);
  
  useEffect(() => {
    if (!viewer) return;
    
    // Clear existing stations if visibility is off
    if (!showGroundStations) {
      for (const entity of entitiesRef.current.values()) {
        viewer.entities.remove(entity);
      }
      entitiesRef.current.clear();
      return;
    }
    
    const existingIds = new Set(entitiesRef.current.keys());
    const newIds = new Set();
    
    // Add or update stations
    for (const station of groundStations) {
      const id = `station-${station.id}`;
      newIds.add(id);
      
      let entity = entitiesRef.current.get(id);
      
      if (!entity) {
        entity = viewer.entities.add({
          id,
          name: station.name,
          position: Cesium.Cartesian3.fromDegrees(
            station.longitude,
            station.latitude,
            (station.altitude_m || 0) + 1000 // Slightly above ground
          ),
          billboard: {
            image: createStationIcon(),
            width: STATION_SIZE,
            height: STATION_SIZE,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500000, 2.0, 15000000, 0.5),
          },
          label: {
            text: station.name,
            font: '10px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 8),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: false, // Only show on hover
          },
          properties: {
            type: 'ground_station',
            station_id: station.id,
            country: station.country,
            city: station.city,
            operator: station.operator,
          },
        });
        
        entitiesRef.current.set(id, entity);
      }
    }
    
    // Remove old stations
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        const entity = entitiesRef.current.get(id);
        if (entity) {
          viewer.entities.remove(entity);
          entitiesRef.current.delete(id);
        }
      }
    }
    
    viewer.scene.requestRender();
  }, [viewer, groundStations, showGroundStations]);
  
  // Hover handler
  useEffect(() => {
    if (!viewer || !showGroundStations) return;
    
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    
    handler.setInputAction((movement) => {
      const pickedObject = viewer.scene.pick(movement.endPosition);
      
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        if (entity.properties?.type?.getValue() === 'ground_station') {
          const entityId = entity.id;
          
          if (hoveredRef.current !== entityId) {
            // Reset previous hover
            if (hoveredRef.current) {
              const prevEntity = entitiesRef.current.get(hoveredRef.current);
              if (prevEntity?.label) {
                prevEntity.label.show = false;
              }
              if (prevEntity?.billboard) {
                prevEntity.billboard.width = STATION_SIZE;
                prevEntity.billboard.height = STATION_SIZE;
              }
            }
            
            // Set new hover
            hoveredRef.current = entityId;
            if (entity.label) {
              entity.label.show = true;
            }
            if (entity.billboard) {
              entity.billboard.width = STATION_SIZE_HOVER;
              entity.billboard.height = STATION_SIZE_HOVER;
            }
            
            viewer.scene.requestRender();
          }
        }
      } else if (hoveredRef.current) {
        // Reset hover when not over a station
        const prevEntity = entitiesRef.current.get(hoveredRef.current);
        if (prevEntity?.label) {
          prevEntity.label.show = false;
        }
        if (prevEntity?.billboard) {
          prevEntity.billboard.width = STATION_SIZE;
          prevEntity.billboard.height = STATION_SIZE;
        }
        hoveredRef.current = null;
        viewer.scene.requestRender();
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    return () => {
      handler.destroy();
    };
  }, [viewer, showGroundStations]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewer) {
        for (const entity of entitiesRef.current.values()) {
          viewer.entities.remove(entity);
        }
        entitiesRef.current.clear();
      }
    };
  }, [viewer]);
  
  return null;
};

/**
 * Create a small square icon for ground stations
 */
function createStationIcon() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  
  // Draw red square with white border
  ctx.fillStyle = '#e74c3c';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.rect(2, 2, 12, 12);
  ctx.fill();
  ctx.stroke();
  
  return canvas.toDataURL();
}

export default React.memo(GroundStationLayer);
