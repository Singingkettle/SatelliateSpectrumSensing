/**
 * BottomToolbar - Bottom control toolbar
 * Icons styled to match satellitemap.space
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import '../../styles/BottomToolbar.css';

// SVG Icons - outline style matching satellitemap.space
// Home icon
const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

// 2D/3D Map toggle icon (perspective rectangle)
const MapIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z"/>
    <path d="M9 4v13"/>
    <path d="M15 7v13"/>
  </svg>
);

// Grid icon (3x3 dots)
const GridIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="5" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="5" cy="19" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="19" r="1.5" fill="currentColor"/>
  </svg>
);

// Border/Globe icon
const BorderIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

// Sun/Lighting icon
const SunIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

// Earth Rotation icon (circular arrow)
const RotationIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"/>
    <path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

// Info icon (center)
const InfoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

// Toolbar button component
const ToolbarButton = ({ icon, title, active, onClick, disabled }) => (
  <button 
    className={`toolbar-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
    title={title}
    onClick={onClick}
    disabled={disabled}
  >
    {icon}
  </button>
);

const BottomToolbar = () => {
  const { t } = useTranslation();
  const [fps, setFps] = useState(60);
  
  // UI Store states
  const toggleSceneMode = useUiStore(s => s.toggleSceneMode);
  const setShowSettingsModal = useUiStore(s => s.setShowSettingsModal);
  const showGrid = useUiStore(s => s.showGrid);
  const toggleGrid = useUiStore(s => s.toggleGrid);
  const lightingEnabled = useUiStore(s => s.lightingEnabled);
  const toggleLighting = useUiStore(s => s.toggleLighting);
  const showBorders = useUiStore(s => s.showBorders);
  const toggleBorders = useUiStore(s => s.toggleBorders);
  const earthRotation = useUiStore(s => s.earthRotation);
  const toggleEarthRotation = useUiStore(s => s.toggleEarthRotation);
  
  // FPS counter
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(measureFps);
    };
    
    const rafId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(rafId);
  }, []);
  
  const handleResetView = () => {
    window.dispatchEvent(new CustomEvent('resetCameraView'));
  };
  
  const handleToggleGrid = () => {
    toggleGrid();
    window.dispatchEvent(new CustomEvent('toggleGrid'));
  };
  
  const handleToggleSun = () => {
    toggleLighting();
    window.dispatchEvent(new CustomEvent('toggleLighting'));
  };
  
  const handleToggleBorders = () => {
    toggleBorders();
    window.dispatchEvent(new CustomEvent('toggleBorders'));
  };
  
  const handleToggleRotation = () => {
    toggleEarthRotation();
    window.dispatchEvent(new CustomEvent('toggleEarthRotation'));
  };
  
  return (
    <div className="bottom-toolbar">
      <div className="toolbar-left">
        {/* Home/Reset View */}
        <ToolbarButton
          icon={<HomeIcon />}
          title={t('toolbar.home')}
          onClick={handleResetView}
        />
        
        {/* 2D/3D Map Toggle */}
        <ToolbarButton
          icon={<MapIcon />}
          title={t('toolbar.mapView')}
          onClick={toggleSceneMode}
        />
        
        {/* Grid Toggle */}
        <ToolbarButton
          icon={<GridIcon />}
          title={t('toolbar.grid')}
          active={showGrid}
          onClick={handleToggleGrid}
        />
        
        {/* Country Borders Toggle */}
        <ToolbarButton
          icon={<BorderIcon />}
          title={t('toolbar.borders')}
          active={showBorders}
          onClick={handleToggleBorders}
        />
        
        {/* Sun/Lighting Toggle */}
        <ToolbarButton
          icon={<SunIcon />}
          title={t('toolbar.sunlight')}
          active={lightingEnabled}
          onClick={handleToggleSun}
        />
        
        {/* Earth Rotation Toggle */}
        <ToolbarButton
          icon={<RotationIcon />}
          title={t('toolbar.rotation')}
          active={earthRotation}
          onClick={handleToggleRotation}
        />
        
        {/* FPS Counter */}
        <div className="fps-counter" title="Frames per second">
          <span className="fps-value">{fps}</span>
          <span className="fps-label">FPS</span>
        </div>
      </div>
      
      {/* Center Info Button */}
      <div className="toolbar-center">
        <ToolbarButton
          icon={<InfoIcon />}
          title="Information"
          onClick={() => setShowSettingsModal(true)}
        />
      </div>
      
      {/* Right side is handled by TimeControls component */}
    </div>
  );
};

export default BottomToolbar;
