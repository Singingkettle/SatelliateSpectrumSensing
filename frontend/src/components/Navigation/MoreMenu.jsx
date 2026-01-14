/**
 * MoreMenu - Additional options dropdown
 * Replicates satellitemap.space More dropdown
 */
import React from 'react';
import { useUiStore } from '../../store/uiStore';

const MORE_ITEMS = [
  { name: 'Login', slug: 'login', icon: '👤' },
  { name: 'Settings', slug: 'settings', icon: '⚙️' },
  { name: 'Feedback', slug: 'feedback', icon: '💬' },
  { name: 'Credits', slug: 'credits', icon: '📜' },
  { name: 'Info & Updates', slug: 'info-updates', icon: 'ℹ️' },
  { name: 'Space-track Status', slug: 'spacetrack-status', icon: '📡' },
];

const MoreMenu = ({ onClose }) => {
  const setShowSettingsModal = useUiStore(s => s.setShowSettingsModal);
  const setShowSpaceTrackStatus = useUiStore(s => s.setShowSpaceTrackStatus);
  
  const handleSelect = (slug) => {
    switch (slug) {
      case 'settings':
        setShowSettingsModal(true);
        break;
      case 'login':
        // TODO: Implement login
        console.log('Open login');
        break;
      case 'feedback':
        window.open('mailto:feedback@example.com', '_blank');
        break;
      case 'credits':
        // TODO: Show credits modal
        console.log('Show credits');
        break;
      case 'info-updates':
        // TODO: Show updates modal
        console.log('Show info & updates');
        break;
      case 'spacetrack-status':
        setShowSpaceTrackStatus(true);
        break;
      default:
        console.log('Selected:', slug);
    }
    onClose();
  };
  
  return (
    <div className="dropdown-menu more-menu">
      <div className="dropdown-header">More Options</div>
      
      {MORE_ITEMS.map((item) => (
        <div 
          key={item.slug}
          className="dropdown-item"
          onClick={() => handleSelect(item.slug)}
        >
          <span className="dropdown-item-icon">{item.icon}</span>
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
};

export default MoreMenu;
