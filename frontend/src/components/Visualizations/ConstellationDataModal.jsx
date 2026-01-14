/**
 * ConstellationDataModal - Full-screen modal for constellation statistics
 * Displays growth charts, launch history, decay tracking, orbits, and ground stations
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import GrowthChart from './GrowthChart';
import LaunchHistory from './LaunchHistory';
import '../../styles/ConstellationDataModal.css';

// Tab definitions
const TABS = [
  { id: 'growth', name: 'Growth', icon: '📈' },
  { id: 'launches', name: 'Launches', icon: '🚀' },
  { id: 'decays', name: 'Decays', icon: '🔥' },
  { id: 'orbits', name: 'Orbits', icon: '🌐' },
  { id: 'ground-stations', name: 'Ground Stations', icon: '📡' },
  { id: 'events', name: 'Events', icon: '📅' },
];

const ConstellationDataModal = () => {
  const [activeTab, setActiveTab] = useState('growth');
  const [selectedConstellation, setSelectedConstellation] = useState('starlink');
  
  const showConstellationData = useUiStore(s => s.showConstellationData);
  const setShowConstellationData = useUiStore(s => s.setShowConstellationData);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellations = useSatelliteStore(s => s.constellations);
  const fetchConstellations = useSatelliteStore(s => s.fetchConstellations);
  
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
        return <GroundStationsView constellation={selectedConstellation} />;
      case 'events':
        return <EventsView constellation={selectedConstellation} />;
      default:
        return null;
    }
  };
  
  return (
    <div className="constellation-data-modal">
      {/* Header */}
      <div className="cdm-header">
        <div className="cdm-title">
          <span className="cdm-label">Constellation Status:</span>
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
            {tab.name}
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
const DecayTracking = ({ constellation }) => (
  <div className="cdm-placeholder">
    <h3>Decay Tracking - {constellation}</h3>
    <p>Tracking satellite re-entry events and decay predictions</p>
  </div>
);

const OrbitData = ({ constellation }) => (
  <div className="cdm-placeholder">
    <h3>Orbital Data - {constellation}</h3>
    <p>Orbit visualization and parameters</p>
  </div>
);

const GroundStationsView = ({ constellation }) => (
  <div className="cdm-placeholder">
    <h3>Ground Stations - {constellation}</h3>
    <p>Ground station locations and coverage</p>
  </div>
);

const EventsView = ({ constellation }) => (
  <div className="cdm-placeholder">
    <h3>Events - {constellation}</h3>
    <p>Recent and upcoming events</p>
  </div>
);

export default ConstellationDataModal;
