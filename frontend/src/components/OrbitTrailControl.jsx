import React, { useState } from 'react';
import { Switch, Typography } from 'antd';
import { SettingOutlined, DownOutlined, EyeOutlined } from '@ant-design/icons';
import { useConstellationStore } from '../store/constellationStore';
import '../styles/OrbitTrailControl.css';

const { Text } = Typography;

const OrbitTrailControl = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const showOrbits = useConstellationStore((state) => state.showOrbits);
    const setOrbitDisplay = useConstellationStore((state) => state.setOrbitDisplay);
    const selectedSatellites = useConstellationStore((state) => state.selectedSatellites);

    const totalSelectedSatellites = Object.values(selectedSatellites).reduce(
        (total, satellites) => total + satellites.length,
        0
    );

    const handleOrbitToggle = (checked) => {
        setOrbitDisplay(checked);
    };

    return (
        <div className="control-panel">
            {/* Panel Header */}
            <div
                className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <SettingOutlined className="panel-icon" />
                <span className="panel-title">Display Settings</span>
                <DownOutlined className="panel-arrow" />
            </div>

            {!isCollapsed && (
                <div className="orbit-control-content">
                    {/* Satellite Stats */}
                    <div className="satellite-stats">
                        <EyeOutlined />
                        Loaded: {totalSelectedSatellites} satellites
                    </div>

                    {/* Orbit Trail Control */}
                    <div className="control-item">
                        <div>
                            <Text className="control-label">Orbit Display</Text>
                            <Text className="control-description">
                                {showOrbits
                                    ? 'Show complete orbit ellipses for all loaded satellites'
                                    : 'Hide complete orbit ellipses for all loaded satellites'
                                }
                            </Text>
                        </div>
                        <Switch
                            checked={showOrbits}
                            onChange={handleOrbitToggle}
                            size="small"
                        />
                    </div>

                    {/* Status Indicator */}
                    <div className="status-indicator">
                        {showOrbits ? '✓ Orbit display is ON' : '○ Orbit display is OFF'}
                        {totalSelectedSatellites > 0 && (
                            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                                (Affects {totalSelectedSatellites} satellites)
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrbitTrailControl;
