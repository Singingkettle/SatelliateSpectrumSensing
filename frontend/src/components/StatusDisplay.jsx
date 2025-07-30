import React from 'react';
import { useConstellationStore } from '../store/constellationStore';
import { useTranslation } from 'react-i18next';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import '../styles/StatusDisplay.css';

const StatusDisplay = () => {
    const { t } = useTranslation();
    const showOrbits = useConstellationStore((state) => state.showOrbits);
    const selectedSatellites = useConstellationStore((state) => state.selectedSatellites);

    const totalSelectedSatellites = Object.values(selectedSatellites).reduce(
        (total, satellites) => total + satellites.length,
        0
    );

    return (
        <div className="status-display-container">
            <div className="status-item">
                <EyeOutlined />
                <span>{t('loadedSatellites', { count: totalSelectedSatellites })}</span>
            </div>
            <div className="status-item">
                {showOrbits ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#f14c4c' }} />}
                <span>{t('orbitDisplay')}: {showOrbits ? t('statusOn') : t('statusOff')}</span>
            </div>
        </div>
    );
};

export default StatusDisplay;
