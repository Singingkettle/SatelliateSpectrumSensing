import React, { useState } from 'react';
import { Table, Checkbox, Tabs, Typography, Alert, Spin, Space } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { useConstellationStore } from '../store/constellationStore';

const { Title } = Typography;

const SatelliteSelectionView = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tleData = useConstellationStore((state) => state.tleData);
  const selectedSatellites = useConstellationStore(
    (state) => state.selectedSatellites
  );
  const toggleSatelliteSelection = useConstellationStore(
    (state) => state.toggleSatelliteSelection
  );
  const loading = useConstellationStore((state) => state.loading);
  const error = useConstellationStore((state) => state.error);
  const selectedConstellations = useConstellationStore(
    (state) => state.selectedConstellations
  );

  if (selectedConstellations.length === 0) {
    return null;
  }

  if (error) {
    return <Alert message={error} type="error" showIcon />;
  }

  const handleSelectAll = (constellationName, checked) => {
    const allSatelliteNames = tleData[constellationName].map((sat) => sat.name);
    toggleSatelliteSelection(
      constellationName,
      checked ? allSatelliteNames : []
    );
  };

  const columns = (constellationName) => [
    {
      title: '卫星名称',
      dataIndex: 'name',
      key: 'name',
    },
  ];

  const tabItems = selectedConstellations.map((name) => ({
    key: name,
    label: `${name} (${tleData[name]?.length || 0})`,
    children: (
      <Table
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys: selectedSatellites[name] || [],
          onChange: (selectedRowKeys) => {
            toggleSatelliteSelection(name, selectedRowKeys);
          },
        }}
        columns={columns(name)}
        dataSource={tleData[name]?.map((sat) => ({ ...sat, key: sat.name })) || []}
        size="small"
        pagination={{ pageSize: 10, simple: true }}
        expandable={{
          expandedRowRender: (record) => (
            <p style={{ margin: 0 }}>
              <b>Line 1:</b> {record.line1} <br />
              <b>Line 2:</b> {record.line2}
            </p>
          ),
        }}
      />
    ),
  }));

  return (
    <div>
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)} 
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <Space align="center">
          <Title level={4} style={{ marginBottom: 0 }}>
            卫星选择
          </Title>
          {isCollapsed ? <RightOutlined /> : <DownOutlined />}
        </Space>
      </div>
      {!isCollapsed && (
        <Spin spinning={loading} tip="正在加载TLE数据...">
          <Tabs defaultActiveKey={selectedConstellations[0]} items={tabItems} style={{ marginTop: '16px' }}/>
        </Spin>
      )}
    </div>
  );
};

export default SatelliteSelectionView;
