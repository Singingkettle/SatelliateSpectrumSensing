import React, { useState } from 'react';
import { Checkbox, Spin, Typography } from 'antd';
import { GlobalOutlined, DownOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useConstellationStore } from '../store/constellationStore';
import '../styles/ConstellationSelector.css'; // Import custom CSS

const { Text } = Typography;

const ConstellationSelector = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const constellations = useConstellationStore((state) => state.constellations);
  const loading = useConstellationStore(
    (state) => state.loading && state.constellations.length === 0
  );
  const error = useConstellationStore((state) => state.error);
  const selectedConstellations = useConstellationStore(
    (state) => state.selectedConstellations
  );
  const setSelectedConstellations = useConstellationStore(
    (state) => state.setSelectedConstellations
  );

  return (
    <div className="control-panel">
      {/* Panel Header */}
      <div
        className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <GlobalOutlined className="panel-icon" />
        <span className="panel-title">卫星星座</span>
        <DownOutlined className="panel-arrow" />
      </div>

      {/* Content Area */}
      {!isCollapsed && (
        <Spin spinning={loading} tip={<span style={{ color: '#cccccc' }}>Loading constellations...</span>}>
          {error && constellations.length === 0 ? (
            <div className="error-box">
              <ExclamationCircleOutlined className="error-icon" />
              <Text className="error-text">{error}</Text>
            </div>
          ) : (
            <Checkbox.Group
              style={{ width: '100%' }}
              value={selectedConstellations}
              onChange={setSelectedConstellations}
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
      )}
    </div>
  );
};

export default ConstellationSelector;
