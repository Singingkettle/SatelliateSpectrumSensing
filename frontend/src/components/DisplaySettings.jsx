import React, { useState } from 'react';
import { Switch, Typography, Dropdown, Button, Menu } from 'antd';
import { SettingOutlined, DownOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConstellationStore } from '../store/constellationStore';
import '../styles/DisplaySettings.css';

const { Text } = Typography;

const DisplaySettings = () => {
    const { t, i18n } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const showOrbits = useConstellationStore((state) => state.showOrbits);
    const setOrbitDisplay = useConstellationStore((state) => state.setOrbitDisplay);

    const handleOrbitToggle = (checked) => {
        setOrbitDisplay(checked);
    };

    const handleLanguageChange = (e) => {
        i18n.changeLanguage(e.key);
    };

    const languageMenu = (
        <Menu onClick={handleLanguageChange} selectedKeys={[i18n.language]}>
            <Menu.Item key="zh">中文</Menu.Item>
            <Menu.Item key="en">English</Menu.Item>
        </Menu>
    );

    return (
        <div className="control-panel">
            {/* Panel Header */}
            <div
                className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <SettingOutlined className="panel-icon" />
                <span className="panel-title">{t('displaySettingsTitle')}</span>
                <DownOutlined className="panel-arrow" />
            </div>

            {!isCollapsed && (
                <div className="display-settings-content">
                    {/* Language Switcher */}
                    <div className="control-item">
                        <Text className="control-label">{t('language')}</Text>
                        <Dropdown overlay={languageMenu} trigger={['click']}>
                            <Button size="small" icon={<GlobalOutlined />}>
                                {i18n.language === 'zh' ? '中文' : 'English'}
                            </Button>
                        </Dropdown>
                    </div>

                    {/* Orbit Trail Control */}
                    <div className="control-item">
                        <div>
                            <Text className="control-label">{t('orbitDisplay')}</Text>
                            <Text className="control-description">
                                {showOrbits
                                    ? t('orbitDisplayDescriptionOn')
                                    : t('orbitDisplayDescriptionOff')
                                }
                            </Text>
                        </div>
                        <Switch
                            checked={showOrbits}
                            onChange={handleOrbitToggle}
                            size="small"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default DisplaySettings;
