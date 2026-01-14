/**
 * ConstellationLabel - Large watermark showing current constellation name
 * Displayed in top-left corner like satellitemap.space
 */
import React from 'react';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/ConstellationLabel.css';

const ConstellationLabel = () => {
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  
  // Show the first selected constellation name
  const constellationName = selectedConstellations.length > 0 
    ? selectedConstellations[0] 
    : 'satellites';
  
  return (
    <div className="constellation-label">
      {constellationName}
    </div>
  );
};

export default ConstellationLabel;
