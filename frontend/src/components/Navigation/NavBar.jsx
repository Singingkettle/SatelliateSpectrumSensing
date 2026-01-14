/**
 * NavBar - Main navigation bar component
 * Replicates the satellitemap.space header navigation
 */
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import ConstellationMenu from './ConstellationMenu';
import TypesMenu from './TypesMenu';
import FunctionsMenu from './FunctionsMenu';
import MoreMenu from './MoreMenu';
import '../../styles/NavBar.css';

// Logo SVG component (animated satellite icon)
const LogoIcon = () => (
  <svg 
    className="nav-logo-icon" 
    viewBox="0 0 100 100" 
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="50" cy="50" r="45" stroke="#1DA1F2" strokeWidth="2" fill="none" />
    <circle cx="50" cy="50" r="35" stroke="#1DA1F2" strokeWidth="1" strokeOpacity="0.5" fill="none" />
    <circle cx="50" cy="50" r="25" stroke="#1DA1F2" strokeWidth="1" strokeOpacity="0.3" fill="none" />
    <circle cx="50" cy="20" r="4" fill="#1DA1F2" />
    <circle cx="75" cy="60" r="3" fill="#f97316" />
    <circle cx="30" cy="70" r="3" fill="#22c55e" />
    <circle cx="70" cy="35" r="2" fill="#eab308" />
  </svg>
);

const NavBar = () => {
  const { t, i18n } = useTranslation();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navRef = useRef(null);
  const setShowSearchModal = useUiStore(s => s.setShowSearchModal);
  
  // Toggle language
  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleDropdownToggle = (menu) => {
    setActiveDropdown(activeDropdown === menu ? null : menu);
  };
  
  const handleSearchClick = () => {
    setShowSearchModal(true);
  };
  
  return (
    <nav className="nav-bar" ref={navRef}>
      {/* Logo */}
      <a href="/" className="nav-logo">
        <LogoIcon />
        <span className="nav-logo-text">
          <span className="nav-logo-primary">ChangShuo</span>
          <span className="nav-logo-dot">.</span>
          <span className="nav-logo-secondary">Space</span>
        </span>
      </a>
      
      {/* Main Menu */}
      <div className="nav-menu">
        <a href="/about" className="nav-item">{t('nav.about')}</a>
        <a href="/news" className="nav-item">{t('nav.satelliteNews')}</a>
        
        {/* Constellations Dropdown */}
        <div className="nav-dropdown-wrapper">
          <button 
          className={`nav-item dropdown-trigger ${activeDropdown === 'constellations' ? 'active' : ''}`}
          onClick={() => handleDropdownToggle('constellations')}
            aria-haspopup="true"
            aria-expanded={activeDropdown === 'constellations'}
        >
            {t('nav.constellations')}
          <span className="nav-dropdown-icon">▼</span>
          </button>
          {activeDropdown === 'constellations' && (
            <ConstellationMenu onClose={() => setActiveDropdown(null)} />
          )}
        </div>
        
        {/* Types Dropdown */}
        <div className="nav-dropdown-wrapper">
          <button 
          className={`nav-item dropdown-trigger ${activeDropdown === 'types' ? 'active' : ''}`}
          onClick={() => handleDropdownToggle('types')}
            aria-haspopup="true"
            aria-expanded={activeDropdown === 'types'}
        >
            {t('nav.types')}
          <span className="nav-dropdown-icon">▼</span>
          </button>
          {activeDropdown === 'types' && (
            <TypesMenu onClose={() => setActiveDropdown(null)} />
          )}
        </div>
        
        {/* Functions Dropdown */}
        <div className="nav-dropdown-wrapper">
          <button 
          className={`nav-item dropdown-trigger ${activeDropdown === 'functions' ? 'active' : ''}`}
          onClick={() => handleDropdownToggle('functions')}
            aria-haspopup="true"
            aria-expanded={activeDropdown === 'functions'}
        >
            {t('nav.functions')}
          <span className="nav-dropdown-icon">▼</span>
          </button>
          {activeDropdown === 'functions' && (
            <FunctionsMenu onClose={() => setActiveDropdown(null)} />
          )}
        </div>
        
        {/* More Dropdown */}
        <div className="nav-dropdown-wrapper">
          <button 
          className={`nav-item dropdown-trigger ${activeDropdown === 'more' ? 'active' : ''}`}
          onClick={() => handleDropdownToggle('more')}
            aria-haspopup="true"
            aria-expanded={activeDropdown === 'more'}
        >
            {t('nav.more')}
          <span className="nav-dropdown-icon">▼</span>
          </button>
          {activeDropdown === 'more' && (
            <MoreMenu onClose={() => setActiveDropdown(null)} />
          )}
        </div>
        
        {/* Share */}
        <button className="nav-item nav-share-btn">
          <span>↗</span> {t('nav.share')}
        </button>
        
        {/* Language Toggle */}
        <button className="nav-item nav-lang-btn" onClick={toggleLanguage}>
          {i18n.language === 'zh' ? 'EN' : '中'}
        </button>
      </div>
      
      {/* Search Button */}
      <div className="nav-right">
        <button 
          className="nav-search-btn"
          onClick={handleSearchClick}
          title="Search satellites"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
