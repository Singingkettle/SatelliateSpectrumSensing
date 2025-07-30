import React from 'react'
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'
import { useUiStore } from '../store/uiStore'
import '../styles/StatusDisplay.css'

function StatusDisplay() {
    const { t } = useTranslation()
    const showOrbits = useConstellationStore((state) => state.showOrbits)
    const selectedSatellites = useConstellationStore((state) => state.selectedSatellites)
    const _panelCollapsed = useUiStore((s) => s.panelCollapsed) // 触发重新渲染

    const totalSelectedSatellites = Object.values(selectedSatellites).reduce(
        (total, sats) => total + sats.length,
        0,
    )

    return (
        <div
            className="status-display-container"
            style={{ left: 20, transition: 'left 0.3s ease' }}
        >
            <div className="status-item">
                <EyeOutlined />
                <span>{t('loadedSatellites', { count: totalSelectedSatellites })}</span>
            </div>
            <div className="status-item">
                {showOrbits ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                    <CloseCircleOutlined style={{ color: '#f14c4c' }} />
                )}
                <span>
                    {t('orbitDisplay')}: {showOrbits ? t('statusOn') : t('statusOff')}
                </span>
            </div>
        </div>
    )
}

export default StatusDisplay
