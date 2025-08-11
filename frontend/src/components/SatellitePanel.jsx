import React, { useState, useCallback, useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import { Checkbox, Spin, Typography, Alert, Tabs, Table, Select } from 'antd'
import { DownOutlined, GlobalOutlined, RocketOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'
import '../styles/ConstellationSelector.css'
import '../styles/SatellitePanel.css'

const { Text } = Typography

function SatellitePanel() {
    const { t } = useTranslation()
    const [isCollapsed, setIsCollapsed] = useState(false)

    // ----- store selectors -----------------------------------------------------
    const constellations = useConstellationStore((s) => s.constellations, shallow)
    const loadingConst = useConstellationStore((s) => s.loading && s.constellations.length === 0)
    const error = useConstellationStore((s) => s.error)
    const selectedConstellations = useConstellationStore((s) => s.selectedConstellations, shallow)
    const setSelectedConstellations = useConstellationStore((s) => s.setSelectedConstellations)

    const tleData = useConstellationStore((s) => s.tleData, shallow)
    const selectedSatellites = useConstellationStore((s) => s.selectedSatellites, shallow)
    const toggleSatelliteSelection = useConstellationStore((s) => s.toggleSatelliteSelection)
    const loadingTle = useConstellationStore((s) => s.loading)
    const pageSize = useConstellationStore((s) => s.pageSize)
    const setPageSize = useConstellationStore((s) => s.setPageSize)

    // ----- handlers ------------------------------------------------------------
    const handleConstellationChange = useCallback(
        (vals) => setSelectedConstellations(vals),
        [setSelectedConstellations],
    )

    const columns = useCallback(
        () => [
            {
                title: t('satelliteNameColumn'),
                dataIndex: 'name',
                key: 'name',
            },
        ],
        [t],
    )

    // build tab items only when data changes
    const tabItems = useMemo(() => {
        return selectedConstellations.map((name) => ({
            key: name,
            label: `${name} (${tleData[name]?.length || 0})`,
            children: (
                <Table
                    rowSelection={{
                        type: 'checkbox',
                        selectedRowKeys: selectedSatellites[name] || [],
                        onChange: (keys) => toggleSatelliteSelection(name, keys),
                    }}
                    columns={columns()}
                    dataSource={tleData[name]?.map((sat) => ({ ...sat, key: sat.name })) || []}
                    size="small"
                    pagination={{
                        pageSize,
                        simple: true,
                        showSizeChanger: true,
                        pageSizeOptions: ['5', '10', '20', '50', '100', '500', '1000'],
                        onShowSizeChange: (_cur, size) => setPageSize(size),
                        size: 'small',
                        className: 'satellite-pagination',
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
        }))
    }, [selectedConstellations, tleData, selectedSatellites, pageSize, t, toggleSatelliteSelection, setPageSize, columns])

    // ----- render --------------------------------------------------------------
    return (
        <div className="control-panel">
            {/* Panel Header */}
            <div
                className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                {/* combined icon */}
                <RocketOutlined className="panel-icon" />
                <span className="panel-title">{t('satellitePanelTitle')}</span>
                <DownOutlined className="panel-arrow" />
            </div>

            {!isCollapsed && (
                <>
                    {/* Constellation selector */}
                    <Spin spinning={loadingConst} tip={<span style={{ color: '#cccccc' }}>{t('loadingConstellations')}</span>}>
                        {error && constellations.length === 0 ? (
                            <div className="error-box">
                                <ExclamationCircleOutlined className="error-icon" />
                                <Text className="error-text">{error}</Text>
                            </div>
                        ) : (
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder={t('selectConstellations')}
                                dropdownStyle={{ backgroundColor: '#3c3c3c', color: '#e0e0e0' }}
                                popupClassName="constellation-select-dropdown"
                                value={selectedConstellations}
                                onChange={handleConstellationChange}
                                options={constellations.map((c) => ({ label: c.label, value: c.value }))}
                            />
                        )}
                    </Spin>

                    {/* Satellite table, show when at least one constellation selected */}
                    {selectedConstellations.length > 0 && (
                        <Spin spinning={loadingTle} tip={t('loadingTleData')}>
                            <div className="frosted-glass" style={{ marginTop: 16 }}>
                                <Tabs defaultActiveKey={selectedConstellations[0]} items={tabItems} className="satellite-selection-tabs" />
                            </div>
                        </Spin>
                    )}
                </>
            )}
        </div>
    )
}

export default React.memo(SatellitePanel)
