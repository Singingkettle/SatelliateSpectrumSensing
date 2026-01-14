/**
 * ConstellationMenu - Hierarchical constellation selection menu
 * Replicates satellitemap.space constellation dropdown
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSatelliteStore } from '../../store/satelliteStore';

// Constellation hierarchy matching satellitemap.space
const CONSTELLATION_HIERARCHY = {
  finder: { name: 'Finder', icon: '🔍', slug: 'finder' },
  internet: {
    name: 'Internet',
    icon: '🌐',
    children: [
      { name: 'Starlink', slug: 'starlink', color: '#1DA1F2' },
      { name: 'Kuiper', slug: 'kuiper', color: '#FF9800' },
      { name: 'OneWeb', slug: 'oneweb', color: '#00A3E0' },
      { name: 'Qianfan (千帆星座)', slug: 'qianfan', color: '#E91E63' },
      { name: 'Guowang (国网)', slug: 'guowang', color: '#9C27B0' },
      { name: 'GalaxySpace', slug: 'galaxyspace', color: '#607D8B' },
      { name: 'E-Space', slug: 'espace', color: '#795548' },
    ],
  },
  cellular: {
    name: 'Cellular',
    icon: '📱',
    children: [
      { name: 'Iridium NEXT', slug: 'iridium', color: '#FF6B35' },
      { name: 'Globalstar', slug: 'globalstar', color: '#4CAF50' },
      { name: 'Bluewalker (AST)', slug: 'bluewalker', color: '#2196F3' },
      { name: 'Lynk', slug: 'lynk', color: '#00BCD4' },
    ],
  },
  positioning: {
    name: 'Positioning',
    icon: '📍',
    children: [
      { name: 'GPS', slug: 'gps', color: '#4CAF50' },
      { name: 'Galileo', slug: 'galileo', color: '#2196F3' },
      { name: 'GLONASS', slug: 'glonass', color: '#F44336' },
      { name: 'BeiDou', slug: 'beidou', color: '#FF9800' },
    ],
  },
  earthImaging: {
    name: 'Earth Imaging',
    icon: '🛰️',
    children: [
      { name: 'Planet', slug: 'planet', color: '#9C27B0' },
      { name: 'Jilin-1', slug: 'jilin', color: '#E91E63' },
      { name: 'Satelog', slug: 'satelog', color: '#607D8B' },
    ],
  },
  weather: {
    name: 'Weather',
    icon: '🌤️',
    children: [
      { name: 'Spire', slug: 'spire', color: '#00BCD4' },
    ],
  },
  science: {
    name: 'Science',
    icon: '🔬',
    children: [
      { name: 'Swarm', slug: 'swarm', color: '#8BC34A' },
    ],
  },
  iot: {
    name: 'IoT',
    icon: '📡',
    children: [
      { name: 'Orbcomm', slug: 'orbcomm', color: '#795548' },
      { name: 'Geespace', slug: 'geespace', color: '#607D8B' },
      { name: 'Tianqi', slug: 'tianqi', color: '#9C27B0' },
    ],
  },
};

const ConstellationMenuItem = ({ item, onSelect, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const loadingConstellations = useSatelliteStore(s => s.loadingConstellations);
  
  const handleClick = (e) => {
    e.stopPropagation();
    if (item.children) {
      setIsOpen(!isOpen);
    } else if (item.slug) {
      onSelect(item.slug);
      // Ensure dropdown closes by deferring the close action slightly 
      // to let React state updates propagate
      // But onSelect already calls toggleConstellation and then onClose
    }
  };
  
  const isSelected = item.slug && selectedConstellations.includes(item.slug);
  const isLoading = item.slug && loadingConstellations[item.slug];
  
  // Translate category name if translation exists
  const displayName = t ? t(`constellationMenu.${item.name}`, item.name) : item.name;
  
  return (
    <div className="dropdown-submenu" role="menuitem">
      <button 
        type="button"
        className={`dropdown-item ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
        aria-expanded={item.children ? isOpen : undefined}
        aria-haspopup={item.children ? 'menu' : undefined}
      >
        {item.slug && (
          <span 
            className="constellation-color-dot"
            style={{ backgroundColor: item.color || '#ffffff' }}
          />
        )}
        {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
        <span className="dropdown-item-text">{displayName}</span>
        {isLoading && <span className="loading-spinner">⟳</span>}
        {item.children && (
          <span className="dropdown-item-arrow">▶</span>
        )}
      </button>
      
      {item.children && isOpen && (
        <div className="dropdown-menu submenu" role="menu">
          {item.children.map((child) => (
            <ConstellationMenuItem 
              key={child.slug} 
              item={child} 
              onSelect={onSelect}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ConstellationMenu = ({ onClose }) => {
  const { t } = useTranslation();
  const toggleConstellation = useSatelliteStore(s => s.toggleConstellation);
  
  const handleSelect = (slug) => {
    toggleConstellation(slug);
    // Use setTimeout to ensure state updates don't conflict
    setTimeout(() => {
      if (onClose) onClose();
    }, 0);
  };
  
  return (
    <div className="dropdown-menu constellation-menu" role="menu">
      <div className="dropdown-header">{t('constellationMenu.title', 'Constellations')}</div>
      
      {/* Finder */}
      <button 
        type="button"
        className="dropdown-item"
        onClick={() => {
          // TODO: Open finder modal
          onClose();
        }}
        role="menuitem"
      >
        <span className="dropdown-item-icon">🔍</span>
        <span>{t('constellationMenu.finder', 'Finder')}</span>
      </button>
      
      <div className="dropdown-divider" />
      
      {/* Hierarchical menus */}
      {Object.values(CONSTELLATION_HIERARCHY).filter(item => item.children).map((category) => (
        <ConstellationMenuItem 
          key={category.name}
          item={category}
          onSelect={handleSelect}
          t={t}
        />
      ))}
      
      <div className="dropdown-divider" />
      
      {/* Quick Links */}
      <div className="dropdown-header">{t('constellationMenu.quickSelect', 'Quick Select')}</div>
      {['starlink', 'gps', 'iridium', 'oneweb'].map(slug => {
        const items = Object.values(CONSTELLATION_HIERARCHY)
          .flatMap(cat => cat.children || [])
          .filter(item => item.slug === slug);
        const item = items[0];
        if (!item) return null;
        
        return (
          <button 
            key={slug}
            type="button"
            className="dropdown-item"
            onClick={() => handleSelect(slug)}
            role="menuitem"
          >
            <span 
              className="constellation-color-dot"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ConstellationMenu;
