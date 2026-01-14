import React from 'react';
import { Layout, Menu, Button, Space, Input } from 'antd';
import { ShareAltOutlined, SearchOutlined, RocketOutlined } from '@ant-design/icons';
import { useUiStore } from '../../store/uiStore';
import './TopNavBar.css';

const { Header } = Layout;

const TopNavBar = () => {
  const setActivePanel = useUiStore(s => s.setActivePanel);
  const setPanelCollapsed = useUiStore(s => s.setPanelCollapsed);

  const handleMenuClick = ({ key }) => {
    setActivePanel(key);
    setPanelCollapsed(false);
  };

  const menuItems = [
    {
      key: 'constellations',
      label: 'Constellations',
      // Removed children to make it a direct action for now, or we can keep children for filtering
      // For now, let's make the main item open the panel
    },
    {
      key: 'types',
      label: 'Types',
      children: [
        { key: 'internet', label: 'Internet' },
        { key: 'navigation', label: 'Navigation' },
      ],
    },
    {
      key: 'functions',
      label: 'Functions',
      children: [
        { key: 'visualizer', label: 'Visualizer' },
        { key: 'planner', label: 'Planner' },
      ],
    },
    {
      key: 'more',
      label: 'More',
      children: [
        { key: 'about', label: 'About' },
        { key: 'settings', label: 'Settings' },
      ],
    },
  ];

  return (
    <Header className="top-nav-bar">
      <div className="logo">
        <RocketOutlined className="logo-icon" />
        <span className="logo-text">satellitemap.space</span>
      </div>
      
      <div className="nav-menu-container">
        <Menu
          theme="dark"
          mode="horizontal"
          items={menuItems}
          className="nav-menu"
          disabledOverflow
          onClick={handleMenuClick}
        />
      </div>

      <div className="nav-actions">
        <Space>
          <Button type="text" icon={<ShareAltOutlined />}>Share</Button>
          <Input 
            placeholder="Search..." 
            prefix={<SearchOutlined />} 
            className="search-input"
            bordered={false}
            onClick={() => {
              setActivePanel('search');
              setPanelCollapsed(false);
            }}
          />
        </Space>
      </div>
    </Header>
  );
};

export default TopNavBar;
