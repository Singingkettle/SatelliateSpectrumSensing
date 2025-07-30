import React, { Suspense, useEffect } from 'react'
import { Layout, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from './store/constellationStore'
import { useUiStore, EDGE_HOVER_WIDTH } from './store/uiStore'
import ControlPanel from './components/ControlPanel'
import 'antd/dist/reset.css'
import './styles/ControlPanel.css'

const SimulationDashboard = React.lazy(() => import('./views/SimulationDashboard'))

export default function App() {
  const { i18n } = useTranslation()

  // fetch constellations & lang detection ---------------------------------------
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

  // ui store --------------------------------------------------------------------
  const panelCollapsed = useUiStore((s) => s.panelCollapsed)
  const panelPinned = useUiStore((s) => s.panelPinned)
  const setPanelCollapsed = useUiStore((s) => s.setPanelCollapsed)

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#1e1e1e' }}>
      {/* Hover edge to reveal panel when collapsed */}
      {panelCollapsed && !panelPinned && (
        <div
          style={{ position: 'fixed', left: 0, top: 0, width: EDGE_HOVER_WIDTH, height: '100vh', zIndex: 1000 }}
          onMouseEnter={() => setPanelCollapsed(false)}
        />
      )}

      {/* Fixed overlay control panel (transform based) */}
      <ControlPanel />

      {/* Main content fills full width, never resized by panel */}
      <Layout style={{ flex: 1 }}>
        <Suspense
          fallback={
            <div
              style={{
                textAlign: 'center',
                paddingTop: '50px',
                backgroundColor: '#1e1e1e',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Spin size="large" style={{ color: '#007acc' }} />
            </div>
          }
        >
          <SimulationDashboard />
        </Suspense>
      </Layout>
    </Layout>
  )
}
