import React, { Suspense, useEffect } from 'react'
import { Layout, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from './store/constellationStore'
import { useUiStore, EDGE_HOVER_HEIGHT, SIDER_WIDTH } from './store/uiStore'
import ControlPanel from './components/ControlPanel'
import 'antd/dist/reset.css'
import './styles/ControlPanel.css'
import './styles/CesiumViewer.css'

const SimulationDashboard = React.lazy(() => import('./views/SimulationDashboard'))

const ROOT_LAYOUT_STYLE = { minHeight: '100vh', backgroundColor: '#1e1e1e' }
const CONTENT_LAYOUT_STYLE = { flex: 1 }
const FALLBACK_STYLE = {
  textAlign: 'center',
  paddingTop: '50px',
  backgroundColor: '#1e1e1e',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export default function App() {
  const { i18n } = useTranslation()
  const fetchConstellations = useConstellationStore((state) => state.fetchConstellations)
  useEffect(() => {
    fetchConstellations()
    const storedLang = localStorage.getItem('i18nextLng')
    if (!storedLang) {
      fetch('https://ip-api.com/json')
        .then((res) => res.json())
        .then((data) => (data.countryCode === 'CN' ? i18n.changeLanguage('zh') : i18n.changeLanguage('en')))
        .catch(() => i18n.changeLanguage('zh'))
    }
  }, [fetchConstellations, i18n])

  const panelCollapsed = useUiStore((s) => s.panelCollapsed)
  const panelPinned = useUiStore((s) => s.panelPinned)
  const setPanelCollapsed = useUiStore((s) => s.setPanelCollapsed)

  const HOVER_STYLE = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: SIDER_WIDTH,
    height: EDGE_HOVER_HEIGHT,
    zIndex: 1000,
  }

  return (
    <Layout style={ROOT_LAYOUT_STYLE}>
      {panelCollapsed && !panelPinned && (
        <div style={HOVER_STYLE} onMouseEnter={() => panelCollapsed && setPanelCollapsed(false)} />
      )}
      <ControlPanel />
      <Layout style={CONTENT_LAYOUT_STYLE}>
        <Suspense fallback={<div style={FALLBACK_STYLE}><Spin size="large" style={{ color: '#007acc' }} /></div>}>
          <SimulationDashboard />
        </Suspense>
      </Layout>
    </Layout>
  )
}
