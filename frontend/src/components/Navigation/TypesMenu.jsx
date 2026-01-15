/**
 * TypesMenu - Satellite type filter menu
 * Replicates satellitemap.space Types dropdown
 * Filters satellites by category/purpose
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSatelliteStore } from '../../store/satelliteStore';

// Type categories that map to constellation groups
const SATELLITE_TYPES = [
  { 
    nameKey: 'types.internet',
    slug: 'internet', 
    icon: '🌐',
    constellations: ['starlink', 'oneweb', 'kuiper', 'qianfan', 'guowang', 'galaxyspace', 'espace']
  },
  { 
    nameKey: 'types.communications',
    slug: 'communications', 
    icon: '📡',
    constellations: ['iridium', 'globalstar', 'orbcomm', 'bluewalker', 'lynk']
  },
  { 
    nameKey: 'types.globalPositioning',
    slug: 'positioning', 
    icon: '📍',
    constellations: ['gps', 'glonass', 'galileo', 'beidou']
  },
  { 
    nameKey: 'types.earthImaging',
    slug: 'earth-imaging', 
    icon: '🛰️',
    constellations: ['planet', 'spire', 'jilin', 'yaogan']
  },
  { 
    nameKey: 'types.geostationary',
    slug: 'geostationary', 
    icon: '🔴',
    constellations: ['geo', 'intelsat', 'ses']
  },
  { 
    nameKey: 'types.spaceStations',
    slug: 'stations', 
    icon: '🏠',
    constellations: ['stations']
  },
  { 
    nameKey: 'types.allActive',
    slug: 'active', 
    icon: '✅',
    constellations: ['active']
  },
  { 
    nameKey: 'types.recentLaunches',
    slug: 'recent', 
    icon: '🚀',
    constellations: ['last-30-days']
  },
];

const TypesMenu = ({ onClose }) => {
  const { t } = useTranslation();
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
      <div className="dropdown-header">{t('types.title')}</div>
      
      {SATELLITE_TYPES.map((type) => (
        <div 
          key={type.slug}
          className="dropdown-item"
          onClick={() => handleSelect(type)}
        >
          <span className="dropdown-item-icon">{type.icon}</span>
          <span>{t(type.nameKey)}</span>
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
        <span>{t('types.clearAll')}</span>
      </div>
    </div>
  );
};

export default TypesMenu;
