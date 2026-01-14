/**
 * SatelliteInfoPanel - Display detailed satellite information
 */
import React from 'react';
import { Card, Descriptions, Tag, Button, Spin, Typography, Divider, Space } from 'antd';
import { 
  CloseOutlined, 
  AimOutlined, 
  HistoryOutlined,
  GlobalOutlined 
} from '@ant-design/icons';
import { useSatelliteStore, CONSTELLATION_COLORS } from '../../store/satelliteStore';
import '../../styles/SatelliteInfoPanel.css';

const { Text, Title } = Typography;

const SatelliteInfoPanel = () => {
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const loading = useSatelliteStore(s => s.loading);
  const clearSatelliteSelection = useSatelliteStore(s => s.clearSatelliteSelection);
  
  if (!selectedSatellite && !loading) {
    return (
      <div className="satellite-info-panel empty">
        <GlobalOutlined style={{ fontSize: 48, opacity: 0.3 }} />
        <Text type="secondary">
          Click on a satellite to view details
        </Text>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="satellite-info-panel loading">
        <Spin tip="Loading satellite data..." />
      </div>
    );
  }
  
  const sat = selectedSatellite;
  const constellation = sat.constellation;
  const color = constellation 
    ? CONSTELLATION_COLORS[constellation.slug] || CONSTELLATION_COLORS.default
    : CONSTELLATION_COLORS.default;
  
  return (
    <div className="satellite-info-panel">
      <Card
        className="satellite-card"
        title={
          <div className="card-title">
            <Space>
              <AimOutlined />
              <span>{sat.name}</span>
            </Space>
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={clearSatelliteSelection}
            />
          </div>
        }
        size="small"
      >
        {constellation && (
          <Tag color={color.hex} style={{ marginBottom: 12 }}>
            {constellation.name}
          </Tag>
        )}
        
        <Descriptions column={1} size="small">
          <Descriptions.Item label="NORAD ID">
            <Text code>{sat.norad_id}</Text>
          </Descriptions.Item>
          
          {sat.intl_designator && (
            <Descriptions.Item label="Int'l Designator">
              {sat.intl_designator}
            </Descriptions.Item>
          )}
          
          {sat.launch_date && (
            <Descriptions.Item label="Launch Date">
              {new Date(sat.launch_date).toLocaleDateString()}
            </Descriptions.Item>
          )}
          
          {sat.country_code && (
            <Descriptions.Item label="Country">
              {sat.country_code}
            </Descriptions.Item>
          )}
        </Descriptions>
        
        <Divider orientation="left" plain>
          <HistoryOutlined /> Orbital Parameters
        </Divider>
        
        <Descriptions column={1} size="small">
          {sat.inclination !== null && (
            <Descriptions.Item label="Inclination">
              {sat.inclination.toFixed(2)}°
            </Descriptions.Item>
          )}
          
          {sat.period_minutes !== null && (
            <Descriptions.Item label="Period">
              {sat.period_minutes.toFixed(2)} min
            </Descriptions.Item>
          )}
          
          {sat.apogee_km !== null && (
            <Descriptions.Item label="Apogee">
              {sat.apogee_km.toFixed(1)} km
            </Descriptions.Item>
          )}
          
          {sat.perigee_km !== null && (
            <Descriptions.Item label="Perigee">
              {sat.perigee_km.toFixed(1)} km
            </Descriptions.Item>
          )}
          
          {sat.eccentricity !== null && (
            <Descriptions.Item label="Eccentricity">
              {sat.eccentricity.toFixed(6)}
            </Descriptions.Item>
          )}
          
          {sat.mean_motion !== null && (
            <Descriptions.Item label="Mean Motion">
              {sat.mean_motion.toFixed(4)} rev/day
            </Descriptions.Item>
          )}
        </Descriptions>
        
        {sat.tle && (
          <>
            <Divider orientation="left" plain>
              TLE Data
            </Divider>
            
            <div className="tle-data">
              <Text code className="tle-line">{sat.tle.line1}</Text>
              <Text code className="tle-line">{sat.tle.line2}</Text>
            </div>
            
            {sat.tle.epoch && (
              <Text type="secondary" className="tle-epoch">
                Epoch: {new Date(sat.tle.epoch).toLocaleString()}
              </Text>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default React.memo(SatelliteInfoPanel);
