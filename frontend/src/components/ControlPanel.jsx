import React from 'react'
import { Tooltip } from 'antd'
import { PushpinOutlined } from '@ant-design/icons'
import { useUiStore, SIDER_WIDTH, EDGE_HOVER_WIDTH } from '../store/uiStore'
import SimulationTimeController from './SimulationTimeController'
import ConstellationSelector from './ConstellationSelector'
import SatelliteSelectionView from './SatelliteSelectionView'
import DisplaySettings from './DisplaySettings'

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

    return (
        <aside
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: SIDER_WIDTH,
                height: '100vh',
                backgroundColor: '#252526',
                borderRight: '1px solid #3e3e42',
                overflowY: 'auto',
                boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
                transform: panelCollapsed ? `translateX(-${SIDER_WIDTH}px)` : 'translateX(0)',
                transition: 'transform 0.25s ease',
                zIndex: 1001,
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #3e3e42',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    backgroundColor: '#2d2d30',
                }}
            >
                <div
                    style={{
                        fontSize: '24px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    🛰️
                </div>
                <span
                    style={{
                        color: '#cccccc',
                        fontSize: '14px',
                        fontWeight: 500,
                        letterSpacing: '0.5px',
                        flex: 1,
                    }}
                >
                    Satellite Simulation
                </span>
                <Tooltip title={panelPinned ? '取消固定' : '固定面板'}>
                    <PushpinOutlined
                        rotate={panelPinned ? 0 : 90}
                        style={{ color: panelPinned ? '#1890ff' : '#8c8c8c', cursor: 'pointer' }}
                        onClick={togglePanelPinned}
                    />
                </Tooltip>
            </div>

            {/* Content */}
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
