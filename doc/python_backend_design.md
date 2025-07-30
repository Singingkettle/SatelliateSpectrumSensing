# Python 后端开发设计说明

## 1. 概述

本文档旨在为“卫星互联网仿真平台”的Python后端服务提供详细的设计和开发规划。该后端作为前后端分离架构的核心，负责处理前端请求，调用MATLAB仿真引擎执行复杂的物理层和网络层仿真，并管理所需的天体轨道（TLE）数据。

### 1.1. 主要职责

- **API网关**: 作为前端和MATLAB仿真引擎之间的桥梁，提供统一的RESTful API接口。
- **仿真调度**: 接收前端的仿真配置请求，启动并管理MATLAB引擎实例。
- **数据管理**: 根据前端请求，调用MATLAB脚本下载和处理最新的TLE数据。
- **结果处理**: 从MATLAB获取仿真结果，进行格式化处理，并返回给前端。
- **状态管理**: 跟踪长时间运行的仿真任务的状态。

## 2. 系统架构

系统采用经典的前后端分离架构，Python后端作为中间层，连接前端UI和MATLAB核心计算引擎。

```
┌────────────────┐      HTTP/WebSocket      ┌──────────────────┐      MATLAB Engine API      ┌──────────────────┐
│                │ <----------------------> │                  │ -------------------------> │                  │
│   前端         │                          │   Python 后端    │                            │  MATLAB 仿真引擎 │
│ (React/Cesium) │                          │    (Flask)       │                            │ (核心算法)       │
│                │ <----------------------> │                  │ <------------------------- │                  │
└────────────────┘                          └──────────────────┘                            └──────────────────┘
       ▲                                             │                                              │
       │                                             ▼                                              ▼
       │                                     ┌──────────────────┐                             ┌──────────────────┐
       └─────────────────────────────────────│   仿真结果缓存   │                             │  TLE数据/配置文件│
                                             │     (Redis)      │                             └──────────────────┘
                                             └──────────────────┘
```

### 2.1. 技术栈

- **后端框架**: Flask (轻量级、易于上手，非常适合作为API网关)
- **MATLAB集成**: MATLAB Engine API for Python
- **异步任务**: Celery (用于处理长时间的仿真任务，避免API超时)
- **数据缓存/任务队列**: Redis
- **API文档**: Swagger (通过 `flasgger` 集成)

## 3. 目录结构

后端代码将存放于 `backend/python_backend/` 目录下，以保证与现有其他后端代码的隔离。

```
backend/python_backend/
├── app.py                     # Flask应用主入口
├── requirements.txt           # Python依赖
├── config.py                  # 配置文件
├── matlab_config.json         # MATLAB引擎相关配置（路径等）
├── services/                  # 业务逻辑层
│   ├── matlab_engine_service.py # 封装MATLAB引擎的调用
│   ├── simulation_service.py    # 仿真任务管理
│   └── tle_service.py           # TLE数据管理
├── routes/                    # API路由层
│   ├── __init__.py
│   ├── simulation_routes.py   # 仿真相关API
│   └── data_routes.py         # 数据相关API
└── utils/                     # 工具函数
    ├── response_util.py       # 标准化API响应格式
    └── validators.py          # API输入参数验证
```

## 4. MATLAB引擎集成方案

Python后端通过 `matlab.engine` 与MATLAB代码进行交互。

1.  **引擎启动**: 后端服务启动时，会初始化一个或多个可共享的MATLAB引擎实例。
2.  **路径管理**: 在调用MATLAB函数前，会首先运行 `init_matlab_env.m` 脚本，将所有必要的MATLAB代码路径（如 `+physical`, `+network` 等）添加到引擎的工作路径中。
3.  **函数调用**:
    - **仿真任务**: 调用重构后的 `main_simulation.m` 或更底层的 `+interface/+api/SimulationController.m` 中的函数。
    - **TLE数据**: 调用 `+data/TLEDataManager.m` 中的方法来下载和处理数据。
4.  **数据交换**:
    - Python的基本数据类型（如 `dict`, `list`, `str`, `float`）会自动转换为对应的MATLAB类型。
    - MATLAB返回的数据（如 `struct`, `cell array`）也会被自动转换回Python类型。
    - 复杂的仿真结果将以 `struct` 的形式返回，并在Python中被转换为 `dict`，然后序列化为JSON。

## 5. RESTful API 接口设计

所有接口都以 `/api` 为前缀。

### 5.1. 仿真控制接口

#### `POST /api/simulation/start`

启动一个新的仿真任务。这是一个异步接口，会立即返回一个任务ID。

**请求体 (Request Body)**:

```json
{
  "simulationName": "Starlink城市覆盖分析",
  "duration": 3600, // 仿真时长 (秒)
  "timeStep": 60,   // 时间步长 (秒)
  "constellations": [
    {
      "name": "Starlink",
      "satelliteCount": 50,
      "selectionMethod": "random" // 'random' 或 'specific'
    }
  ],
  "groundStations": [
    {
      "name": "Beijing",
      "latitude": 39.9042,
      "longitude": 116.4074
    },
    {
      "name": "NewYork",
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  ]
}
```

**成功响应 (Success Response - 202 Accepted)**:

```json
{
  "status": "pending",
  "message": "仿真任务已启动",
  "simulationId": "sim_a1b2c3d4"
}
```

### 5.2. 仿真状态与结果接口

#### `GET /api/simulation/{simulationId}/status`

查询特定仿真任务的状态。

**成功响应 (Success Response - 200 OK)**:

```json
{
  "simulationId": "sim_a1b2c3d4",
  "status": "running", // 'pending', 'running', 'completed', 'failed'
  "progress": 45,     // 进度百分比
  "message": "仿真正在进行中..."
}
```

#### `GET /api/simulation/{simulationId}/results`

获取已完成的仿真任务的结果。

**成功响应 (Success Response - 200 OK)**:

```json
{
  "simulationId": "sim_a1b2c3d4",
  "status": "completed",
  "results": {
    "summary": {
      "totalLinks": 150,
      "averageSNR": 15.2, // dB
      "averageBER": 1.5e-6
    },
    "timeSeriesData": [
      {
        "timestamp": "2025-07-15T12:01:00Z",
        "activeLinks": 10,
        "satelliteStates": [
          {
            "id": "Starlink_1",
            "latitude": 50.1,
            "longitude": 25.5,
            "altitude": 550.1
          }
        ]
      }
    ]
  }
}
```

### 5.3. 数据管理接口

#### `POST /api/tle/download`

触发特定星座TLE数据的下载或更新。

**请求体 (Request Body)**:

```json
{
  "constellation": "Starlink" // 'Starlink', 'OneWeb', 'Iridium'
}
```

**成功响应 (Success Response - 200 OK)**:

```json
{
  "status": "success",
  "message": "Starlink TLE数据已成功更新。",
  "source": "CelesTrak",
  "updateTime": "2025-07-15T11:55:00Z",
  "satelliteCount": 1584
}
```

#### `GET /api/constellations`

获取后端支持的星座列表及其基本信息。

**成功响应 (Success Response - 200 OK)**:

```json
[
  {
    "name": "Starlink",
    "description": "SpaceX的低地球轨道卫星互联网星座。"
  },
  {
    "name": "OneWeb",
    "description": "OneWeb的全球卫星通信网络。"
  },
  {
    "name": "Iridium",
    "description": "Iridium NEXT，提供全球语音和数据服务。"
  }
]
```

## 6. 代码注释与文档规范

1.  **Python代码注释**: 所有Python代码（包括函数、类、模块）都必须使用中文`docstring`进行详细注释。
2.  **MATLAB函数注释**:
    - 所有由我们新编写或重构的MATLAB功能函数，其注释风格必须与旧代码保持一致。
    - **必须包含“参考文献”部分**，明确指出该算法或参数设置所依据的权威技术文献。
    - 参考文献可以是公开发表的学术论文（提供DOI或链接）、官方的FCC/ITU文件（提供文件编号和链接）或权威的技术书籍。
    - **示例**:
      ```matlab
      function loss = calculatePathLoss(distance, frequency, elevation)
          % 计算路径损耗，包括Ku波段的大气效应
          %
          % 参考文献:
          % [1] ITU-R Recommendation P.618-13: "Propagation data and prediction
          %     methods for the planning of Earth-space telecommunication systems"
          %     https://www.itu.int/rec/R-REC-P.618-13/en
          % [2] Pratt, T., Bostian, C. W., & Allnutt, J. E. (2003). Satellite Communications.
          %     John Wiley & Sons. Chapter 4.
      
          % ... 函数实现 ...
      end
      ```

## 7. 实施计划

1.  **阶段一：环境搭建与基础架构**
    - 初始化Python项目，设置Flask应用。
    - 创建`backend/python_backend`目录结构。
    - 配置`requirements.txt`，集成MATLAB Engine。
2.  **阶段二：核心服务层开发**
    - 实现 `matlab_engine_service.py`，封装引擎的启动、关闭和函数调用。
    - 实现 `tle_service.py`，对接MATLAB的 `TLEDataManager`。
3.  **阶段三：API接口开发**
    - 实现数据管理接口 (`/api/tle/*`, `/api/constellations`)。
    - 实现仿真接口 (`/api/simulation/*`)，并与Celery和Redis集成以处理异步任务。
4.  **阶段四：MATLAB侧重构与对接**
    - 根据新的三层架构（物理层、网络层、接口层）重构MATLAB代码。
    - 确保所有MATLAB函数都包含符合规范的中文注释和参考文献。
    - 编写 `+interface/api/` 模块，作为Python调用的统一入口。
5.  **阶段五：联调与测试**
    - 编写单元测试和集成测试。
    - 与前端进行API联调。
    - 性能测试和优化。
