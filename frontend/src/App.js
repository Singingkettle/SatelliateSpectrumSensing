import React, { useEffect, Suspense } from 'react';
import { Layout, Space, Spin, Divider } from 'antd';
import { useConstellationStore } from './store/constellationStore';
import SimulationTimeController from './components/SimulationTimeController';
import ConstellationSelector from './components/ConstellationSelector';
import SatelliteSelectionView from './components/SatelliteSelectionView';
import 'antd/dist/reset.css';

const SimulationDashboard = React.lazy(() =>
  import('./views/SimulationDashboard')
);

const { Header, Sider, Content } = Layout;
const SIDER_WIDTH = 450;

function App() {
  const fetchConstellations = useConstellationStore(
    (state) => state.fetchConstellations
  );

  useEffect(() => {
    fetchConstellations();
  }, [fetchConstellations]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: 'white', textAlign: 'center' }}>
        <h1>卫星互联网空口仿真系统</h1>
      </Header>
      <Layout style={{ display: 'flex', flexDirection: 'row' }}>
        <Sider
          width={SIDER_WIDTH}
          theme="light"
          style={{
            padding: '24px',
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
          }}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <SimulationTimeController />
            <Divider />
            <ConstellationSelector />
            <SatelliteSelectionView />
          </Space>
        </Sider>
        <Content style={{ flex: 1, position: 'relative' }}>
          <Suspense
            fallback={
              <div style={{ textAlign: 'center', paddingTop: '50px' }}>
                <Spin size="large" />
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
