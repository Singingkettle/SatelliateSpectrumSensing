/**
 * StatusBar - Displays current status information
 */
import React from 'react';
import { useSatelliteStore } from '../../store/satelliteStore';
import { useUiStore } from '../../store/uiStore';
import '../../styles/StatusBar.css';

const StatusBar = () => {
  const totalSatellitesLoaded = useSatelliteStore(s => s.totalSatellitesLoaded);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const loading = useSatelliteStore(s => s.loading);
  const loadingConstellations = useSatelliteStore(s => s.loadingConstellations);
  
  const sceneMode = useUiStore(s => s.sceneMode);
  const lightingEnabled = useUiStore(s => s.lightingEnabled);
  
  const isLoading = loading || Object.values(loadingConstellations).some(Boolean);
  
  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-label">Satellites:</span>
        <span className="status-value">
          {isLoading ? 'Loading...' : totalSatellitesLoaded.toLocaleString()}
        </span>
      </div>
      
      <div className="status-item">
        <span className="status-label">Constellations:</span>
        <span className="status-value">{selectedConstellations.length}</span>
      </div>
      
      <div className="status-item">
        <span className="status-label">View:</span>
        <span className="status-value">{sceneMode}</span>
      </div>
      
      <div className="status-item">
        <span className="status-label">Lighting:</span>
        <span className="status-value">{lightingEnabled ? 'On' : 'Off'}</span>
      </div>
    </div>
  );
};

export default React.memo(StatusBar);
