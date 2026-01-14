import React from 'react';
import { Button, Tooltip, Space } from 'antd';
import { 
  HomeOutlined, 
  GlobalOutlined, 
  CloudOutlined, 
  BulbOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined
} from '@ant-design/icons';
import './BottomToolbar.css';

const BottomToolbar = () => {
  return (
    <div className="bottom-toolbar">
      <div className="toolbar-section left">
        <Space>
          <Tooltip title="Home View">
            <Button type="text" icon={<HomeOutlined />} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Toggle 2D/3D">
            <Button type="text" icon={<GlobalOutlined />} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Toggle Clouds">
            <Button type="text" icon={<CloudOutlined />} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Toggle Lighting">
            <Button type="text" icon={<BulbOutlined />} className="toolbar-btn" />
          </Tooltip>
        </Space>
      </div>

      <div className="toolbar-section center">
        <div className="time-controls">
          <Button type="text" icon={<StepBackwardOutlined />} className="toolbar-btn" />
          <Button type="text" icon={<PlayCircleOutlined />} className="toolbar-btn play-btn" />
          <Button type="text" icon={<StepForwardOutlined />} className="toolbar-btn" />
        </div>
        <div className="time-display">
          {new Date().toUTCString()}
        </div>
      </div>

      <div className="toolbar-section right">
        <Space>
          <Button type="text" className="fps-btn">30 FPS</Button>
        </Space>
      </div>
    </div>
  );
};

export default BottomToolbar;
