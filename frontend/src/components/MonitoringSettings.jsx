import React, { useMemo, useState } from 'react'
import { Select, InputNumber, Typography } from 'antd'
import { DownOutlined, RadarChartOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'

const { Text } = Typography

function MonitoringSettings() {
    const { t } = useTranslation()
    const [isCollapsed, setIsCollapsed] = useState(false)

    const strategy = useConstellationStore((s) => s.monitoringStrategy)
    const target = useConstellationStore((s) => s.monitoringTarget)
    const distanceKm = useConstellationStore((s) => s.monitoringDistanceKm)

    const setStrategy = useConstellationStore((s) => s.setMonitoringStrategy)
    const setTarget = useConstellationStore((s) => s.setMonitoringTarget)
    const setDistanceKm = useConstellationStore((s) => s.setMonitoringDistanceKm)

    const selectedSatellitesMap = useConstellationStore((s) => s.selectedSatellites)

    const targetOptions = useMemo(() => {
        const lists = Object.values(selectedSatellitesMap || {})
        const flat = lists.flat().filter(Boolean)
        const unique = Array.from(new Set(flat))
        return unique.map((name) => ({ label: name, value: name }))
    }, [selectedSatellitesMap])

    return (
        <div className="control-panel">
            <div className={`panel-header ${isCollapsed ? 'collapsed' : ''}`} onClick={() => setIsCollapsed(!isCollapsed)}>
                <RadarChartOutlined className="panel-icon" />
                <span className="panel-title">{t('monitoringTitle')}</span>
                <DownOutlined className="panel-arrow" />
            </div>

            {!isCollapsed && (
                <div className="display-settings-content">
                    {/* Strategy */}
                    <div className="control-item">
                        <Text className="control-label">{t('monitoringStrategy')}</Text>
                        <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={strategy === 'none' ? undefined : strategy}
                            placeholder={t('monitoringStrategyPlaceholder')}
                            onChange={(v) => setStrategy(v)}
                            options={[{ label: t('coOrbiting'), value: 'accompany' }]}
                            allowClear
                        />
                    </div>

                    {/* Target (only if accompany) */}
                    {strategy === 'accompany' && (
                        <div className="control-item">
                            <Text className="control-label">{t('monitoringTarget')}</Text>
                            <Select
                                showSearch
                                size="small"
                                style={{ width: '100%' }}
                                value={target || undefined}
                                placeholder={t('monitoringTargetPlaceholder')}
                                onChange={(v) => setTarget(v)}
                                options={targetOptions}
                                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            />
                        </div>
                    )}

                    {/* Distance (only if accompany) */}
                    {strategy === 'accompany' && (
                        <div className="control-item" style={{ alignItems: 'center' }}>
                            <Text className="control-label">{t('monitoringDistance')}</Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <InputNumber
                                    size="small"
                                    min={0.1}
                                    max={10000}
                                    step={0.1}
                                    value={distanceKm}
                                    onChange={(v) => setDistanceKm(typeof v === 'number' ? v : 5)}
                                />
                                <Text type="secondary">{t('km')}</Text>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default MonitoringSettings
