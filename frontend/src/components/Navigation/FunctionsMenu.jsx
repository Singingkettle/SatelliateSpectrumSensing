/**
 * FunctionsMenu - Functions/Tools dropdown menu
 * Replicates satellitemap.space Functions dropdown
 */
import React, { useState } from 'react';
import { useUiStore } from '../../store/uiStore';

const FUNCTION_ITEMS = [
  { 
    name: 'Constellation Data', 
    slug: 'constellation-data', 
    icon: '📊',
    action: 'openConstellationData'
  },
  {
    name: 'Visualizer',
    icon: '👁️',
    children: [
      { name: 'Load...', slug: 'visualizer-load' },
      { name: 'Clear', slug: 'visualizer-clear' },
      { name: 'Clear/Reset', slug: 'visualizer-reset' },
      { name: 'Export CSV', slug: 'visualizer-export' },
      { name: 'Auto Play', slug: 'visualizer-autoplay' },
    ],
  },
  {
    name: 'Bookmarks',
    icon: '⭐',
    children: [
      { name: 'ISS', slug: 'bookmark-iss', noradId: 25544 },
      { name: 'CSS', slug: 'bookmark-css', noradId: 48274 },
      { name: 'HST', slug: 'bookmark-hst', noradId: 20580 },
    ],
  },
  {
    name: 'Calculator',
    icon: '🧮',
    children: [
      { name: 'Train', slug: 'calc-train', icon: '🚂' },
      { name: 'Transit', slug: 'calc-transit', icon: '🔀' },
      { name: 'Interference', slug: 'calc-interference', icon: '📶' },
      { name: 'Celestial', slug: 'calc-celestial', icon: '✨' },
      { name: 'Altitude History', slug: 'calc-altitude', icon: '📈' },
    ],
  },
  { name: 'Re-Entries', slug: 're-entries', icon: '🔥' },
  { name: 'TLE Analysis', slug: 'tle-analysis', icon: '📋' },
  { name: 'Photo Simulator', slug: 'photo-simulator', icon: '📷' },
  { name: 'Conjunction Search', slug: 'conjunction-search', icon: '🔀' },
];

const FunctionMenuItem = ({ item, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleClick = (e) => {
    e.stopPropagation();
    if (item.children) {
      setIsOpen(!isOpen);
    } else if (item.slug) {
      onSelect(item);
    }
  };
  
  return (
    <div className="dropdown-submenu">
      <div 
        className="dropdown-item"
        onClick={handleClick}
      >
        {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
        <span className="dropdown-item-text">{item.name}</span>
        {item.children && (
          <span className="dropdown-item-arrow">▶</span>
        )}
      </div>
      
      {item.children && isOpen && (
        <div className="dropdown-menu submenu">
          {item.children.map((child) => (
            <div 
              key={child.slug}
              className="dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(child);
              }}
            >
              {child.icon && <span className="dropdown-item-icon">{child.icon}</span>}
              <span>{child.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FunctionsMenu = ({ onClose }) => {
  const setShowConstellationData = useUiStore(s => s.setShowConstellationData);
  const setShowCalculatorModal = useUiStore(s => s.setShowCalculatorModal);
  
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
      <div className="dropdown-header">Tools & Functions</div>
      
      {FUNCTION_ITEMS.map((item) => (
        <FunctionMenuItem 
          key={item.name}
          item={item}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
};

export default FunctionsMenu;
