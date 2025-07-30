import React, { useState, useCallback } from 'react';
import { DatePicker, InputNumber, Typography } from 'antd';
import { ClockCircleOutlined, DownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConstellationStore } from '../store/constellationStore';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const SimulationTimeController = () => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const setSimulationTime = useConstellationStore(
    (state) => state.setSimulationTime
  );
  const setTimeStep = useConstellationStore((state) => state.setTimeStep);
  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);
  const timeStep = useConstellationStore((state) => state.timeStep);

  const datePickerValue =
    startTime && endTime ? [dayjs(startTime), dayjs(endTime)] : null;

  const handleTimeChange = useCallback(
    (dates) => {
      const dateObjects = dates ? [dates[0].toDate(), dates[1].toDate()] : null;
      setSimulationTime(dateObjects);
    },
    [setSimulationTime]
  );

  return (
    <div className="control-panel">
      {/* Panel Header */}
      <div
        className={`panel-header ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ClockCircleOutlined className="panel-icon" />
        <span className="panel-title">{t('simulationTimeControlTitle')}</span>
        <DownOutlined className="panel-arrow" />
      </div>

      {!isCollapsed && (
        <div style={{ paddingTop: '16px' }}>
          {/* Time Range Selection */}
          <div style={{ marginBottom: '16px' }}>
            <Text style={{ display: 'block', marginBottom: '8px' }}>
              {t('startAndEndTime')}
            </Text>
            <RangePicker
              showTime
              style={{ width: '100%' }}
              value={datePickerValue}
              onChange={handleTimeChange}
              placeholder={[t('startTime'), t('endTime')]}
            />
          </div>

          {/* Time Step */}
          <div>
            <Text style={{ display: 'block', marginBottom: '8px' }}>
              {t('timeStep')}
            </Text>
            <InputNumber
              min={0.1}
              step={0.1}
              style={{ width: '100%' }}
              value={timeStep}
              onChange={setTimeStep}
              placeholder="Enter time step"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationTimeController;
