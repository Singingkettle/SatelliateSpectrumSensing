/**
 * SettingsPanel - Display and control visualization settings
 */
import React from 'react';
import { Card, Switch, Slider, Typography, Space, Divider, Button } from 'antd';
import { 
  EyeOutlined, 
  BulbOutlined, 
  GlobalOutlined,
  StarOutlined,
  AimOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/SettingsPanel.css';

const { Text } = Typography;

const SettingsPanel = () => {
  // UI Store
  const sceneMode = useUiStore(s => s.sceneMode);
  const lightingEnabled = useUiStore(s => s.lightingEnabled);
  const showAtmosphere = useUiStore(s => s.showAtmosphere);
  const showStars = useUiStore(s => s.showStars);
  const toggleSceneMode = useUiStore(s => s.toggleSceneMode);
  const toggleLighting = useUiStore(s => s.toggleLighting);
  const toggleAtmosphere = useUiStore(s => s.toggleAtmosphere);
  const toggleStars = useUiStore(s => s.toggleStars);
  
  // Satellite Store
  const showOrbits = useSatelliteStore(s => s.showOrbits);
  const showLabels = useSatelliteStore(s => s.showLabels);
  const showGroundStations = useSatelliteStore(s => s.showGroundStations);
  const toggleShowOrbits = useSatelliteStore(s => s.toggleShowOrbits);
  const toggleShowLabels = useSatelliteStore(s => s.toggleShowLabels);
  const toggleGroundStations = useSatelliteStore(s => s.toggleGroundStations);
  const loadGroundStations = useSatelliteStore(s => s.loadGroundStations);
  
  return (
    <div className="settings-panel">
      <div className="panel-header">
        <Text strong>Display Settings</Text>
      </div>
      
      <Card size="small" className="settings-card">
        <div className="settings-section">
          <Text strong>Scene</Text>
          
          <div className="setting-item">
            <Space>
              <GlobalOutlined />
              <Text>View Mode</Text>
            </Space>
            <Switch
              checked={sceneMode === '3D'}
              onChange={toggleSceneMode}
              checkedChildren="3D"
              unCheckedChildren="2D"
            />
          </div>
          
          <div className="setting-item">
            <Space>
              <BulbOutlined />
              <Text>Day/Night Lighting</Text>
            </Space>
            <Switch
              checked={lightingEnabled}
              onChange={toggleLighting}
            />
          </div>
          
          <div className="setting-item">
            <Space>
              <GlobalOutlined />
              <Text>Atmosphere</Text>
            </Space>
            <Switch
              checked={showAtmosphere}
              onChange={toggleAtmosphere}
            />
          </div>
          
          <div className="setting-item">
            <Space>
              <StarOutlined />
              <Text>Stars</Text>
            </Space>
            <Switch
              checked={showStars}
              onChange={toggleStars}
            />
          </div>
        </div>
        
        <Divider />
        
        <div className="settings-section">
          <Text strong>Satellites</Text>
          
          <div className="setting-item">
            <Space>
              <EyeOutlined />
              <Text>Orbit Paths</Text>
            </Space>
            <Switch
              checked={showOrbits}
              onChange={toggleShowOrbits}
            />
          </div>
          
          <div className="setting-item">
            <Space>
              <AimOutlined />
              <Text>Labels</Text>
            </Space>
            <Switch
              checked={showLabels}
              onChange={toggleShowLabels}
            />
          </div>
        </div>
        
        <Divider />
        
        <div className="settings-section">
          <Text strong>Ground Stations</Text>
          
          <div className="setting-item">
            <Space>
              <GlobalOutlined />
              <Text>Show Stations</Text>
            </Space>
            <Switch
              checked={showGroundStations}
              onChange={toggleGroundStations}
            />
          </div>
          
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={() => loadGroundStations()}
            size="small"
            style={{ marginTop: 8 }}
          >
            Refresh Stations
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default React.memo(SettingsPanel);
