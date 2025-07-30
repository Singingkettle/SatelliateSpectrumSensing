# Satellite Internet Simulation Platform v3.0

## 1. System Overview

This project is a modular simulation platform based on Python and MATLAB, designed for high-fidelity network and physical layer simulations of Low Earth Orbit (LEO) satellite constellations (supporting Starlink, OneWeb, Iridium). The platform uses a front-end/back-end separated architecture, where the back-end handles simulation logic and data, and the front-end (to be implemented in the future) is responsible for visualization.

**Core Features**:
- **Front-end/Back-end Separation**: Python back-end for logic processing, decoupling simulation from display.
- **Hybrid Programming**: Leverages the web service capabilities of Python (Flask) and the powerful scientific computing and simulation capabilities of MATLAB.
- **Stateless Simulation Engine**: MATLAB code is refactored into a stateless analysis engine that receives scene snapshots from the front-end and performs calculations on demand.
- **Automated Data Management**: The Python back-end automatically downloads and parses TLE ephemeris data from CelesTrak, and uses Redis for caching and daily scheduled updates.
- **Modularity and Extensibility**: A clear three-layer MATLAB architecture (physical, network, interface) and modular Python services make it easy to maintain and extend.
- **High-Fidelity Physical Layer**: The physical layer simulation includes realistic I/Q baseband signal generation (OFDM/QPSK), channel effects (path loss, atmosphere, rain), and a receiver noise model.

## 2. System Architecture

```
┌────────────────┐      HTTP/WebSocket      ┌──────────────────┐      MATLAB Engine API      ┌──────────────────┐
│                │ <----------------------> │                  │ -------------------------> │                  │
│   Frontend     │                          │   Python Backend │                            │  MATLAB          │
│ (CesiumJS)     │                          │    (Flask)       │                            │ (Core Algorithm) │
│                │ <----------------------> │                  │ <------------------------- │                  │
└────────────────┘                          └──────────────────┘                            └──────────────────┘
       ▲                                             │                                              │
       │                                             ▼                                              ▼
       │                                     ┌──────────────────┐                             ┌──────────────────┐
       └─────────────────────────────────────│  Redis Cache     │                             │  MATLAB Codebase │
                                             │ (TLE Data, IQ Data)│                             │ (+physical, +network)│
                                             └──────────────────┘                             └──────────────────┘
```

## 3. Environment Configuration and Installation

### 3.1. Required Software

1.  **MATLAB**: R2021a or later.
    - **Required Toolboxes**: Communications Toolbox, Signal Processing Toolbox.
2.  **Python**: 3.8 or later.
3.  **Redis**: Any recent stable version. Can be downloaded from [redis.io](https://redis.io/docs/getting-started/installation/) or run using Docker.

### 3.2. Environment Installation Steps

#### a. Configure MATLAB Engine

Ensure that Python can call MATLAB. Open MATLAB and run the following in the command window:

```matlab
cd(fullfile(matlabroot, 'extern', 'engines', 'python'))
system('python setup.py install')
```
*If you have multiple Python versions on your system, make sure the `python` command here points to the Python interpreter in the virtual environment you created for this project.*

#### b. Configure Python Backend

1.  **Navigate to the backend directory**:
    ```bash
    cd E:\Projects\SatelliateSpectrumSensing\backend\python_backend
    ```

2.  **Create a Python virtual environment**:
    ```bash
    python -m venv env
    ```

3.  **Activate the virtual environment**:
    ```bash
    # Windows
    .\env\Scripts\activate
    
    # macOS/Linux
    # source env/bin/activate
    ```

4.  **Install all dependencies**:
    ```bash
    pip install Flask Flask-Cors matlabengine APScheduler redis requests sgp4
    ```

#### c. Start Dependent Services

- **Start Redis**: Ensure your Redis server is running on the default port `6379`.

## 4. How to Run

1.  **Start the backend service**:
    - Make sure your Python virtual environment is activated.
    - Navigate to the `backend/python_backend` directory.
    - Run the following command:
      ```bash
      python app.py
      ```

2.  **Service Status**:
    - The service will start on `http://localhost:5002`.
    - You should see logs in the terminal, including "Successfully connected to Redis server" and "Background TLE update scheduler has been started".

3.  **Verify the service**:
    - Open a browser or use `curl` to access the health check endpoint `http://localhost:5002/api/health`.
    - You should receive a `{"status": "ok", "message": "Backend is running"}` response.

## 5. API Interface Description

### 5.1. Get Supported Constellations

- **URL**: `/api/constellations`
- **Method**: `GET`
- **Description**: Returns all constellations supported by the backend and their descriptions.
- **Success Response (200 OK)**:
  ```json
  [
    {"name": "Starlink", "description": "..."},
    {"name": "OneWeb", "description": "..."},
    {"name": "Iridium", "description": "..."}
  ]
  ```

### 5.2. Get Constellation TLE Data

- **URL**: `/api/tle/<constellation_name>`
- **Method**: `GET`
- **Example**: `/api/tle/starlink`
- **Description**: Gets the TLE data for the specified constellation from the Redis cache. If the cache does not exist, it is automatically downloaded from CelesTrak.
- **Success Response (200 OK)**:
  ```json
  [
    {"name": "STARLINK-1007", "line1": "...", "line2": "..."}
  ]
  ```

### 5.3. Execute Simulation Snapshot Analysis

- **URL**: `/api/simulation/start`
- **Method**: `POST`
- **Description**: Receives a snapshot containing the physical state of the scene, executes the full "network layer link establishment -> physical layer analysis" process, and stores the generated IQ data in Redis.
- **Request Body**: (For detailed structure, please refer to `backend/python_backend/test_payload_hierarchical.json`)
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
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "results": {
      "status": "success",
      "message": "Multi-constellation simulation completed successfully",
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

## 6. MATLAB Codebase Structure

The refactored MATLAB code is located in `backend/matlab/` and follows a clear three-layer architecture:

- `+physical/`: **Physical Layer**. Contains the core channel model and physical parameters, signal generation, link budget, etc. for each constellation.
- `+network/`: **Network Layer**. Contains the link manager base class, factory class, and link establishment strategy implementations for each constellation.
- `+interface/`: **Interface Layer**. Contains the top-level API functions for Python to call.
- `+utils/`: General utility functions.

## 7. Technical Documentation

To better understand the design and implementation details of the project, please refer to the following documents:

### System Design and Implementation
- 📖 **[Python Backend Design Document (python_backend_design.md)](doc/python_backend_design.md)**: Describes the architectural design, API interfaces, and service modules of the Python backend in detail.

### Frontend Feature Guides
- 🛰️ **[Orbit Visualization User Guide (orbit_visualization_guide.md)](doc/orbit_visualization_guide.md)**: A complete user guide for the satellite orbit display function, including separate control of the orbit ellipse and motion trail, performance optimization strategies, etc.
- 🔧 **[Frontend Issue Fixes Summary (frontend_fixes_summary.md)](doc/frontend_fixes_summary.md)**: A record of fixes and technical details for key issues such as the frontend interface color scheme and orbit calculation logic.

### References
- 📋 **[Satvis Orbit Calculation Architecture Document (satvis_orbit_logic.md)](satvis/satvis_orbit_logic.md)**: The referenced satvis project orbit calculation and visualization architecture design document.