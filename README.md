# ChangShuoSpace

Real-time satellite tracking and visualization platform. A comprehensive satellite tracker inspired by [satellitemap.space](https://satellitemap.space/), featuring support for Chinese satellite constellations including Qianfan (千帆), Guowang (国网), and GalaxySpace (银河航天).

> **Project renamed from Satellite Tracker to ChangShuoSpace**

## Features

- **Real-time Satellite Tracking**: Track thousands of satellites in real-time on a 3D globe
- **Multi-Constellation Support**: Starlink, GPS, OneWeb, Iridium, Galileo, GLONASS, BeiDou, and more
- **Satellite Search**: Search satellites by name or NORAD ID
- **Detailed Information**: View orbital parameters, TLE data, and satellite metadata
- **Orbit Prediction**: Calculate and visualize satellite orbit paths
- **Orbital Decay Analysis**: Track satellite altitude changes over time
- **Ground Station Display**: View ground station locations for various constellations
- **Pass Predictions**: Predict when satellites will pass over a location

## Architecture

```
┌─────────────────┐     HTTP/REST      ┌─────────────────┐
│    Frontend     │ <----------------> │     Backend     │
│  (React/Cesium) │                    │    (Flask)      │
└─────────────────┘                    └─────────────────┘
        │                                      │
        │ satellite.js                         │
        │ (orbit calc)                         ▼
        ▼                              ┌─────────────────┐
┌─────────────────┐                    │   PostgreSQL    │
│  3D Globe View  │                    │   + Redis       │
└─────────────────┘                    └─────────────────┘
                                               │
                                               ▼
                                       ┌─────────────────┐
                                       │   CelesTrak     │
                                       │   (TLE Data)    │
                                       └─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, CesiumJS, Resium, Ant Design, Zustand |
| 3D Visualization | CesiumJS 1.131, WebGL |
| Orbit Calculation | satellite.js (browser), sgp4 (server) |
| Backend | Flask 3.0, SQLAlchemy, Flask-Migrate |
| Database | PostgreSQL 16 |
| Cache | Redis |
| Scheduler | APScheduler |

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 16+
- Redis

## Quick Start

### 1. Database Setup

```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE satellite_tracker;
\q
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize database and load TLE data
python init_db.py --all

# Start backend server
python app.py
```

Backend runs at `http://localhost:6359`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend runs at `http://localhost:3000`

### 4. Quick Start Script (Windows)

```powershell
.\scripts\start.ps1
```

## API Endpoints

### Constellations
- `GET /api/constellations` - List all constellations
- `GET /api/constellations/<slug>` - Get constellation details
- `GET /api/constellations/<slug>/satellites` - Get satellites in constellation
- `GET /api/constellations/<slug>/tle` - Get TLE data for constellation
- `POST /api/constellations/<slug>/update` - Update TLE data from CelesTrak

### Satellites
- `GET /api/satellites` - List satellites (with filtering)
- `GET /api/satellites/search?q=<query>` - Search satellites
- `GET /api/satellites/<norad_id>` - Get satellite details
- `GET /api/satellites/<norad_id>/tle` - Get satellite TLE
- `GET /api/satellites/<norad_id>/position` - Get current position
- `GET /api/satellites/<norad_id>/orbit` - Get orbit track
- `GET /api/satellites/<norad_id>/history` - Get TLE history
- `GET /api/satellites/<norad_id>/passes` - Predict passes

### Ground Stations
- `GET /api/ground-stations` - List ground stations
- `POST /api/ground-stations` - Create ground station
- `POST /api/ground-stations/seed-starlink` - Seed Starlink stations

## Supported Constellations

### Internet/Communication
| Constellation | Satellites | Description |
|--------------|------------|-------------|
| Starlink | ~7000+ | SpaceX satellite internet |
| OneWeb | ~600+ | Global broadband |
| Kuiper | Growing | Amazon satellite internet |
| Qianfan (千帆) | Growing | Chinese satellite internet (G60 Starlink) |
| Guowang (国网) | Growing | Chinese SatNet constellation |
| GalaxySpace (银河航天) | Growing | Chinese satellite internet |
| E-Space | Growing | LEO satellite constellation |

### Navigation
| Constellation | Satellites | Description |
|--------------|------------|-------------|
| GPS | ~31 | US navigation |
| GLONASS | ~24 | Russian navigation |
| Galileo | ~28 | European navigation |
| BeiDou | ~50+ | Chinese navigation |

### Communication
| Constellation | Satellites | Description |
|--------------|------------|-------------|
| Iridium NEXT | ~75 | Voice and data |
| Globalstar | ~48 | Mobile satellite |
| Bluewalker (AST) | Growing | Direct-to-cell |

### Earth Observation
| Constellation | Satellites | Description |
|--------------|------------|-------------|
| Planet | ~200+ | Earth observation |
| Spire | ~100+ | Weather/AIS |
| Jilin-1 (吉林一号) | ~100+ | Chinese Earth imaging |

## Development

### Backend Development

```bash
cd backend
.\venv\Scripts\activate

# Run with debug mode
FLASK_ENV=development python app.py

# Run database migrations
flask db migrate -m "Description"
flask db upgrade
```

### Frontend Development

```bash
cd frontend

# Development server with hot reload
npm start

# Build for production
npm run build
```

## Configuration

### Backend Configuration

Environment variables (or edit `config.py`):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/satellite_tracker
REDIS_HOST=localhost
REDIS_PORT=6379
SECRET_KEY=your-secret-key
```

### Frontend Configuration

Create `frontend/.env.development`:

```
REACT_APP_API_BASE_URL=http://localhost:6359/api
```

## Data Sources

TLE data is fetched from multiple sources using a multi-source strategy:

1. **api2.satellitemap.space** - Real-time proxy with comprehensive data
2. **Space-Track.org** - Primary authoritative source (requires account)
3. **CelesTrak** - Backup mirror, updated daily

Ground station locations are community-sourced.

## License

MIT License

## Acknowledgments

- [satellitemap.space](https://satellitemap.space/) - Inspiration
- [CelesTrak](https://celestrak.org/) - TLE data provider
- [satellite.js](https://github.com/shashwatak/satellite-js) - Orbit calculation
- [CesiumJS](https://cesium.com/) - 3D globe visualization
