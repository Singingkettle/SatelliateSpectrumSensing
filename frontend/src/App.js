/**
 * Satellite Tracker Application
 * Real-time satellite tracking and visualization
 * Styled to match satellitemap.space
 */
import React, { Suspense, useEffect } from 'react';
import { ConfigProvider, theme, Spin } from 'antd';
import { useSatelliteStore } from './store/satelliteStore';
import { useUiStore } from './store/uiStore';
import NavBar from './components/Navigation/NavBar';
import BottomToolbar from './components/Controls/BottomToolbar';
import TimeControls from './components/Controls/TimeControls';
import LegendPanel from './components/Panels/LegendPanel';
import SatelliteDetailPanel from './components/Panels/SatelliteDetailPanel';
import ConstellationLabel from './components/UI/ConstellationLabel';
import WelcomePanel from './components/Panels/WelcomePanel';
import SearchModal from './components/Controls/SearchModal';
import ConstellationDataModal from './components/Visualizations/ConstellationDataModal';
import SettingsModal from './components/Panels/SettingsModal';
import CalculatorModal from './components/Tools/CalculatorModal';
import SpaceTrackStatus from './components/Panels/SpaceTrackStatus';
import 'antd/dist/reset.css';
import './styles/index.css';

// Lazy load the globe component for better initial load time
const CesiumGlobe = React.lazy(() => 
  import('./components/Globe/CesiumGlobe').then(module => ({ 
    default: module.default 
  }))
);

// Loading fallback component
const LoadingScreen = () => (
  <div className="loading-screen">
    <Spin size="large" />
    <p>Loading Satellite Tracker...</p>
  </div>
);

// Main App component
function App() {
  const fetchConstellations = useSatelliteStore(s => s.fetchConstellations);
  const selectedSatellite = useSatelliteStore(s => s.selectedSatellite);
  const showSearchModal = useUiStore(s => s.showSearchModal);
  const showWelcomePanel = useUiStore(s => s.showWelcomePanel);
  const showConstellationData = useUiStore(s => s.showConstellationData);
  const showSettingsModal = useUiStore(s => s.showSettingsModal);
  const showCalculatorModal = useUiStore(s => s.showCalculatorModal);
  const showSpaceTrackStatus = useUiStore(s => s.showSpaceTrackStatus);
  const setShowSpaceTrackStatus = useUiStore(s => s.setShowSpaceTrackStatus);
  
  // Fetch constellations on mount
  useEffect(() => {
    fetchConstellations();
  }, [fetchConstellations]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1DA1F2',
          colorBgContainer: '#0f172a',
          colorBgElevated: '#1e293b',
          colorBorder: 'rgba(255, 255, 255, 0.1)',
          colorText: 'rgba(255, 255, 255, 0.9)',
          colorTextSecondary: 'rgba(255, 255, 255, 0.6)',
          borderRadius: 8,
        },
      }}
    >
      <div className="app-container">
        <NavBar />
        
        <div className="globe-container">
          <Suspense fallback={<LoadingScreen />}>
            <CesiumGlobe />
          </Suspense>
        </div>
        
        <ConstellationLabel />
        
        {selectedSatellite && <SatelliteDetailPanel />}
        {!selectedSatellite && showWelcomePanel && <WelcomePanel />}
        
        <LegendPanel />
        <BottomToolbar />
        <TimeControls />
        
        {showSearchModal && <SearchModal />}
        {showConstellationData && <ConstellationDataModal />}
        {showSettingsModal && <SettingsModal />}
        {showCalculatorModal && <CalculatorModal />}
        <SpaceTrackStatus 
          visible={showSpaceTrackStatus} 
          onClose={() => setShowSpaceTrackStatus(false)} 
        />
      </div>
    </ConfigProvider>
  );
}

export default App;
