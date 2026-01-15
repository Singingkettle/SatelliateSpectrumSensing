/**
 * SatelliteDetailPanel - Displays detailed satellite information
 * Shows when a satellite is selected - styled to match satellitemap.space
 * Uses Cesium clock time for position updates
 */
import React, { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSatelliteStore } from '../../store/satelliteStore';
import { useTimeStore } from '../../store/timeStore';
import * as satellite from 'satellite.js';
import AltitudeHistoryChart from './AltitudeHistoryChart';
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
const getOrbitType = (apogee, perigee) => {
  if (!apogee || !perigee) return 'unknown';
  const avgAlt = (apogee + perigee) / 2;
  
  if (avgAlt > 35000) return 'geo';
  if (avgAlt > 2000) return 'meo';
  if (avgAlt > 160) return 'leo';
  return 'veryLow';
};

const SatelliteDetailPanel = () => {
  const { t } = useTranslation();
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const clearSatelliteSelection = useSatelliteStore(s => s.clearSatelliteSelection);
  const showOrbits = useSatelliteStore(s => s.showOrbits);
  const setShowOrbits = useSatelliteStore(s => s.setShowOrbits);
  
  const [showHistory, setShowHistory] = useState(false);
  
  // Get current time from timeStore (synced with Cesium clock)
  const currentTime = useTimeStore(s => s.currentTime);
  
  // Derive orbital parameters from TLE when missing (avoids N/A in UI)
  const derivedOrbit = useMemo(() => {
    if (!selectedSatellite) return null;
    const line1 = selectedSatellite.line1 || selectedSatellite.tle_line1;
    const line2 = selectedSatellite.line2 || selectedSatellite.tle_line2;
    if (!line1 || !line2) return null;

    try {
      // satrec fields: no (rad/min), inclo (rad), ecco, etc.
      const satrec = satellite.twoline2satrec(line1, line2);

      // Mean motion (revs/day) from no (rad/min): rev/day = no * 1440 / (2*pi)
      const meanMotionRevPerDay =
        typeof satrec.no === 'number' && isFinite(satrec.no)
          ? (satrec.no * 1440.0) / (2.0 * Math.PI)
          : null;

      const periodMinutes =
        meanMotionRevPerDay && meanMotionRevPerDay > 0
          ? 1440.0 / meanMotionRevPerDay
          : null;

      const inclinationDeg =
        typeof satrec.inclo === 'number' && isFinite(satrec.inclo)
          ? (satrec.inclo * 180.0) / Math.PI
          : null;

      const eccentricity =
        typeof satrec.ecco === 'number' && isFinite(satrec.ecco) ? satrec.ecco : null;

      // Semi-major axis (km) from mean motion: n(rad/s) = no(rad/min) / 60
      // a = (mu / n^2)^(1/3)
      const muKm3s2 = 398600.4418;
      const earthRadiusKm = 6378.137;
      const nRadPerSec =
        typeof satrec.no === 'number' && isFinite(satrec.no) ? satrec.no / 60.0 : null;
      const semiMajorAxisKm =
        nRadPerSec && nRadPerSec > 0 ? Math.cbrt(muKm3s2 / (nRadPerSec * nRadPerSec)) : null;

      const apogeeKm =
        semiMajorAxisKm != null && eccentricity != null
          ? semiMajorAxisKm * (1 + eccentricity) - earthRadiusKm
          : null;
      const perigeeKm =
        semiMajorAxisKm != null && eccentricity != null
          ? semiMajorAxisKm * (1 - eccentricity) - earthRadiusKm
          : null;

      return {
        periodMinutes,
        meanMotionRevPerDay,
        inclinationDeg,
        eccentricity,
        semiMajorAxisKm,
        apogeeKm,
        perigeeKm,
      };
    } catch {
      return null;
    }
  }, [selectedSatellite]);

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

  const getValue = (direct, derived) =>
    direct !== undefined && direct !== null && !Number.isNaN(direct) ? direct : derived;
  
  const formatCoord = (coord, isLat = true) => {
    if (coord === undefined || coord === null) return 'N/A';
    const abs = Math.abs(coord);
    const dir = isLat ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${abs.toFixed(4)}° ${dir}`;
  };
  
  const displayInclination = getValue(
    selectedSatellite.inclination,
    derivedOrbit?.inclinationDeg
  );
  const displayApogee = getValue(selectedSatellite.apogee_km, derivedOrbit?.apogeeKm);
  const displayPerigee = getValue(selectedSatellite.perigee_km, derivedOrbit?.perigeeKm);
  const displayEcc = getValue(selectedSatellite.eccentricity, derivedOrbit?.eccentricity);
  const displayMeanMotion = getValue(
    selectedSatellite.mean_motion,
    derivedOrbit?.meanMotionRevPerDay
  );
  const displayPeriod = getValue(selectedSatellite.period_minutes, derivedOrbit?.periodMinutes);

  const inclinationClass = getInclinationClass(displayInclination);
  const orbitType = getOrbitType(displayApogee, displayPerigee);
  
  return (
    <div className="satellite-detail-panel animate-slideInRight">
      {/* Header */}
      <div className="satellite-header">
        <div className="satellite-header-top">
          <h2 className="satellite-name">{selectedSatellite.name}</h2>
          <button 
            className="satellite-close"
            onClick={clearSatelliteSelection}
            title={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="satellite-badges">
          <span className={`satellite-badge badge-${inclinationClass}`}>
            {t(`inclinationType.${inclinationClass}`)}
          </span>
          <span className="satellite-badge badge-orbit">{t(`orbitType.${orbitType}`)}</span>
          <span className={`satellite-badge ${selectedSatellite.is_active !== false ? 'badge-active' : 'badge-inactive'}`}>
            {selectedSatellite.is_active !== false ? t('common.operational') : t('common.inactive')}
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
              {t('satellite.currentPosition')}
            </h3>
            <div className="position-grid">
              <div className="position-item">
                <span className="position-label">{t('satellite.latitude')}</span>
                <span className="position-value">
                  {formatCoord(currentPosition.latitude, true)}
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">{t('satellite.longitude')}</span>
                <span className="position-value">
                  {formatCoord(currentPosition.longitude, false)}
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">{t('satellite.altitude')}</span>
                <span className="position-value highlight">
                  {formatNumber(currentPosition.altitude, 1)} {t('units.km')}
                </span>
              </div>
              <div className="position-item">
                <span className="position-label">{t('satellite.speed')}</span>
                <span className="position-value highlight">
                  {formatNumber(currentPosition.speed, 2)} {t('units.kmPerSec')}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Orbital Parameters */}
        <div className="satellite-section">
          <h3 className="satellite-section-title">
            <span className="section-icon">🌍</span>
            {t('satellite.orbitalElements')}
          </h3>
          <div className="orbital-grid">
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.inclination')}</span>
              <span className={`orbital-value inc-${inclinationClass}`}>
                {formatNumber(displayInclination)}°
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.period')}</span>
              <span className="orbital-value">
                {formatNumber(displayPeriod)} {t('units.min')}
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.apogee')}</span>
              <span className="orbital-value">
                {formatNumber(displayApogee, 1)} {t('units.km')}
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.perigee')}</span>
              <span className="orbital-value">
                {formatNumber(displayPerigee, 1)} {t('units.km')}
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.eccentricity')}</span>
              <span className="orbital-value mono">
                {formatNumber(displayEcc, 7)}
              </span>
            </div>
            <div className="orbital-item">
              <span className="orbital-label">{t('satellite.meanMotion')}</span>
              <span className="orbital-value">
                {formatNumber(displayMeanMotion, 4)} {t('units.revPerDay')}
              </span>
            </div>
          </div>
        </div>
        
        {/* Identification */}
        <div className="satellite-section">
          <h3 className="satellite-section-title">
            <span className="section-icon">🔖</span>
            {t('satellite.identification')}
          </h3>
          <div className="id-grid">
            <div className="id-item">
              <span className="id-label">{t('satellite.noradCatalog')}</span>
              <span className="id-value">{selectedSatellite.norad_id}</span>
            </div>
            {selectedSatellite.intl_designator && (
              <div className="id-item">
                <span className="id-label">{t('satellite.intlDesignator')}</span>
                <span className="id-value">{selectedSatellite.intl_designator}</span>
              </div>
            )}
            {selectedSatellite.constellation && (
              <div className="id-item">
                <span className="id-label">{t('satellite.constellation')}</span>
                <span className="id-value constellation-tag">
                  {selectedSatellite.constellation}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Altitude History */}
        {(selectedSatellite.tle_line1 || selectedSatellite.line1) && (
          <div className="satellite-section satellite-section-tle">
            <h3 
              className="satellite-section-title clickable" 
              onClick={() => setShowHistory(!showHistory)}
              title={t('satellite.altitudeHistory')}
            >
              <span className="section-icon">📈</span>
              {t('satellite.altitudeHistory')}
              <span className="section-toggle">{showHistory ? '▼' : '▶'}</span>
            </h3>
            
            {showHistory && (
              <div className="history-chart-container">
                <AltitudeHistoryChart noradId={selectedSatellite.norad_id} />
              </div>
            )}
          </div>
        )}

        {/* TLE Data */}
        {(selectedSatellite.tle_line1 || selectedSatellite.line1) && (
          <div className="satellite-section satellite-section-tle">
            <h3 className="satellite-section-title">
              <span className="section-icon">📡</span>
              {t('satellite.tleData')}
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
                {t('satellite.updated')}: {new Date(selectedSatellite.tle_updated).toLocaleString()}
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="satellite-actions">
          <button 
            className="action-btn action-btn-primary"
            onClick={handleFlyTo}
            title={t('satellite.flyTo')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="22" y2="12"/>
            </svg>
            {t('satellite.track')}
          </button>
          <button 
            className={`action-btn ${showOrbits ? 'action-btn-active' : ''}`}
            onClick={() => setShowOrbits(!showOrbits)}
            title={showOrbits ? t('satellite.hideOrbit') : t('satellite.showOrbit')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            {showOrbits ? t('satellite.hideOrbit') : t('satellite.showOrbit')}
          </button>
          <button 
            className="action-btn"
            onClick={handleCopyTLE}
            title={t('satellite.copyTLE')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {t('satellite.copyTLE')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SatelliteDetailPanel;
