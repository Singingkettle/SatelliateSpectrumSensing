/**
 * ControlPanel - Main sidebar control panel
 * Contains tabs for constellation selection, search, satellite info, and settings
 */
import React from 'react';
import { Layout, Menu, Button, Tooltip } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  PushpinOutlined,
  PushpinFilled,
} from '@ant-design/icons';
import { useUiStore, SIDER_WIDTH } from '../store/uiStore';
import { ConstellationPanel, SearchPanel, SatelliteInfoPanel, SettingsPanel } from './Panels';
import '../styles/ControlPanel.css';

const { Sider } = Layout;

const ControlPanel = () => {
  const panelCollapsed = useUiStore(s => s.panelCollapsed);
  const panelPinned = useUiStore(s => s.panelPinned);
  const activePanel = useUiStore(s => s.activePanel);
  const setPanelCollapsed = useUiStore(s => s.setPanelCollapsed);
  const togglePanelPinned = useUiStore(s => s.togglePanelPinned);
  const setActivePanel = useUiStore(s => s.setActivePanel);
  
  const handleMenuClick = ({ key }) => {
    setActivePanel(key);
  };

    const handleMouseEnter = () => {
    if (!panelPinned && panelCollapsed) {
      setPanelCollapsed(false);
    }
  };
  
    const handleMouseLeave = () => {
    if (!panelPinned && !panelCollapsed) {
      setPanelCollapsed(true);
    }
  };
  
  const menuItems = [
    {
      key: 'constellations',
      icon: <GlobalOutlined />,
      label: 'Constellations',
    },
    {
      key: 'search',
      icon: <SearchOutlined />,
      label: 'Search',
    },
    {
      key: 'info',
      icon: <InfoCircleOutlined />,
      label: 'Satellite Info',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];
  
  const renderActivePanel = () => {
    switch (activePanel) {
      case 'constellations':
        return <ConstellationPanel />;
      case 'search':
        return <SearchPanel />;
      case 'info':
        return <SatelliteInfoPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ConstellationPanel />;
    }
  };

    return (
    <Sider
      width={SIDER_WIDTH}
      collapsed={panelCollapsed}
      collapsedWidth={50}
      className="control-panel-sider"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
      trigger={null}
        >
      <div className="control-panel">
        {/* Header */}
        <div className="panel-toolbar">
          {!panelCollapsed && (
            <span className="panel-title">Satellite Tracker</span>
          )}
          
          <div className="toolbar-buttons">
            {!panelCollapsed && (
              <Tooltip title={panelPinned ? 'Unpin panel' : 'Pin panel'}>
                <Button
                  type="text"
                  icon={panelPinned ? <PushpinFilled /> : <PushpinOutlined />}
                        onClick={togglePanelPinned}
                  className={panelPinned ? 'pinned' : ''}
                    />
                </Tooltip>
            )}
            
            <Button
              type="text"
              icon={panelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setPanelCollapsed(!panelCollapsed)}
            />
          </div>
            </div>

        {/* Navigation Menu */}
        <Menu
          mode="inline"
          selectedKeys={[activePanel]}
          onClick={handleMenuClick}
          items={menuItems}
          className="panel-menu"
          inlineCollapsed={panelCollapsed}
        />
        
        {/* Active Panel Content */}
        {!panelCollapsed && (
          <div className="panel-content">
            {renderActivePanel()}
          </div>
        )}
            </div>
    </Sider>
  );
};

export default React.memo(ControlPanel);
