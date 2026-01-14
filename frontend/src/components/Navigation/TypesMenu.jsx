/**
 * TypesMenu - Satellite type filter menu
 * Replicates satellitemap.space Types dropdown
 * Filters satellites by category/purpose
 */
import React from 'react';
import { useSatelliteStore } from '../../store/satelliteStore';

// Type categories that map to constellation groups
const SATELLITE_TYPES = [
  { 
    name: 'Internet', 
    slug: 'internet', 
    icon: '🌐',
    constellations: ['starlink', 'oneweb', 'kuiper', 'qianfan', 'guowang', 'galaxyspace', 'espace']
  },
  { 
    name: 'Communications', 
    slug: 'communications', 
    icon: '📡',
    constellations: ['iridium', 'globalstar', 'orbcomm', 'bluewalker', 'lynk']
  },
  { 
    name: 'Global Positioning', 
    slug: 'positioning', 
    icon: '📍',
    constellations: ['gps', 'glonass', 'galileo', 'beidou']
  },
  { 
    name: 'Earth Imaging', 
    slug: 'earth-imaging', 
    icon: '🛰️',
    constellations: ['planet', 'spire', 'jilin', 'yaogan']
  },
  { 
    name: 'Geostationary', 
    slug: 'geostationary', 
    icon: '🔴',
    constellations: ['geo', 'intelsat', 'ses']
  },
  { 
    name: 'Space Stations', 
    slug: 'stations', 
    icon: '🏠',
    constellations: ['stations']
  },
  { 
    name: 'All Active', 
    slug: 'active', 
    icon: '✅',
    constellations: ['active']
  },
  { 
    name: 'Recent Launches', 
    slug: 'recent', 
    icon: '🚀',
    constellations: ['last-30-days']
  },
];

const TypesMenu = ({ onClose }) => {
  const toggleConstellation = useSatelliteStore(s => s.toggleConstellation);
  const loadConstellation = useSatelliteStore(s => s.loadConstellation);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const clearAllConstellations = useSatelliteStore(s => s.clearAllConstellations);
  
  const handleSelect = async (type) => {
    // Clear existing selections first if selecting a category
    if (type.constellations) {
      // Load all constellations in this type
      for (const slug of type.constellations) {
        await loadConstellation(slug);
        if (!selectedConstellations.includes(slug)) {
          toggleConstellation(slug);
        }
      }
    }
    onClose();
  };
  
  const handleClearAll = () => {
    clearAllConstellations();
    onClose();
  };
  
  return (
    <div className="dropdown-menu types-menu">
      <div className="dropdown-header">Filter by Type</div>
      
      {SATELLITE_TYPES.map((type) => (
        <div 
          key={type.slug}
          className="dropdown-item"
          onClick={() => handleSelect(type)}
        >
          <span className="dropdown-item-icon">{type.icon}</span>
          <span>{type.name}</span>
          {type.constellations && (
            <span className="dropdown-item-count">{type.constellations.length}</span>
          )}
        </div>
      ))}
      
      <div className="dropdown-divider" />
      
      <div 
        className="dropdown-item dropdown-item-clear"
        onClick={handleClearAll}
      >
        <span className="dropdown-item-icon">🗑️</span>
        <span>Clear All</span>
      </div>
    </div>
  );
};

export default TypesMenu;
