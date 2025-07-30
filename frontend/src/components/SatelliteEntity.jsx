import React, { useEffect, useState, useRef } from 'react';
import { Entity, PointGraphics } from 'resium';
import * as Cesium from 'cesium';
import { useConstellationStore } from '../store/constellationStore';
import { orbitCalculator } from '../services/OrbitCalculator';

const SatelliteEntity = ({ tle, name, constellationName }) => {
  const [position, setPosition] = useState(null);
  const isCalculating = useRef(false);

  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);
  const getConstellationColor = useConstellationStore((state) => state.getConstellationColor);

  const color = getConstellationColor(constellationName);

  useEffect(() => {
    if (isCalculating.current) return;

    if (tle && startTime && endTime) {
      isCalculating.current = true;
      const computedPosition = orbitCalculator.computeSampledPosition({
        tle,
        startTime,
        endTime,
      });
      setPosition(computedPosition);
    }
  }, [tle, startTime, endTime]);

  if (!position) {
    return null;
  }

  return (
    <Entity name={name} position={position}>
      <PointGraphics pixelSize={8} color={color} />
    </Entity>
  );
};

export default SatelliteEntity;