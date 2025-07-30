import React, { useEffect, Suspense } from 'react';
import { Layout, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { useConstellationStore } from './store/constellationStore';
import SimulationTimeController from './components/SimulationTimeController';
import ConstellationSelector from './components/ConstellationSelector';
import SatelliteSelectionView from './components/SatelliteSelectionView';
import DisplaySettings from './components/DisplaySettings'; // Corrected import
import 'antd/dist/reset.css';
import './styles/ControlPanel.css';

const SimulationDashboard = React.lazy(() =>
  import('./views/SimulationDashboard')
);

const { Sider, Content } = Layout;
const SIDER_WIDTH = 380;

function App() {
  const { i18n } = useTranslation();
  const fetchConstellations = useConstellationStore(
    (state) => state.fetchConstellations
  );

  useEffect(() => {
    fetchConstellations();

    // Language detection logic
    const storedLang = localStorage.getItem('i18nextLng');
    if (!storedLang) {
      fetch('https://ip-api.com/json')
        .then(response => response.json())
        .then(data => {
          if (data.countryCode === 'CN') {
            i18n.changeLanguage('zh');
          } else {
            i18n.changeLanguage('en');
          }
        })
        .catch(() => {
          i18n.changeLanguage('zh'); // Default to Chinese on error
        });
    }
  }, [fetchConstellations, i18n]);

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#1e1e1e' }}>
      <Layout style={{ display: 'flex', flexDirection: 'row' }}>
        <Sider
          width={SIDER_WIDTH}
          style={{
            backgroundColor: '#252526',
            borderRight: '1px solid #3e3e42',
            overflow: 'auto',
            boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          }}
        >
          {/* Satellite Icon in the top-left corner */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3e3e42',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#2d2d30'
          }}>
            <div style={{
              fontSize: '24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              🛰️
            </div>
            <span style={{
              color: '#cccccc',
              fontSize: '14px',
              fontWeight: '500',
              letterSpacing: '0.5px'
            }}>
              Satellite Simulation
            </span>
          </div>

          {/* Control Panel Content */}
          <div style={{ padding: '0' }}>
            <SimulationTimeController />
            <ConstellationSelector />
            <SatelliteSelectionView />
            <DisplaySettings />
          </div>
        </Sider>
        <Content style={{ flex: 1, position: 'relative', backgroundColor: '#1e1e1e' }}>
          <Suspense
            fallback={
              <div style={{
                textAlign: 'center',
                paddingTop: '50px',
                backgroundColor: '#1e1e1e',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Spin size="large" style={{ color: '#007acc' }} />
              </div>
            }
          >
            <SimulationDashboard />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;