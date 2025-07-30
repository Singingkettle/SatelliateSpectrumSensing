import React from 'react';
import { Checkbox, Spin, Alert, Typography } from 'antd';
import { useConstellationStore } from '../store/constellationStore';

const { Title } = Typography;

const ConstellationSelector = () => {
  const constellations = useConstellationStore((state) => state.constellations);
  const loading = useConstellationStore(
    (state) => state.loading && state.constellations.length === 0
  );
  const error = useConstellationStore((state) => state.error);
  const selectedConstellations = useConstellationStore(
    (state) => state.selectedConstellations
  );
  const setSelectedConstellations = useConstellationStore(
    (state) => state.setSelectedConstellations
  );

  return (
    <Spin spinning={loading} tip="正在加载星座列表...">
      <Title level={4}>卫星星座</Title>
      {error && constellations.length === 0 ? (
        <Alert message={error} type="error" />
      ) : (
        <Checkbox.Group
          style={{ width: '100%' }}
          options={constellations}
          value={selectedConstellations}
          onChange={setSelectedConstellations}
        />
      )}
    </Spin>
  );
};

export default ConstellationSelector;
