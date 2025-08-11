import React from 'react'
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'
import '../styles/StatusDisplay.css'

function StatusDisplay() {
    const { t } = useTranslation()
    const showOrbits = useConstellationStore((state) => state.showOrbits)
    const selectedSatellites = useConstellationStore((state) => state.selectedSatellites)
    const lightingEnabled = useConstellationStore((s) => s.lightingEnabled)
    const sceneMode = useConstellationStore((s) => s.sceneMode)

    const totalSelectedSatellites = Object.values(selectedSatellites).reduce(
        (total, sats) => total + sats.length,
        0,
    )

    return (
        <div className="status-display-container">
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
            <div className="status-item">
                {lightingEnabled ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                    <CloseCircleOutlined style={{ color: '#f14c4c' }} />
                )}
                <span>光照: {lightingEnabled ? '开启' : '关闭'}</span>
            </div>
            <div className="status-item">
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>视图: {sceneMode}</span>
            </div>
        </div>
    )
}

export default StatusDisplay
