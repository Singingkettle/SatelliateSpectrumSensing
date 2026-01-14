/**
 * SettingsModal - Application settings modal
 * Controls display, performance, and user preferences
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/SettingsModal.css';

// Settings categories
const CATEGORIES = [
  { id: 'display', name: 'Display', icon: '🖥️' },
  { id: 'satellite', name: 'Satellite', icon: '🛰️' },
  { id: 'toolbar', name: 'Toolbar', icon: '🔧' },
  { id: 'startup', name: 'Start-up', icon: '🚀' },
  { id: 'advanced', name: 'Advanced', icon: '⚙️' },
];

const SettingsModal = () => {
  const [activeCategory, setActiveCategory] = useState('display');
  
  const showSettingsModal = useUiStore(s => s.showSettingsModal);
  const setShowSettingsModal = useUiStore(s => s.setShowSettingsModal);
  const sceneMode = useUiStore(s => s.sceneMode);
  const setSceneMode = useUiStore(s => s.setSceneMode);
  const showAtmosphere = useUiStore(s => s.showAtmosphere);
  const setShowAtmosphere = useUiStore(s => s.setShowAtmosphere);
  const showStars = useUiStore(s => s.showStars);
  const setShowStars = useUiStore(s => s.setShowStars);
  const showGrid = useUiStore(s => s.showGrid);
  const setShowGrid = useUiStore(s => s.setShowGrid);
  const showLegendPanel = useUiStore(s => s.showLegendPanel);
  const setShowLegendPanel = useUiStore(s => s.setShowLegendPanel);
  
  const showOrbits = useSatelliteStore(s => s.showOrbits);
  const setShowOrbits = useSatelliteStore(s => s.setShowOrbits);
  const showLabels = useSatelliteStore(s => s.showLabels);
  const setShowLabels = useSatelliteStore(s => s.setShowLabels);
  const satelliteScale = useSatelliteStore(s => s.satelliteScale);
  const setSatelliteScale = useSatelliteStore(s => s.setSatelliteScale);
  
  const handleClose = useCallback(() => {
    setShowSettingsModal(false);
  }, [setShowSettingsModal]);
  
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
  
  if (!showSettingsModal) return null;
  
  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'display':
        return (
          <div className="settings-section">
            <h3 className="settings-section-title">Display Settings</h3>
            
            <div className="settings-item">
              <span className="settings-label">Scene Mode</span>
              <div className="settings-control">
                <button 
                  className={`settings-btn ${sceneMode === '3D' ? 'active' : ''}`}
                  onClick={() => setSceneMode('3D')}
                >
                  3D Globe
                </button>
                <button 
                  className={`settings-btn ${sceneMode === '2D' ? 'active' : ''}`}
                  onClick={() => setSceneMode('2D')}
                >
                  2D Map
                </button>
              </div>
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Show Atmosphere</span>
              <ToggleSwitch 
                checked={showAtmosphere} 
                onChange={setShowAtmosphere} 
              />
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Show Stars</span>
              <ToggleSwitch 
                checked={showStars} 
                onChange={setShowStars} 
              />
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Show Grid Lines</span>
              <ToggleSwitch 
                checked={showGrid} 
                onChange={setShowGrid} 
              />
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Show Legend Panel</span>
              <ToggleSwitch 
                checked={showLegendPanel} 
                onChange={setShowLegendPanel} 
              />
            </div>
          </div>
        );
        
      case 'satellite':
        return (
          <div className="settings-section">
            <h3 className="settings-section-title">Satellite Settings</h3>
            
            <div className="settings-item">
              <span className="settings-label">Show Orbit Paths</span>
              <ToggleSwitch 
                checked={showOrbits} 
                onChange={setShowOrbits} 
              />
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Show Labels</span>
              <ToggleSwitch 
                checked={showLabels} 
                onChange={setShowLabels} 
              />
            </div>
            
            <div className="settings-item">
              <span className="settings-label">Satellite Size</span>
              <div className="settings-slider-container">
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1"
                  value={satelliteScale}
                  onChange={(e) => setSatelliteScale(parseFloat(e.target.value))}
                  className="settings-slider"
                />
                <span className="settings-slider-value">{(satelliteScale * 30).toFixed(0)}px</span>
              </div>
            </div>
          </div>
        );
        
      case 'toolbar':
        return (
          <div className="settings-section">
            <h3 className="settings-section-title">Toolbar Customization</h3>
            <p className="settings-hint">
              Configure which tools appear in the bottom toolbar
            </p>
            <div className="settings-coming-soon">
              Coming soon...
            </div>
          </div>
        );
        
      case 'startup':
        return (
          <div className="settings-section">
            <h3 className="settings-section-title">Start-up Settings</h3>
            <p className="settings-hint">
              Configure default view and loaded constellations on startup
            </p>
            <div className="settings-coming-soon">
              Coming soon...
            </div>
          </div>
        );
        
      case 'advanced':
        return (
          <div className="settings-section">
            <h3 className="settings-section-title">Advanced Settings</h3>
            <p className="settings-hint">
              Performance and debugging options
            </p>
            <div className="settings-coming-soon">
              Coming soon...
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="settings-modal-overlay" onClick={handleClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={handleClose}>×</button>
        </div>
        
        {/* Content */}
        <div className="settings-content">
          {/* Sidebar */}
          <div className="settings-sidebar">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`settings-nav-item ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="settings-nav-icon">{cat.icon}</span>
                <span className="settings-nav-name">{cat.name}</span>
              </button>
            ))}
          </div>
          
          {/* Main content */}
          <div className="settings-main">
            {renderCategoryContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

// Toggle Switch Component
const ToggleSwitch = ({ checked, onChange }) => (
  <button 
    className={`toggle-switch ${checked ? 'on' : 'off'}`}
    onClick={() => onChange(!checked)}
  >
    <span className="toggle-track" />
    <span className="toggle-thumb" />
  </button>
);

export default SettingsModal;
