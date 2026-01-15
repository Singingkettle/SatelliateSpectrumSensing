/**
 * TimeControls - Time display and playback controls
 * Replicates satellitemap.space bottom-right time controls
 * Now uses centralized timeStore for Cesium clock synchronization
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimeStore } from '../../store/timeStore';
import '../../styles/TimeControls.css';

const TimeControls = () => {
  const { t } = useTranslation();
  
  // Get state and actions from timeStore
  const currentTime = useTimeStore(s => s.currentTime);
  const isPlaying = useTimeStore(s => s.isPlaying);
  const speedMultiplier = useTimeStore(s => s.speedMultiplier);
  const togglePlayPause = useTimeStore(s => s.togglePlayPause);
  const decreaseSpeed = useTimeStore(s => s.decreaseSpeed);
  const increaseSpeed = useTimeStore(s => s.increaseSpeed);
  const resetToNow = useTimeStore(s => s.resetToNow);
  const getSpeedLabel = useTimeStore(s => s.getSpeedLabel);
  
  // Local state to force re-render every second for smooth time display
  const [displayTime, setDisplayTime] = useState(currentTime);
  
  // Display time comes from timeStore (which is synced from Cesium clock)
  useEffect(() => {
    setDisplayTime(currentTime);
  }, [currentTime]);
  
  // Format date as DD/MM/YY
  const formatDate = (date) => {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };
  
  // Format time as HH:MM:SS
  const formatTime = (date) => {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  
  const handleRewind = () => {
    decreaseSpeed();
  };
  
  const handlePlayPause = () => {
    togglePlayPause();
  };
  
  const handleForward = () => {
    increaseSpeed();
  };
  
  const handleReset = () => {
    resetToNow();
  };
  
  // Show speed indicator if not real-time
  const speedLabel = getSpeedLabel();
  const showSpeedIndicator = speedMultiplier !== 1;
  
  return (
    <div className="time-controls">
      {/* Date/Time Display */}
      <div className="time-display">
        <span className="time-date">{formatDate(displayTime)}</span>
        <span className="time-separator"> </span>
        <span className="time-clock">{formatTime(displayTime)}</span>
        <span className="time-zone"> UTC</span>
        {showSpeedIndicator && (
          <span className="time-speed" title={`${t('time.speed')}: ${speedLabel}`}>
            {speedLabel}
          </span>
        )}
      </div>
      
      {/* Playback Controls */}
      <div className="time-playback">
        <button 
          className="time-btn"
          onClick={handleRewind}
          title={t('time.slower')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="19 20 9 12 19 4 19 20"/>
            <line x1="5" y1="19" x2="5" y2="5"/>
          </svg>
        </button>
        
        <button 
          className={`time-btn ${!isPlaying ? 'paused' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? t('time.pause') : t('time.play')}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>
        
        <button 
          className="time-btn"
          onClick={handleForward}
          title={t('time.faster')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
        </button>
        
        <button 
          className="time-btn"
          onClick={handleReset}
          title={t('time.resetToNow')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TimeControls;
