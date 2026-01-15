/**
 * MoreMenu - Additional options dropdown
 * Replicates satellitemap.space More dropdown
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';

const MORE_ITEMS = [
  { nameKey: 'more.login', slug: 'login', icon: '👤' },
  { nameKey: 'more.settings', slug: 'settings', icon: '⚙️' },
  { nameKey: 'more.feedback', slug: 'feedback', icon: '💬' },
  { nameKey: 'more.credits', slug: 'credits', icon: '📜' },
  { nameKey: 'more.infoUpdates', slug: 'info-updates', icon: 'ℹ️' },
  { nameKey: 'more.spacetrackStatus', slug: 'spacetrack-status', icon: '📡' },
];

const MoreMenu = ({ onClose }) => {
  const { t } = useTranslation();
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
      <div className="dropdown-header">{t('more.title')}</div>
      
      {MORE_ITEMS.map((item) => (
        <div 
          key={item.slug}
          className="dropdown-item"
          onClick={() => handleSelect(item.slug)}
        >
          <span className="dropdown-item-icon">{item.icon}</span>
          <span>{t(item.nameKey)}</span>
        </div>
      ))}
    </div>
  );
};

export default MoreMenu;
