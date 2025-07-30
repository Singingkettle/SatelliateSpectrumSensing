import React, { useState, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { Checkbox, Spin, Typography } from 'antd';
import { GlobalOutlined, DownOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConstellationStore } from '../store/constellationStore';
import '../styles/ConstellationSelector.css'; // Import custom CSS

const { Text } = Typography;

const ConstellationSelector = () => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const constellations = useConstellationStore((s) => s.constellations, shallow)
  const loading = useConstellationStore((s) => s.loading && s.constellations.length === 0)
  const error = useConstellationStore((s) => s.error)
  const selectedConstellations = useConstellationStore((s) => s.selectedConstellations, shallow)
  const setSelectedConstellations = useConstellationStore((s) => s.setSelectedConstellations)
  const handleChange = useCallback((vals) => setSelectedConstellations(vals), [setSelectedConstellations])

  return (
    <div className="control-panel">
      {/* Panel Header */}
      <div
        className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <GlobalOutlined className="panel-icon" />
        <span className="panel-title">{t('constellationSelectorTitle')}</span>
        <DownOutlined className="panel-arrow" />
      </div>

      {/* Content Area */}
      {!isCollapsed && (
        <Spin spinning={loading} tip={<span style={{ color: '#cccccc' }}>{t('loadingConstellations')}</span>}>
          {error && constellations.length === 0 ? (
            <div className="error-box">
              <ExclamationCircleOutlined className="error-icon" />
              <Text className="error-text">{error}</Text>
            </div>
          ) : (
            <Checkbox.Group
              style={{ width: '100%' }}
              value={selectedConstellations}
              onChange={handleChange}
            >
              <div className="constellation-list">
                {constellations.map((constellation) => (
                  <div
                    key={constellation.value}
                    className={`constellation-item ${selectedConstellations.includes(constellation.value) ? 'selected' : ''}`}
                  >
                    <Checkbox value={constellation.value}>
                      <span className="constellation-label">
                        {constellation.label}
                      </span>
                    </Checkbox>
                    {constellation.description && (
                      <div className="constellation-description">
                        {constellation.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Checkbox.Group>
          )}
        </Spin>
      )
      }
    </div >
  );
};

export default React.memo(ConstellationSelector);
