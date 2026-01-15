/**
 * FunctionsMenu - Functions/Tools dropdown menu
 * Replicates satellitemap.space Functions dropdown
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';

const FunctionsMenu = ({ onClose }) => {
  const { t } = useTranslation();
  const setShowConstellationData = useUiStore(s => s.setShowConstellationData);
  const setShowCalculatorModal = useUiStore(s => s.setShowCalculatorModal);
  
  // Function items with translation keys
  const FUNCTION_ITEMS = [
    { 
      nameKey: 'functions.constellationData',
      slug: 'constellation-data', 
      icon: '📊',
      action: 'openConstellationData'
    },
    {
      nameKey: 'functions.visualizer',
      icon: '👁️',
      children: [
        { nameKey: 'functions.load', slug: 'visualizer-load' },
        { nameKey: 'functions.clear', slug: 'visualizer-clear' },
        { nameKey: 'functions.clearReset', slug: 'visualizer-reset' },
        { nameKey: 'functions.exportCSV', slug: 'visualizer-export' },
        { nameKey: 'functions.autoPlay', slug: 'visualizer-autoplay' },
      ],
    },
    {
      nameKey: 'functions.bookmarks',
      icon: '⭐',
      children: [
        { name: 'ISS', slug: 'bookmark-iss', noradId: 25544 },
        { name: 'CSS', slug: 'bookmark-css', noradId: 48274 },
        { name: 'HST', slug: 'bookmark-hst', noradId: 20580 },
      ],
    },
    {
      nameKey: 'functions.calculator',
      icon: '🧮',
      children: [
        { nameKey: 'functions.train', slug: 'calc-train', icon: '🚂' },
        { nameKey: 'functions.transit', slug: 'calc-transit', icon: '🔀' },
        { nameKey: 'functions.interference', slug: 'calc-interference', icon: '📶' },
        { nameKey: 'functions.celestial', slug: 'calc-celestial', icon: '✨' },
        { nameKey: 'functions.altitudeHistory', slug: 'calc-altitude', icon: '📈' },
      ],
    },
    { nameKey: 'functions.reEntries', slug: 're-entries', icon: '🔥' },
    { nameKey: 'functions.tleAnalysis', slug: 'tle-analysis', icon: '📋' },
    { nameKey: 'functions.photoSimulator', slug: 'photo-simulator', icon: '📷' },
    { nameKey: 'functions.conjunctionSearch', slug: 'conjunction-search', icon: '🔀' },
  ];
  
  const handleSelect = (item) => {
    switch (item.slug) {
      case 'constellation-data':
        setShowConstellationData(true);
        break;
      
      // Bookmark satellites - fly to specific NORAD IDs
      case 'bookmark-iss':
      case 'bookmark-css':
      case 'bookmark-hst':
        // Dispatch event to fly to satellite
        if (item.noradId) {
          window.dispatchEvent(new CustomEvent('flyToNoradId', { 
            detail: { norad_id: item.noradId } 
          }));
        }
        break;
      
      // Calculator functions
      case 'calc-train':
      case 'calc-transit':
      case 'calc-interference':
      case 'calc-celestial':
      case 'calc-altitude':
        setShowCalculatorModal(true);
        break;
      
      // Visualizer actions
      case 'visualizer-clear':
        window.dispatchEvent(new CustomEvent('clearAllSatellites'));
        break;
      case 'visualizer-reset':
        window.dispatchEvent(new CustomEvent('resetCameraView'));
        window.dispatchEvent(new CustomEvent('clearAllSatellites'));
        break;
      case 'visualizer-export':
        window.dispatchEvent(new CustomEvent('exportToCSV'));
        break;
      
      default:
        console.log('Function selected:', item.slug);
    }
    onClose();
  };
  
  return (
    <div className="dropdown-menu functions-menu">
      <div className="dropdown-header">{t('functions.title')}</div>
      
      {FUNCTION_ITEMS.map((item) => (
        <FunctionMenuItem 
          key={item.nameKey || item.name}
          item={item}
          onSelect={handleSelect}
          t={t}
        />
      ))}
    </div>
  );
};

const FunctionMenuItem = ({ item, onSelect, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleClick = (e) => {
    e.stopPropagation();
    if (item.children) {
      setIsOpen(!isOpen);
    } else if (item.slug) {
      onSelect(item);
    }
  };
  
  const displayName = item.nameKey ? t(item.nameKey) : item.name;
  
  return (
    <div className="dropdown-submenu">
      <div 
        className="dropdown-item"
        onClick={handleClick}
      >
        {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
        <span className="dropdown-item-text">{displayName}</span>
        {item.children && (
          <span className="dropdown-item-arrow">▶</span>
        )}
      </div>
      
      {item.children && isOpen && (
        <div className="dropdown-menu submenu">
          {item.children.map((child) => {
            const childName = child.nameKey ? t(child.nameKey) : child.name;
            return (
              <div 
                key={child.slug || child.name}
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(child);
                }}
              >
                {child.icon && <span className="dropdown-item-icon">{child.icon}</span>}
                <span>{childName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FunctionsMenu;
