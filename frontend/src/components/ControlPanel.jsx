import React, { useMemo } from 'react'
import { Tooltip } from 'antd'
import { PushpinOutlined } from '@ant-design/icons'
import { useUiStore } from '../store/uiStore'
import SimulationTimeController from './SimulationTimeController'
import ConstellationSelector from './ConstellationSelector'
import SatelliteSelectionView from './SatelliteSelectionView'
import DisplaySettings from './DisplaySettings'
import '../styles/ControlPanel.css'

const LOGO_ICON_STYLE = {
    fontSize: '24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
}

function ControlPanel() {
    const panelCollapsed = useUiStore((s) => s.panelCollapsed)
    const panelPinned = useUiStore((s) => s.panelPinned)
    const setPanelCollapsed = useUiStore((s) => s.setPanelCollapsed)
    const togglePanelPinned = useUiStore((s) => s.togglePanelPinned)

    const handleMouseEnter = () => {
        if (!panelPinned) setPanelCollapsed(false)
    }
    const handleMouseLeave = () => {
        if (!panelPinned) setPanelCollapsed(true)
    }

    const panelStyle = useMemo(
        () => ({
            transform: panelCollapsed ? 'translateY(-100%)' : 'translateY(0)',
            transition: 'transform 0.25s ease',
        }),
        [panelCollapsed],
    )

    return (
        <aside
            className="side-panel"
            style={panelStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="side-panel-header">
                <div style={LOGO_ICON_STYLE}>🛰️</div>
                <span className="side-panel-title">Satellite Simulation</span>
                <Tooltip title={panelPinned ? '取消固定' : '固定面板'}>
                    <PushpinOutlined
                        rotate={panelPinned ? 0 : 90}
                        style={{ color: panelPinned ? '#1890ff' : '#8c8c8c', cursor: 'pointer' }}
                        onClick={togglePanelPinned}
                    />
                </Tooltip>
            </div>

            <div style={{ padding: 0 }}>
                <SimulationTimeController />
                <ConstellationSelector />
                <SatelliteSelectionView />
                <DisplaySettings />
            </div>
        </aside>
    )
}

export default ControlPanel
