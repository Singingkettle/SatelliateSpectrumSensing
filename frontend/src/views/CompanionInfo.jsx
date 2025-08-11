import React from 'react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import '../styles/CompanionInfo.css'

function CompanionInfo() {
    const { t } = useTranslation()
    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    const id = path.split('/').pop() || 'unknown'

    const goHome = () => {
        window.location.href = '/'
    }

    return (
        <div className="ci-container">
            <div className="ci-card">
                <div className="ci-header">
                    <h3 className="ci-title">{t('companionInfoTitle')} · <span className="ci-id">{id}</span></h3>
                    <Button size="small" onClick={goHome} className="ci-btn">{t('companionBackHome')}</Button>
                </div>

                <p className="ci-subtitle">{t('companionInfoSubtitle')}</p>

                <ul className="ci-list">
                    <li>{t('companionInfoBullet1')}</li>
                    <li>{t('companionInfoBullet2')}</li>
                    <li>{t('companionInfoBullet3')}</li>
                    <li>{t('companionInfoBullet4')}</li>
                </ul>

                <p className="ci-footer">{t('companionInfoFooter')}</p>
            </div>
        </div>
    )
}

export default CompanionInfo
