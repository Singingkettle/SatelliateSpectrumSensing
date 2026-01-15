/**
 * ConstellationDataModal - Full-screen modal for constellation statistics
 * Displays growth charts, launch history, decay tracking, orbits, and ground stations
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import GrowthChart from './GrowthChart';
import LaunchHistory from './LaunchHistory';
import DecayTracking from './DecayTracking';
import OrbitData from './OrbitData';
import { ensureConstellationData } from '../../api/satelliteApi';
import '../../styles/ConstellationDataModal.css';

const ConstellationDataModal = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('growth');
  const [selectedConstellation, setSelectedConstellation] = useState('starlink');
  
  const showConstellationData = useUiStore(s => s.showConstellationData);
  const setShowConstellationData = useUiStore(s => s.setShowConstellationData);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellations = useSatelliteStore(s => s.constellations);
  const fetchConstellations = useSatelliteStore(s => s.fetchConstellations);
  
  // Tab definitions with translation keys
  const TABS = [
    { id: 'growth', nameKey: 'constellationData.growth', icon: '📈' },
    { id: 'launches', nameKey: 'constellationData.launches', icon: '🚀' },
    { id: 'decays', nameKey: 'constellationData.decays', icon: '🔥' },
    { id: 'orbits', nameKey: 'constellationData.orbits', icon: '🌐' },
    { id: 'ground-stations', nameKey: 'constellationData.groundStations', icon: '📡' },
    { id: 'events', nameKey: 'constellationData.events', icon: '📅' },
  ];
  
  const handleClose = useCallback(() => {
    setShowConstellationData(false);
  }, [setShowConstellationData]);
  
  // Fetch constellations if not loaded
  useEffect(() => {
    if (constellations.length === 0) {
      fetchConstellations();
    }
  }, [constellations.length, fetchConstellations]);
  
  // Set initial constellation from selected ones
  useEffect(() => {
    if (selectedConstellations.length > 0 && !selectedConstellations.includes(selectedConstellation)) {
      setSelectedConstellation(selectedConstellations[0]);
    }
  }, [selectedConstellations, selectedConstellation]);
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Ensure historical data exists when opening the modal or switching constellations
  useEffect(() => {
    if (!showConstellationData || !selectedConstellation) return;
    const runEnsure = async () => {
      try {
        await ensureConstellationData(selectedConstellation, 3650);
      } catch (error) {
        // Non-blocking: UI still loads with whatever data is available
        console.warn('Failed to ensure constellation data', error);
      }
    };
    runEnsure();
  }, [showConstellationData, selectedConstellation]);
  
  if (!showConstellationData) return null;
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'growth':
        return <GrowthChart constellation={selectedConstellation} />;
      case 'launches':
        return <LaunchHistory constellation={selectedConstellation} />;
      case 'decays':
        return <DecayTracking constellation={selectedConstellation} />;
      case 'orbits':
        return <OrbitData constellation={selectedConstellation} />;
      case 'ground-stations':
        return <GroundStationsView constellation={selectedConstellation} t={t} />;
      case 'events':
        return <EventsView constellation={selectedConstellation} t={t} />;
      default:
        return null;
    }
  };
  
  return (
    <div className="constellation-data-modal">
      {/* Header */}
      <div className="cdm-header">
        <div className="cdm-title">
          <span className="cdm-label">{t('constellationData.title')}:</span>
          <select 
            className="cdm-select"
            value={selectedConstellation}
            onChange={(e) => setSelectedConstellation(e.target.value)}
          >
            {constellations.length > 0 ? (
              constellations.map(c => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))
            ) : (
              <>
                <option value="starlink">Starlink</option>
                <option value="oneweb">OneWeb</option>
                <option value="iridium">Iridium NEXT</option>
                <option value="gps">GPS</option>
                <option value="galileo">Galileo</option>
                <option value="glonass">GLONASS</option>
                <option value="beidou">BeiDou</option>
                <option value="qianfan">Qianfan (千帆)</option>
                <option value="guowang">Guowang (国网)</option>
              </>
            )}
          </select>
        </div>
        <button className="cdm-close" onClick={handleClose}>×</button>
      </div>
      
      {/* Tabs */}
      <div className="cdm-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`cdm-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.nameKey)}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div className="cdm-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Placeholder components for tabs
const GroundStationsView = ({ constellation, t }) => (
  <div className="cdm-placeholder">
    <h3>{t('constellationData.groundStations')} - {constellation}</h3>
    <p>{t('common.comingSoon')}</p>
  </div>
);

const EventsView = ({ constellation, t }) => (
  <div className="cdm-placeholder">
    <h3>{t('constellationData.events')} - {constellation}</h3>
    <p>{t('common.comingSoon')}</p>
  </div>
);

export default ConstellationDataModal;
