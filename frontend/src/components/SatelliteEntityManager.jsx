import React from 'react';
import { useConstellationStore } from '../store/constellationStore';
import SatelliteEntity from './SatelliteEntity';

const SatelliteEntityManager = () => {
  const selectedSatellites = useConstellationStore((state) => state.selectedSatellites);
  const tleData = useConstellationStore((state) => state.tleData);

  const allSelected = Object.entries(selectedSatellites).flatMap(([constellationName, satNames]) => {
    const constellationTles = tleData[constellationName] || [];
    return satNames.map(name => {
      const satData = constellationTles.find(sat => sat.name === name);
      // Pass the constellationName down to the entity
      return satData ? { ...satData, tle: `${satData.name}\n${satData.line1}\n${satData.line2}`, constellationName } : null;
    });
  }).filter(Boolean); // Filter out any nulls if data not found

  return (
    <>
      {allSelected.map(sat => (
        <SatelliteEntity key={sat.name} name={sat.name} tle={sat.tle} constellationName={sat.constellationName} />
      ))}
    </>
  );
};

export default SatelliteEntityManager;
