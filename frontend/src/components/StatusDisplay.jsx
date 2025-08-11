import React from 'react'
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, AimOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'
import '../styles/StatusDisplay.css'

function StatusDisplay() {
    const { t } = useTranslation()
    const showOrbits = useConstellationStore((state) => state.showOrbits)
    const selectedSatellites = useConstellationStore((state) => state.selectedSatellites)
    const lightingEnabled = useConstellationStore((s) => s.lightingEnabled)
    const sceneMode = useConstellationStore((s) => s.sceneMode)

    const monitoringTarget = useConstellationStore((s) => s.monitoringTarget)
    const companionName = useConstellationStore((s) => s.companionName)

    const totalSelectedSatellites = Object.values(selectedSatellites).reduce(
        (total, sats) => total + sats.length,
        0,
    )

    const totalWithCompanion = totalSelectedSatellites + (companionName ? 1 : 0)

    return (
        <div className="status-display-container">
            <div className="status-item">
                <EyeOutlined />
                <span>{t('loadedSatellites', { count: totalWithCompanion })}</span>
            </div>
            {monitoringTarget && (
                <div className="status-item">
                    <AimOutlined />
                    <span>{t('monitoringTarget')}: {monitoringTarget}</span>
                </div>
            )}
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
                <span>{t('dayNight')}: {lightingEnabled ? t('statusOn') : t('statusOff')}</span>
            </div>
            <div className="status-item">
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>{t('viewMode')}: {sceneMode}</span>
            </div>
        </div>
    )
}

export default StatusDisplay
