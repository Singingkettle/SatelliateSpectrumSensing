/**
 * SpaceTrackStatus - Space-Track.org status monitoring panel
 * Replicates satellitemap.space/space-track-status
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Spin, Alert, Table, Tag, Statistic, Row, Col, Card, Timeline, Button } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { satelliteApi } from '../../api/satelliteApi';
import '../../styles/SpaceTrackStatus.css';

const SpaceTrackStatus = ({ visible, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await satelliteApi.getSpaceTrackStatus();
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch Space-Track status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchStatus();
    }
  }, [visible, fetchStatus]);

  const getStatusIcon = (apiStatus) => {
    switch (apiStatus) {
      case 'online':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />;
      case 'degraded':
        return <WarningOutlined style={{ color: '#faad14', fontSize: 24 }} />;
      case 'offline':
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />;
      default:
        return <WarningOutlined style={{ color: '#999', fontSize: 24 }} />;
    }
  };

  const getStatusColor = (apiStatus) => {
    switch (apiStatus) {
      case 'online': return '#52c41a';
      case 'degraded': return '#faad14';
      case 'offline':
      case 'error': return '#ff4d4f';
      default: return '#999';
    }
  };

  const tipColumns = [
    {
      title: 'Message Epoch',
      dataIndex: 'MSG_EPOCH',
      key: 'msg_epoch',
      width: 180,
    },
    {
      title: 'NORAD ID',
      dataIndex: 'NORAD_CAT_ID',
      key: 'norad',
      width: 100,
    },
    {
      title: 'Object Name',
      dataIndex: 'OBJECT_NAME',
      key: 'name',
    },
    {
      title: 'Window',
      dataIndex: 'WINDOW',
      key: 'window',
      width: 100,
    },
    {
      title: 'Decay Epoch',
      dataIndex: 'DECAY_EPOCH',
      key: 'decay',
      width: 180,
    },
    {
      title: 'Priority',
      dataIndex: 'MSG_TYPE',
      key: 'priority',
      width: 100,
      render: (type) => (
        <Tag color={type === 'HIGH' ? 'red' : type === 'MEDIUM' ? 'orange' : 'blue'}>
          {type || 'NORMAL'}
        </Tag>
      ),
    },
  ];

  const launchColumns = [
    {
      title: 'NORAD',
      dataIndex: 'NORAD_CAT_ID',
      key: 'norad',
      width: 80,
    },
    {
      title: 'Name',
      dataIndex: 'SATNAME',
      key: 'name',
    },
    {
      title: 'Launch Date',
      dataIndex: 'LAUNCH',
      key: 'launch',
      width: 120,
    },
    {
      title: 'Country',
      dataIndex: 'COUNTRY',
      key: 'country',
      width: 60,
    },
    {
      title: 'Site',
      dataIndex: 'SITE',
      key: 'site',
      width: 100,
    },
  ];

  return (
    <Modal
      title={
        <div className="spacetrack-header">
          <span className="spacetrack-title">Space-Track.org Status Monitor</span>
          <span className="spacetrack-subtitle">
            Real-time monitoring of SpaceTrack TLE updates, API status, and data delays
          </span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={null}
      className="spacetrack-modal"
    >
      <div className="spacetrack-content">
        <div className="spacetrack-toolbar">
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={fetchStatus}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {loading && !status && (
          <div className="spacetrack-loading">
            <Spin size="large" />
            <p>Loading Space-Track status data...</p>
          </div>
        )}

        {error && (
          <Alert
            message="Error loading data"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {status && (
          <>
            {/* Status Overview */}
            <Card className="status-card" size="small">
              <Row gutter={24} align="middle">
                <Col span={4} style={{ textAlign: 'center' }}>
                  {getStatusIcon(status.status)}
                  <div style={{ marginTop: 8 }}>
                    <Tag color={getStatusColor(status.status)}>
                      {status.status?.toUpperCase() || 'UNKNOWN'}
                    </Tag>
                  </div>
                </Col>
                <Col span={10}>
                  <Statistic
                    title="API Status"
                    value={status.message || 'No message'}
                    valueStyle={{ fontSize: 14 }}
                  />
                </Col>
                <Col span={5}>
                  <Statistic
                    title="Authenticated"
                    value={status.authenticated ? 'Yes' : 'No'}
                    valueStyle={{ 
                      color: status.authenticated ? '#52c41a' : '#ff4d4f',
                      fontSize: 14
                    }}
                  />
                </Col>
                <Col span={5}>
                  <Statistic
                    title="Last Check"
                    value={status.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-'}
                    valueStyle={{ fontSize: 14 }}
                  />
                </Col>
              </Row>
            </Card>

            {/* Boxscore Statistics */}
            {status.boxscore && (
              <Card title="Space Object Statistics" size="small" className="stats-card">
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="Total Objects"
                      value={status.boxscore.SATCAT_COUNT || '-'}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="On Orbit"
                      value={status.boxscore.DECAY_COUNT ? 
                        (status.boxscore.SATCAT_COUNT - status.boxscore.DECAY_COUNT) : '-'}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Decayed"
                      value={status.boxscore.DECAY_COUNT || '-'}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Countries"
                      value={status.boxscore.COUNTRY_TOTAL || '-'}
                    />
                  </Col>
                </Row>
              </Card>
            )}

            {/* TLE Update Stats Chart */}
            {status.tle_stats && status.tle_stats.length > 0 && (
              <Card title="TLE Updates per Day (Last 21 Days)" size="small" className="chart-card">
                <div className="tle-chart">
                  {status.tle_stats.map((stat, index) => (
                    <div 
                      key={index} 
                      className="tle-bar-container"
                      title={`${stat.date}: ${stat.count} updates`}
                    >
                      <div 
                        className="tle-bar"
                        style={{ 
                          height: `${Math.min(100, (stat.count / Math.max(...status.tle_stats.map(s => s.count))) * 100)}%`
                        }}
                      />
                      <span className="tle-date">{stat.date?.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Announcements */}
            {status.announcements && status.announcements.length > 0 && (
              <Card title="Latest Space-Track Announcement" size="small" className="announcement-card">
                <Timeline
                  items={status.announcements.map((ann, index) => ({
                    key: index,
                    color: 'blue',
                    children: (
                      <div>
                        <Tag color="blue">{ann.announcement_type || 'GENERAL'}</Tag>
                        <p className="announcement-text">{ann.announcement_text}</p>
                        <small className="announcement-date">
                          {ann.announcement_start}
                        </small>
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}

            {/* TIP Messages Table */}
            <Card title="Last issued TIP Messages (Tracking and Impact Prediction)" size="small">
              <Table
                columns={tipColumns}
                dataSource={status.tip_messages || []}
                rowKey={(record, index) => record.NORAD_CAT_ID || index}
                size="small"
                pagination={false}
                scroll={{ y: 200 }}
                locale={{ emptyText: 'No TIP messages available' }}
              />
            </Card>

            {/* Recent Launches */}
            {status.recent_launches && status.recent_launches.length > 0 && (
              <Card title="Recent Launches (Last 7 Days)" size="small" style={{ marginTop: 16 }}>
                <Table
                  columns={launchColumns}
                  dataSource={status.recent_launches}
                  rowKey={(record) => record.NORAD_CAT_ID}
                  size="small"
                  pagination={false}
                  scroll={{ y: 200 }}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default SpaceTrackStatus;
