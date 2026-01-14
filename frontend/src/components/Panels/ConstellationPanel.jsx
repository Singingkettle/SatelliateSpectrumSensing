/**
 * ConstellationPanel - Select and manage satellite constellations
 */
import React, { useEffect } from 'react';
import { Checkbox, List, Tag, Spin, Badge, Typography, Button, Space } from 'antd';
import { ReloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { useSatelliteStore } from '../../store/satelliteStore';
import { updateConstellationTLE } from '../../api/satelliteApi';
import '../../styles/ConstellationPanel.css';

const { Text } = Typography;

const ConstellationPanel = () => {
  const constellations = useSatelliteStore(s => s.constellations);
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellationData = useSatelliteStore(s => s.constellationData);
  const loadingConstellations = useSatelliteStore(s => s.loadingConstellations);
  const loading = useSatelliteStore(s => s.loading);
  const error = useSatelliteStore(s => s.error);
  
  const fetchConstellations = useSatelliteStore(s => s.fetchConstellations);
  const toggleConstellation = useSatelliteStore(s => s.toggleConstellation);
  const getConstellationColor = useSatelliteStore(s => s.getConstellationColor);
  
  // Fetch constellations on mount
  useEffect(() => {
    if (constellations.length === 0) {
      fetchConstellations();
    }
  }, [constellations.length, fetchConstellations]);
  
  const handleToggle = async (slug) => {
    await toggleConstellation(slug);
  };
  
  const handleRefresh = async (slug, e) => {
    e.stopPropagation();
    try {
      await updateConstellationTLE(slug);
      // Reload constellation data
      await toggleConstellation(slug);
      await toggleConstellation(slug);
    } catch (error) {
      console.error('Error refreshing constellation:', error);
    }
  };
  
  const renderItem = (item) => {
    const slug = item.slug;
    const isSelected = selectedConstellations.includes(slug);
    const isLoading = loadingConstellations[slug];
    const data = constellationData[slug];
    const color = getConstellationColor(slug);
    const satelliteCount = data?.count || item.satellite_count || 0;
    
    return (
      <List.Item
        className={`constellation-item ${isSelected ? 'selected' : ''}`}
        onClick={() => handleToggle(slug)}
      >
        <div className="constellation-content">
          <Checkbox 
            checked={isSelected} 
            disabled={isLoading}
            onClick={(e) => e.stopPropagation()}
            onChange={() => handleToggle(slug)}
          />
          
          <div className="constellation-info">
            <div className="constellation-header">
              <Tag 
                color={color.hex}
                style={{ marginRight: 8 }}
              >
                {item.name}
              </Tag>
              {isLoading && <LoadingOutlined spin />}
            </div>
            
            <Text type="secondary" className="constellation-description">
              {item.description || 'Satellite constellation'}
            </Text>
            
            <div className="constellation-meta">
              <Badge 
                count={satelliteCount.toLocaleString()} 
                style={{ backgroundColor: isSelected ? color.hex : '#666' }}
                overflowCount={99999}
              />
              {isSelected && (
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={(e) => handleRefresh(slug, e)}
                  title="Refresh TLE data"
                />
              )}
            </div>
          </div>
        </div>
      </List.Item>
    );
  };
  
  if (loading && constellations.length === 0) {
    return (
      <div className="constellation-panel loading">
        <Spin tip="Loading constellations..." />
      </div>
    );
  }
  
  if (error && constellations.length === 0) {
    return (
      <div className="constellation-panel error">
        <Text type="danger">{error}</Text>
        <Button onClick={fetchConstellations} style={{ marginTop: 16 }}>
          Retry
        </Button>
      </div>
    );
  }
  
  return (
    <div className="constellation-panel">
      <div className="panel-header">
        <Text strong>Constellations</Text>
        <Text type="secondary">
          {selectedConstellations.length} selected
        </Text>
      </div>
      
      <List
        className="constellation-list"
        dataSource={constellations}
        renderItem={renderItem}
        size="small"
      />
    </div>
  );
};

export default React.memo(ConstellationPanel);
