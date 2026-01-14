/**
 * SatelliteDetailPanel - Displays detailed satellite information
 * Shows when a satellite is selected - styled to match satellitemap.space
 * Uses Cesium clock time for position updates
 */
import React, { useMemo, useCallback } from 'react';
import { useSatelliteStore } from '../../store/satelliteStore';
import { useTimeStore } from '../../store/timeStore';
import * as satellite from 'satellite.js';
import '../../styles/SatelliteDetailPanel.css';

/**
 * Get inclination classification
 */
const getInclinationClass = (inclination) => {
  if (inclination === undefined || inclination === null) return 'low';
  const inc = Math.abs(inclination);
  if (inc < 30) return 'equatorial';
  if (inc < 60) return 'low';
  if (inc < 90) return 'medium';
  if (inc < 120) return 'high';
  return 'retrograde';
};

/**
 * Get orbit type description
 */
const getOrbitType = (apogee, perigee, inclination) => {
  if (!apogee || !perigee) return 'Unknown';
  const avgAlt = (apogee + perigee) / 2;
  
  if (avgAlt > 35000) return 'GEO';
  if (avgAlt > 2000) return 'MEO';
  if (avgAlt > 160) return 'LEO';
  return 'Very Low';
};

const SatelliteDetailPanel = () => {
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const clearSatelliteSelection = useSatelliteStore(s => s.clearSatelliteSelection);
  const showOrbits = useSatelliteStore(s => s.showOrbits);
  const setShowOrbits = useSatelliteStore(s => s.setShowOrbits);
  
  // Get current time from timeStore (synced with Cesium clock)
  const currentTime = useTimeStore(s => s.currentTime);
  
  // Calculate current position based on Cesium clock time
  const currentPosition = useMemo(() => {
    if (!selectedSatellite?.line1 || !selectedSatellite?.line2) {
      if (!selectedSatellite?.tle_line1 || !selectedSatellite?.tle_line2) {
        return null;
      }
    }
    
    try {
      const line1 = selectedSatellite.line1 || selectedSatellite.tle_line1;
      const line2 = selectedSatellite.line2 || selectedSatellite.tle_line2;
      const satrec = satellite.twoline2satrec(line1, line2);
      // Use currentTime from timeStore (synced with Cesium clock)
      const posVel = satellite.propagate(satrec, currentTime);
      
      if (!posVel.position) return null;
      
      const gmst = satellite.gstime(currentTime);
      const posGd = satellite.eciToGeodetic(posVel.position, gmst);
      
      // Calculate velocity magnitude (km/s)
      const vel = posVel.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      
      return {
        latitude: satellite.degreesLat(posGd.latitude),
        longitude: satellite.degreesLong(posGd.longitude),
        altitude: posGd.height,
        speed: speed,
      };
    } catch {
      return null;
    }
  }, [selectedSatellite, currentTime]);
  
  // Handle copy TLE to clipboard
  const handleCopyTLE = useCallback(() => {
    if (!selectedSatellite) return;
    const line1 = selectedSatellite.line1 || selectedSatellite.tle_line1;
    const line2 = selectedSatellite.line2 || selectedSatellite.tle_line2;
    const tle = `${selectedSatellite.name}\n${line1}\n${line2}`;
    navigator.clipboard.writeText(tle);
  }, [selectedSatellite]);
  
  // Handle fly to satellite
  const handleFlyTo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('flyToSatellite', { 
      detail: { norad_id: selectedSatellite?.norad_id } 
    }));
  }, [selectedSatellite]);
  
  if (!selectedSatellite) return null;
  
  const formatNumber = (num, decimals = 2) => {
    if (num === undefined || num === null) return 'N/A';
    return Number(num).toFixed(decimals);
  };
  
  const formatCoord = (coord, isLat = true) => {
    if (coord === undefined || coord === null) return 'N/A';
    const abs = Math.abs(coord);
    const dir = isLat ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${abs.toFixed(4)}° ${dir}`;
  };
  
  const inclinationClass = getInclinationClass(selectedSatellite.inclination);
  const orbitType = getOrbitType(
    selectedSatellite.apogee_km,
    selectedSatellite.perigee_km,
    selectedSatellite.inclination
  );
  
  return (
    <div className="satellite-detail-panel animate-slideInRight">
      {/* Header */}
      <div className="satellite-header">
        <div className="satellite-header-top">
          <h2 className="satellite-name">{selectedSatellite.name}</h2>
          <button 
            className="satellite-close"
            onClick={clearSatelliteSelection}
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="satellite-badges">
          <span className={`satellite-badge badge-${inclinationClass}`}>
            {inclinationClass.charAt(0).toUpperCase() + inclinationClass.slice(1)}
          </span>
          <span className="satellite-badge badge-orbit">{orbitType}</span>
          <span className={`satellite-badge ${selectedSatellite.is_active !== false ? 'badge-active' : 'badge-inactive'}`}>
            {selectedSatellite.is_active !== false ? 'Operational' : 'Inactive'}
          </span>
        </div>
        <div className="satellite-norad-row">
          <span className="satellite-norad-label">NORAD ID:</span>
          <span className="satellite-norad-value">{selectedSatellite.norad_id}</span>
        </div>
      </div>
      
      {/* Body */}
      <div className="satellite-body">
        {/* Current Position */}
        {currentPosition && (
          <div className="satellite-section satellite-section-position">
            <h3 className="satellite-section-title">
              <span className="section-icon">📍</span>
              Current Position
            </h3>
            <div className="position-grid">
              <div className="position-item">
                <span className="position-label">Latitude</span>
                <span className="position-value">
                  {formatCoord(currentPosition.latitude, true)}
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">Longitude</span>
                <span className="position-value">
                  {formatCoord(currentPosition.longitude, false)}
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">Altitude</span>
                <span className="position-value highlight">
                  {formatNumber(currentPosition.altitude, 1)} km
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">Speed</span>
                <span className="position-value highlight">
                  {formatNumber(currentPosition.speed, 2)} km/s
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Orbital Parameters */}
        <div className="satellite-section">
          <h3 className="satellite-section-title">
            <span className="section-icon">🌍</span>
            Orbital Elements
          </h3>
          <div className="orbital-grid">
            <div className="orbital-item">
              <span className="orbital-label">Inclination</span>
              <span className={`orbital-value inc-${inclinationClass}`}>
                {formatNumber(selectedSatellite.inclination)}°
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">Period</span>
              <span className="orbital-value">
                {formatNumber(selectedSatellite.period_minutes)} min
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">Apogee</span>
              <span className="orbital-value">
                {formatNumber(selectedSatellite.apogee_km, 1)} km
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">Perigee</span>
              <span className="orbital-value">
                {formatNumber(selectedSatellite.perigee_km, 1)} km
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">Eccentricity</span>
              <span className="orbital-value mono">
                {formatNumber(selectedSatellite.eccentricity, 7)}
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">Mean Motion</span>
              <span className="orbital-value">
                {formatNumber(selectedSatellite.mean_motion, 4)} rev/day
              </span>
            </div>
          </div>
        </div>
        
        {/* Identification */}
        <div className="satellite-section">
          <h3 className="satellite-section-title">
            <span className="section-icon">🔖</span>
            Identification
          </h3>
          <div className="id-grid">
            <div className="id-item">
              <span className="id-label">NORAD Catalog #</span>
              <span className="id-value">{selectedSatellite.norad_id}</span>
            </div>
            {selectedSatellite.intl_designator && (
              <div className="id-item">
                <span className="id-label">Int'l Designator</span>
                <span className="id-value">{selectedSatellite.intl_designator}</span>
              </div>
            )}
            {selectedSatellite.constellation && (
              <div className="id-item">
                <span className="id-label">Constellation</span>
                <span className="id-value constellation-tag">
                  {selectedSatellite.constellation}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* TLE Data */}
        {(selectedSatellite.tle_line1 || selectedSatellite.line1) && (
          <div className="satellite-section satellite-section-tle">
            <h3 className="satellite-section-title">
              <span className="section-icon">📡</span>
              TLE Data
            </h3>
            <div className="tle-container">
              <code className="tle-line">
                {selectedSatellite.tle_line1 || selectedSatellite.line1}
              </code>
              <code className="tle-line">
                {selectedSatellite.tle_line2 || selectedSatellite.line2}
              </code>
            </div>
            {selectedSatellite.tle_updated && (
              <div className="tle-updated">
                Updated: {new Date(selectedSatellite.tle_updated).toLocaleString()}
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="satellite-actions">
          <button 
            className="action-btn action-btn-primary"
            onClick={handleFlyTo}
            title="Fly to satellite"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="22" y2="12"/>
            </svg>
            Track
          </button>
          <button 
            className={`action-btn ${showOrbits ? 'action-btn-active' : ''}`}
            onClick={() => setShowOrbits(!showOrbits)}
            title="Toggle orbit path visibility"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            {showOrbits ? 'Hide Orbit' : 'Show Orbit'}
          </button>
          <button 
            className="action-btn"
            onClick={handleCopyTLE}
            title="Copy TLE data to clipboard"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy TLE
          </button>
        </div>
      </div>
    </div>
  );
};

export default SatelliteDetailPanel;
