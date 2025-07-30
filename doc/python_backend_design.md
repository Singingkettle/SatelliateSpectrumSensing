# Python Backend Development Design Document

## 1. Overview

This document aims to provide a detailed design and development plan for the Python backend service of the "Satellite Internet Simulation Platform". As the core of the front-end and back-end separated architecture, this backend is responsible for handling front-end requests, calling the MATLAB simulation engine to perform complex physical layer and network layer simulations, and managing the required celestial orbit (TLE) data.

### 1.1. Main Responsibilities

- **API Gateway**: Acts as a bridge between the front-end and the MATLAB simulation engine, providing a unified RESTful API interface.
- **Simulation Scheduling**: Receives simulation configuration requests from the front-end, and starts and manages MATLAB engine instances.
- **Data Management**: Calls MATLAB scripts to download and process the latest TLE data according to front-end requests.
- **Result Processing**: Obtains simulation results from MATLAB, formats them, and returns them to the front-end.
- **State Management**: Tracks the status of long-running simulation tasks.

## 2. System Architecture

The system adopts a classic front-end and back-end separated architecture, with the Python backend as the middle layer, connecting the front-end UI and the MATLAB core computing engine.

```
┌────────────────┐      HTTP/WebSocket      ┌──────────────────┐      MATLAB Engine API      ┌──────────────────┐
│                │ <----------------------> │                  │ -------------------------> │                  │
│   Frontend     │                          │   Python Backend │                            │  MATLAB          │
│ (React/Cesium) │                          │    (Flask)       │                            │ (Core Algorithm) │
│                │ <----------------------> │                  │ <------------------------- │                  │
└────────────────┘                          └──────────────────┘                            └──────────────────┘
       ▲                                             │                                              │
       │                                             ▼                                              ▼
       │                                     ┌──────────────────┐                             ┌──────────────────┐
       └─────────────────────────────────────│  Simulation Result Cache │                             │  TLE Data/Config │
                                             │     (Redis)      │                             └──────────────────┘
                                             └──────────────────┘
```

### 2.1. Technology Stack

- **Backend Framework**: Flask (lightweight, easy to get started, very suitable as an API gateway)
- **MATLAB Integration**: MATLAB Engine API for Python
- **Asynchronous Tasks**: Celery (for handling long-running simulation tasks to avoid API timeouts)
- **Data Cache/Task Queue**: Redis
- **API Documentation**: Swagger (integrated via `flasgger`)

## 3. Directory Structure

The backend code will be stored in the `backend/python_backend/` directory to ensure isolation from other existing backend code.

```
backend/python_backend/
├── app.py                     # Flask application main entry point
├── requirements.txt           # Python dependencies
├── config.py                  # Configuration file
├── matlab_config.json         # MATLAB engine related configuration (paths, etc.)
├── services/                  # Business logic layer
│   ├── matlab_engine_service.py # Encapsulates MATLAB engine calls
│   ├── simulation_service.py    # Simulation task management
│   └── tle_service.py           # TLE data management
├── routes/                    # API routing layer
│   ├── __init__.py
│   ├── simulation_routes.py   # Simulation related APIs
│   └── data_routes.py         # Data related APIs
└── utils/                     # Utility functions
    ├── response_util.py       # Standardized API response format
    └── validators.py          # API input parameter validation
```

## 4. MATLAB Engine Integration Plan

The Python backend interacts with MATLAB code through `matlab.engine`.

1.  **Engine Startup**: When the backend service starts, it will initialize one or more shareable MATLAB engine instances.
2.  **Path Management**: Before calling a MATLAB function, it will first run the `init_matlab_env.m` script to add all necessary MATLAB code paths (such as `+physical`, `+network`, etc.) to the engine's working path.
3.  **Function Calls**:
    - **Simulation Tasks**: Call functions in the refactored `main_simulation.m` or the lower-level `+interface/+api/SimulationController.m`.
    - **TLE Data**: Call methods in `+data/TLEDataManager.m` to download and process data.
4.  **Data Exchange**:
    - Basic Python data types (such as `dict`, `list`, `str`, `float`) are automatically converted to corresponding MATLAB types.
    - Data returned by MATLAB (such as `struct`, `cell array`) is also automatically converted back to Python types.
    - Complex simulation results will be returned in the form of a `struct`, converted to a `dict` in Python, and then serialized to JSON.

## 5. RESTful API Interface Design

All interfaces are prefixed with `/api`.

### 5.1. Simulation Control Interface

#### `POST /api/simulation/start`

Starts a new simulation task. This is an asynchronous interface that will immediately return a task ID.

**Request Body**:

```json
{
  "simulationName": "Starlink Urban Coverage Analysis",
  "duration": 3600, // Simulation duration (seconds)
  "timeStep": 60,   // Time step (seconds)
  "constellations": [
    {
      "name": "Starlink",
      "satelliteCount": 50,
      "selectionMethod": "random" // 'random' or 'specific'
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

**Success Response - 202 Accepted**:

```json
{
  "status": "pending",
  "message": "Simulation task has been started",
  "simulationId": "sim_a1b2c3d4"
}
```

### 5.2. Simulation Status and Result Interface

#### `GET /api/simulation/{simulationId}/status`

Queries the status of a specific simulation task.

**Success Response - 200 OK**:

```json
{
  "simulationId": "sim_a1b2c3d4",
  "status": "running", // 'pending', 'running', 'completed', 'failed'
  "progress": 45,     // Progress percentage
  "message": "Simulation is in progress..."
}
```

#### `GET /api/simulation/{simulationId}/results`

Gets the results of a completed simulation task.

**Success Response - 200 OK**:

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

### 5.3. Data Management Interface

#### `POST /api/tle/download`

Triggers the download or update of TLE data for a specific constellation.

**Request Body**:

```json
{
  "constellation": "Starlink" // 'Starlink', 'OneWeb', 'Iridium'
}
```

**Success Response - 200 OK**:

```json
{
  "status": "success",
  "message": "Starlink TLE data has been successfully updated.",
  "source": "CelesTrak",
  "updateTime": "2025-07-15T11:55:00Z",
  "satelliteCount": 1584
}
```

#### `GET /api/constellations`

Gets the list of constellations supported by the backend and their basic information.

**Success Response - 200 OK**:

```json
[
  {
    "name": "Starlink",
    "description": "SpaceX's low Earth orbit satellite internet constellation."
  },
  {
    "name": "OneWeb",
    "description": "OneWeb's global satellite communications network."
  },
  {
    "name": "Iridium",
    "description": "Iridium NEXT, providing global voice and data services."
  }
]
```

## 6. Code Annotation and Documentation Standards

1.  **Python Code Comments**: All Python code (including functions, classes, modules) must be thoroughly commented using English `docstrings`.
2.  **MATLAB Function Comments**:
    - The comment style of all newly written or refactored MATLAB functional functions must be consistent with the old code.
    - **Must include a "References" section**, clearly indicating the authoritative technical literature on which the algorithm or parameter settings are based.
    - References can be publicly available academic papers (provide DOI or link), official FCC/ITU documents (provide document number and link), or authoritative technical books.
    - **Example**:
      ```matlab
      function loss = calculatePathLoss(distance, frequency, elevation)
          % Calculates path loss, including atmospheric effects in the Ku-band.
          %
          % References:
          % [1] ITU-R Recommendation P.618-13: "Propagation data and prediction
          %     methods for the planning of Earth-space telecommunication systems"
          %     https://www.itu.int/rec/R-REC-P.618-13/en
          % [2] Pratt, T., Bostian, C. W., & Allnutt, J. E. (2003). Satellite Communications.
          %     John Wiley & Sons. Chapter 4.
      
          % ... function implementation ...
      end
      ```

## 7. Implementation Plan

1.  **Phase 1: Environment Setup and Basic Architecture**
    - Initialize the Python project and set up the Flask application.
    - Create the `backend/python_backend` directory structure.
    - Configure `requirements.txt` and integrate the MATLAB Engine.
2.  **Phase 2: Core Service Layer Development**
    - Implement `matlab_engine_service.py` to encapsulate engine startup, shutdown, and function calls.
    - Implement `tle_service.py` to interface with MATLAB's `TLEDataManager`.
3.  **Phase 3: API Interface Development**
    - Implement data management interfaces (`/api/tle/*`, `/api/constellations`).
    - Implement simulation interfaces (`/api/simulation/*`) and integrate with Celery and Redis to handle asynchronous tasks.
4.  **Phase 4: MATLAB Side Refactoring and Integration**
    - Refactor the MATLAB code according to the new three-layer architecture (physical layer, network layer, interface layer).
    - Ensure that all MATLAB functions include English comments and references that comply with the specifications.
    - Write the `+interface/api/` module as a unified entry point for Python calls.
5.  **Phase 5: Joint Debugging and Testing**
    - Write unit tests and integration tests.
    - Conduct joint API debugging with the front-end.
    - Performance testing and optimization.