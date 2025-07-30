import React, { useState } from 'react';
import { Table, Tabs, Typography, Alert, Spin } from 'antd';
import { DownOutlined, RocketOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConstellationStore } from '../store/constellationStore';

const SatelliteSelectionView = () => {
    const { t } = useTranslation();
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
    const pageSize = useConstellationStore((state) => state.pageSize);
    const setPageSize = useConstellationStore((state) => state.setPageSize);

    if (selectedConstellations.length === 0) {
        return null;
    }

    if (error) {
        return <Alert message={error} type="error" showIcon />;
    }

    const columns = (constellationName) => [
        {
            title: t('satelliteNameColumn'),
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
                pagination={{
                    pageSize: pageSize,
                    simple: true,
                    showSizeChanger: true,
                    pageSizeOptions: ['5', '10', '20', '50', '100'],
                    onShowSizeChange: (current, size) => setPageSize(size),
                    size: 'small',
                    className: 'satellite-pagination'
                }}
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
        <div className="control-panel">
            <div
                className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <RocketOutlined className="panel-icon" />
                <span className="panel-title">{t('satelliteSelectionTitle')}</span>
                <DownOutlined className="panel-arrow" />
            </div>

            {!isCollapsed && (
                <Spin spinning={loading} tip={t('loadingTleData')}>
                    <div className="frosted-glass">
                        <Tabs
                            defaultActiveKey={selectedConstellations[0]}
                            items={tabItems}
                            className="satellite-selection-tabs"
                        />
                    </div>
                </Spin>
            )}
        </div>
    );
};

export default SatelliteSelectionView;
