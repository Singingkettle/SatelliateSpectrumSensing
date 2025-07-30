# 卫星互联网仿真平台 v3.0

## 1. 系统概述

本项目是一个基于Python和MATLAB的模块化仿真平台，旨在对低地球轨道（LEO）卫星星座（支持Starlink, OneWeb, Iridium）进行高保真的网络层和物理层仿真。平台采用前后端分离架构，后端负责处理仿真逻辑和数据，前端（未来实现）负责可视化展示。

**核心特性**:
- **前后端分离架构**: Python后端负责逻辑处理，解耦仿真与显示。
- **混合编程**: 利用Python (Flask) 的Web服务能力和MATLAB强大的科学计算与仿真能力。
- **无状态仿真引擎**: MATLAB代码被重构为无状态的分析引擎，接收前端发送的场景快照，按需执行计算。
- **自动化数据管理**: Python后端自动从CelesTrak下载和解析TLE星历数据，并使用Redis进行缓存和每日定时更新。
- **模块化与可扩展**: 清晰的三层MATLAB架构（物理层、网络层、接口层）和模块化的Python服务，易于维护和扩展。
- **高保真物理层**: 物理层仿真包含真实的I/Q基带信号生成（OFDM/QPSK）、信道效应（路径损耗、大气、降雨）和接收机噪声模型。

## 2. 系统架构

```
┌────────────────┐      HTTP/WebSocket      ┌──────────────────┐      MATLAB Engine API      ┌──────────────────┐
│                │ <----------------------> │                  │ -------------------------> │                  │
│   前端         │                          │   Python 后端    │                            │  MATLAB 仿真引擎 │
│ (CesiumJS)     │                          │    (Flask)       │                            │ (核心算法)       │
│                │ <----------------------> │                  │ <------------------------- │                  │
└────────────────┘                          └──────────────────┘                            └──────────────────┘
       ▲                                             │                                              │
       │                                             ▼                                              ▼
       │                                     ┌──────────────────┐                             ┌──────────────────┐
       └─────────────────────────────────────│  Redis 缓存      │                             │  MATLAB代码库    │
                                             │ (TLE数据, IQ数据)│                             │ (+physical, +network)│
                                             └──────────────────┘                             └──────────────────┘
```

## 3. 环境配置与安装

### 3.1. 所需软件

1.  **MATLAB**: R2021a 或更高版本。
    - **必需工具箱**: Communications Toolbox, Signal Processing Toolbox.
2.  **Python**: 3.8 或更高版本。
3.  **Redis**: 任意最新稳定版本。可从 [redis.io](https://redis.io/docs/getting-started/installation/) 下载或使用Docker运行。

### 3.2. 环境安装步骤

#### a. 配置MATLAB引擎

确保Python可以调用MATLAB。打开MATLAB，在命令窗口中运行：

```matlab
cd(fullfile(matlabroot, 'extern', 'engines', 'python'))
system('python setup.py install')
```
*如果您的系统上有多个Python版本，请确保这里的 `python` 命令指向您为本项目创建的虚拟环境中的Python解释器。*

#### b. 配置Python后端

1.  **导航到后端目录**:
    ```bash
    cd E:\Projects\SatelliateSpectrumSensing\backend\python_backend
    ```

2.  **创建Python虚拟环境**:
    ```bash
    python -m venv env
    ```

3.  **激活虚拟环境**:
    ```bash
    # Windows
    .\env\Scripts\activate
    
    # macOS/Linux
    # source env/bin/activate
    ```

4.  **安装所有依赖包**:
    ```bash
    pip install Flask Flask-Cors matlabengine APScheduler redis requests sgp4
    ```

#### c. 启动依赖服务

- **启动Redis**: 确保您的Redis服务器正在默认端口 `6379` 上运行。

## 4. 如何运行

1.  **启动后端服务**:
    - 确保您的Python虚拟环境已激活。
    - 导航到 `backend/python_backend` 目录。
    - 运行以下命令:
      ```bash
      python app.py
      ```

2.  **服务状态**: 
    - 服务将在 `http://localhost:5002` 上启动。
    - 您应该会在终端看到日志，包括 “已成功连接到Redis服务器” 和 “后台TLE更新调度器已启动”。

3.  **验证服务**: 
    - 打开浏览器或使用 `curl` 访问健康检查端点 `http://localhost:5002/api/health`。
    - 您应该会收到 `{"status": "ok", "message": "Backend is running"}` 的响应。

## 5. API接口说明

### 5.1. 获取支持的星座

- **URL**: `/api/constellations`
- **方法**: `GET`
- **描述**: 返回后端支持的所有星座及其描述。
- **成功响应 (200 OK)**:
  ```json
  [
    {"name": "Starlink", "description": "..."},
    {"name": "OneWeb", "description": "..."},
    {"name": "Iridium", "description": "..."}
  ]
  ```

### 5.2. 获取星座TLE数据

- **URL**: `/api/tle/<constellation_name>`
- **方法**: `GET`
- **示例**: `/api/tle/starlink`
- **描述**: 从Redis缓存中获取指定星座的TLE数据。如果缓存不存在，会自动从CelesTrak下载。
- **成功响应 (200 OK)**:
  ```json
  [
    {"name": "STARLINK-1007", "line1": "...", "line2": "..."}
  ]
  ```

### 5.3. 执行仿真快照分析

- **URL**: `/api/simulation/start`
- **方法**: `POST`
- **描述**: 接收一个包含场景物理状态的快照，执行“网络层建链 -> 物理层分析”的完整流程，并将生成的IQ数据存入Redis。
- **请求体 (Body)**: (详细结构请参考 `backend/python_backend/test_payload_hierarchical.json`)
  ```json
  {
    "timestamp": "2025-07-16T10:00:00Z",
    "samplingPeriod": 0.001,
    "constellations": [
      {
        "name": "Starlink",
        "shell": "Shell1",
        "satellites": [{"name": "...", "latitude": ...}],
        "groundStations": [{"name": "...", "latitude": ...}]
      }
    ]
  }
  ```
- **成功响应 (200 OK)**:
  ```json
  {
    "status": "success",
    "results": {
      "status": "success",
      "message": "多星座仿真成功完成",
      "links": [
        {
          "satellite_name": "...",
          "ground_station_name": "...",
          "physical_results": {
            "link_budget": { "snr_db": ... },
            "redis_key": "...:IQ"
          }
        }
      ],
      "simulationId": "..."
    }
  }
  ```

## 6. MATLAB代码库结构

重构后的MATLAB代码位于 `backend/matlab/`，遵循清晰的三层架构：

- `+physical/`: **物理层**。包含核心信道模型和各星座的物理参数、信号生成、链路预算等。
- `+network/`: **网络层**。包含链路管理器基类、工厂类和各星座的建链策略实现。
- `+interface/`: **接口层**。包含供Python调用的顶层API函数。
- `+utils/`: 通用工具函数。

## 7. 技术文档

为了更好地理解项目的设计和实现细节，请参阅以下文档：

### 系统设计与实现
- 📖 **[Python后端设计文档 (python_backend_design.md)](doc/python_backend_design.md)**: 详细描述了Python后端的架构设计、API接口和服务模块

### 前端功能指南  
- 🛰️ **[轨道可视化使用指南 (orbit_visualization_guide.md)](doc/orbit_visualization_guide.md)**: 卫星轨道显示功能的完整使用指南，包括轨道椭圆和运动轨迹的分离控制、性能优化策略等
- 🔧 **[前端问题修复总结 (frontend_fixes_summary.md)](doc/frontend_fixes_summary.md)**: 前端界面配色、轨道计算逻辑等关键问题的修复记录和技术细节

### 参考资料
- 📋 **[Satvis轨道计算架构文档 (satvis_orbit_logic.md)](satvis/satvis_orbit_logic.md)**: 参考的satvis项目轨道计算与可视化架构设计文档
