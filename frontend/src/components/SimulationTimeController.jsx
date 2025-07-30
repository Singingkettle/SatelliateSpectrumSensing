import React, { useCallback } from 'react';
import { DatePicker, InputNumber, Form, Typography } from 'antd';
import { useConstellationStore } from '../store/constellationStore';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const SimulationTimeController = () => {
  const setSimulationTime = useConstellationStore(
    (state) => state.setSimulationTime
  );
  const setTimeStep = useConstellationStore((state) => state.setTimeStep);
  const startTime = useConstellationStore((state) => state.startTime);
  const endTime = useConstellationStore((state) => state.endTime);
  const timeStep = useConstellationStore((state) => state.timeStep);

  // AntD's RangePicker needs an array of dayjs objects
  const datePickerValue =
    startTime && endTime ? [dayjs(startTime), dayjs(endTime)] : null;

  // Memoize the onChange handler to prevent it from being recreated on every render,
  // which can help optimize child component rendering.
  const handleTimeChange = useCallback(
    (dates) => {
      const dateObjects = dates ? [dates[0].toDate(), dates[1].toDate()] : null;
      setSimulationTime(dateObjects);
    },
    [setSimulationTime]
  );

  return (
    <Form layout="vertical">
      <Title level={4}>仿真时间控制</Title>
      <Form.Item label="起始与终止时间" required>
        <RangePicker
          showTime
          style={{ width: '100%' }}
          value={datePickerValue}
          onChange={handleTimeChange}
        />
      </Form.Item>
      <Form.Item label="时间步长 (秒)" required>
        <InputNumber
          min={0.1}
          step={0.1}
          style={{ width: '100%' }}
          value={timeStep}
          onChange={setTimeStep}
        />
      </Form.Item>
    </Form>
  );
};

export default SimulationTimeController;
