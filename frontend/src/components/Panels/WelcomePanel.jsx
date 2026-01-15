/**
 * WelcomePanel - Initial welcome panel shown on first visit
 * Provides quick links to constellation data and settings
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import '../../styles/WelcomePanel.css';

const WelcomePanel = () => {
  const { t } = useTranslation();
  const setShowWelcomePanel = useUiStore(s => s.setShowWelcomePanel);
  const setShowConstellationData = useUiStore(s => s.setShowConstellationData);
  
  const handleClose = () => {
    setShowWelcomePanel(false);
  };
  
  const handleConstellationData = () => {
    setShowConstellationData(true);
    setShowWelcomePanel(false);
  };
  
  return (
    <div className="welcome-panel animate-fadeIn">
      <div className="welcome-header">
        <h3 className="welcome-title">{t('welcome.title')}</h3>
        <button 
          className="welcome-close"
          onClick={handleClose}
          title={t('common.close')}
        >
          ✕
        </button>
      </div>
      
      <div className="welcome-content">
        <a 
          href="#" 
          className="welcome-link"
          onClick={(e) => {
            e.preventDefault();
            handleConstellationData();
          }}
        >
          {t('welcome.constellationData')}
        </a>
      </div>
    </div>
  );
};

export default WelcomePanel;
