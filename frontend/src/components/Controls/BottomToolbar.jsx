/**
 * BottomToolbar - Bottom control toolbar
 * Exact replica of satellitemap.space bottom toolbar
 * Icons matching the reference site's style
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/BottomToolbar.css';

// SVG Icons - exact match to satellitemap.space
// Home icon
const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </svg>
);

// 2D/3D Map toggle icon
const MapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
  </svg>
);

// Grid icon
const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/>
  </svg>
);

// Cloud/Earth icon (yellow in reference) - for cloud layer
const CloudGlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

// Border lines icon
const BorderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/>
  </svg>
);

// Sun/Lighting icon
const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
  </svg>
);

// Stars icon
const StarsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/>
  </svg>
);

// Cloud/Atmosphere icon (blue in reference)
const CloudIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
  </svg>
);

// Ground Station icon
const GroundStationIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3L2 12h3v9h6v-6h2v6h6v-9h3L12 3zm0 8.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
  </svg>
);

// Video/Record icon
const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
  </svg>
);

// Camera/Screenshot icon
const CameraIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="3.2"/>
    <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
  </svg>
);

// Info icon (center)
const InfoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
  </svg>
);

// Toolbar button component with color variant support
const ToolbarButton = ({ icon, title, active, onClick, disabled, color }) => (
  <button 
    className={`toolbar-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${color ? `color-${color}` : ''}`}
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
  const [showStars, setShowStars] = useState(true);
  
  // UI Store states
  const sceneMode = useUiStore(s => s.sceneMode);
  const toggleSceneMode = useUiStore(s => s.toggleSceneMode);
  const setShowSettingsModal = useUiStore(s => s.setShowSettingsModal);
  const showGrid = useUiStore(s => s.showGrid);
  const toggleGrid = useUiStore(s => s.toggleGrid);
  const lightingEnabled = useUiStore(s => s.lightingEnabled);
  const toggleLighting = useUiStore(s => s.toggleLighting);
  const showAtmosphere = useUiStore(s => s.showAtmosphere);
  const toggleAtmosphere = useUiStore(s => s.toggleAtmosphere);
  const showBorders = useUiStore(s => s.showBorders);
  const toggleBorders = useUiStore(s => s.toggleBorders);
  const showClouds = useUiStore(s => s.showClouds);
  const toggleClouds = useUiStore(s => s.toggleClouds);
  
  // Satellite Store states
  const showGroundStations = useSatelliteStore(s => s.showGroundStations);
  const toggleGroundStations = useSatelliteStore(s => s.toggleGroundStations);
  
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
  
  const handleScreenshot = () => {
    window.dispatchEvent(new CustomEvent('takeScreenshot'));
  };
  
  const handleToggleSun = () => {
    toggleLighting();
    window.dispatchEvent(new CustomEvent('toggleLighting'));
  };
  
  const handleToggleClouds = () => {
    if (toggleClouds) toggleClouds();
    window.dispatchEvent(new CustomEvent('toggleClouds'));
  };
  
  const handleToggleAtmosphere = () => {
    toggleAtmosphere();
    window.dispatchEvent(new CustomEvent('toggleAtmosphere'));
  };
  
  const handleToggleBorders = () => {
    toggleBorders();
    window.dispatchEvent(new CustomEvent('toggleBorders'));
  };
  
  const handleToggleStars = () => {
    setShowStars(!showStars);
    window.dispatchEvent(new CustomEvent('toggleStars', { detail: { enabled: !showStars } }));
  };
  
  const handleStartRecording = () => {
    window.dispatchEvent(new CustomEvent('startRecording'));
  };
  
  return (
    <div className="bottom-toolbar">
      <div className="toolbar-left">
        {/* Home/Reset View - like satellitemap.space */}
        <ToolbarButton
          icon={<HomeIcon />}
          title={t('toolbar.home')}
          onClick={handleResetView}
        />
        
        {/* 2D/3D Map Toggle - keep this as requested */}
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
        
        {/* Cloud Layer Toggle (yellow like reference) */}
        <ToolbarButton
          icon={<CloudGlobeIcon />}
          title={t('toolbar.clouds')}
          active={showClouds}
          onClick={handleToggleClouds}
          color="yellow"
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
        
        {/* Stars Toggle */}
        <ToolbarButton
          icon={<StarsIcon />}
          title={t('toolbar.stars')}
          active={showStars}
          onClick={handleToggleStars}
        />
        
        {/* Atmosphere Toggle (blue like reference) */}
        <ToolbarButton
          icon={<CloudIcon />}
          title={t('toolbar.atmosphere')}
          active={showAtmosphere}
          onClick={handleToggleAtmosphere}
          color="blue"
        />
        
        {/* Ground Stations */}
        <ToolbarButton
          icon={<GroundStationIcon />}
          title={t('toolbar.groundStations')}
          active={showGroundStations}
          onClick={toggleGroundStations}
        />
        
        {/* Video/Record */}
        <ToolbarButton
          icon={<VideoIcon />}
          title={t('toolbar.record')}
          onClick={handleStartRecording}
        />
        
        {/* Screenshot */}
        <ToolbarButton
          icon={<CameraIcon />}
          title={t('toolbar.screenshot')}
          onClick={handleScreenshot}
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
