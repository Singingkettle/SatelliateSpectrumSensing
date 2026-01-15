"""
Configuration management for the Satellite Tracker backend.
"""
import os
from datetime import timedelta


class Config:
    """Base configuration class."""
    
    # Flask
    SECRET_KEY = os.environ.get('SECRET_KEY', 'satellite-tracker-secret-key-2024')
    
    # Database - SQLite by default (easy setup), PostgreSQL for production
    # To use PostgreSQL, set DATABASE_URL environment variable
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'sqlite:///satellite_tracker.db'  # SQLite for easy development
    )
    # For PostgreSQL: 'postgresql://postgres:postgres@localhost:5432/satellite_tracker'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 300,
        'pool_pre_ping': True,
    }
    
    # TLE Cache settings (used for SQLite-based caching)
    TLE_CACHE_EXPIRY = int(os.environ.get('TLE_CACHE_EXPIRY', 86400))  # 24 hours

    # History settings (days)
    HISTORY_DAYS_DEFAULT = int(os.environ.get('HISTORY_DAYS_DEFAULT', 365))
    
    # Space-Track.org API (Primary data source)
    # Documentation: https://www.space-track.org/documentation
    # IMPORTANT: Set these via environment variables, never commit credentials!
    SPACETRACK_URL = 'https://www.space-track.org'
    # Primary account (defaults to environment variable or fallback)
    SPACETRACK_USERNAME = os.environ.get('SPACETRACK_USERNAME', 'changshuo@bupt.edu.cn')
    SPACETRACK_PASSWORD = os.environ.get('SPACETRACK_PASSWORD', 'Heitong1234....')
    
    # Account Pool for failover
    # The service will rotate through these if one is suspended or rate limited
    SPACETRACK_ACCOUNTS = [
        {'username': '971470200@qq.com', 'password': 'Heitong1234....'},
        {'username': SPACETRACK_USERNAME, 'password': SPACETRACK_PASSWORD}
    ]
    
    # CelesTrak API URLs (Backup/mirror source)
    CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php'
    CELESTRAK_SUPPLEMENTAL_URL = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php'
    
    # Supported constellations with their data source configurations
    # Primary source: Space-Track.org (direct API)
    # Backup source: CelesTrak (mirror)
    # 'spacetrack_query' defines how to query Space-Track for this constellation
    CONSTELLATIONS = {
        # === Internet Constellations ===
        'starlink': {
            'name': 'Starlink',
            'group': 'starlink',
            'supplemental': 'starlink',
            'spacetrack_query': "OBJECT_NAME~~STARLINK",  # Contains STARLINK
            'description': 'SpaceX Starlink satellite internet constellation',
            'color': '#1DA1F2',
            'category': 'internet',
        },
        'oneweb': {
            'name': 'OneWeb',
            'group': 'oneweb',
            'spacetrack_query': "OBJECT_NAME~~ONEWEB",
            'description': 'OneWeb global satellite communications network',
            'color': '#00A3E0',
            'category': 'internet',
        },
        'kuiper': {
            'name': 'Kuiper',
            'group': 'kuiper',  # May not exist in CelesTrak yet
            'spacetrack_query': "OBJECT_NAME~~KUIPER",
            'description': 'Amazon Kuiper satellite internet constellation',
            'color': '#FF9900',  # Amazon orange
            'category': 'internet',
        },
        
        # === Cellular/Communications ===
        'iridium': {
            'name': 'Iridium NEXT',
            'group': 'iridium-next',
            'spacetrack_query': "OBJECT_NAME~~IRIDIUM",
            'description': 'Iridium NEXT satellite constellation for voice and data',
            'color': '#FF6B35',
            'category': 'cellular',
        },
        'globalstar': {
            'name': 'Globalstar',
            'group': 'globalstar',
            'spacetrack_query': "OBJECT_NAME~~GLOBALSTAR",
            'description': 'Globalstar mobile satellite communications',
            'color': '#FFA726',
            'category': 'cellular',
        },
        'orbcomm': {
            'name': 'Orbcomm',
            'group': 'orbcomm',
            'spacetrack_query': "OBJECT_NAME~~ORBCOMM",
            'description': 'Orbcomm IoT satellite constellation',
            'color': '#26A69A',
            'category': 'iot',
        },
        
        # === Navigation/Positioning ===
        'gps': {
            'name': 'GPS',
            'group': 'gps-ops',
            'spacetrack_query': "OBJECT_NAME~~NAVSTAR",
            'description': 'US Global Positioning System operational satellites',
            'color': '#4CAF50',
            'category': 'positioning',
        },
        'glonass': {
            'name': 'GLONASS',
            'group': 'glo-ops',
            'spacetrack_query': "OBJECT_NAME~~COSMOS",  # GLONASS uses COSMOS designation
            'description': 'Russian Global Navigation Satellite System',
            'color': '#F44336',
            'category': 'positioning',
        },
        'galileo': {
            'name': 'Galileo',
            'group': 'galileo',
            'spacetrack_query': "OBJECT_NAME~~GALILEO",
            'description': 'European Global Navigation Satellite System',
            'color': '#2196F3',
            'category': 'positioning',
        },
        'beidou': {
            'name': 'BeiDou',
            'group': 'beidou',
            'spacetrack_query': "OBJECT_NAME~~BEIDOU",
            'description': 'Chinese BeiDou Navigation Satellite System',
            'color': '#FF9800',
            'category': 'positioning',
        },
        
        # === Earth Observation ===
        'planet': {
            'name': 'Planet',
            'group': 'planet',
            'spacetrack_query': "OBJECT_NAME~~FLOCK,OBJECT_NAME~~DOVE,OBJECT_NAME~~SKYSAT",
            'description': 'Planet Labs Earth observation satellites',
            'color': '#9C27B0',
            'category': 'earth_obs',
        },
        
        # === Weather ===
        'spire': {
            'name': 'Spire',
            'group': 'spire',
            'spacetrack_query': "OBJECT_NAME~~SPIRE,OBJECT_NAME~~LEMUR",
            'description': 'Spire Global nanosatellite constellation (weather/maritime)',
            'color': '#00BCD4',
            'category': 'weather',
        },
        
        # === Geostationary ===
        'intelsat': {
            'name': 'Intelsat',
            'group': 'intelsat',
            'spacetrack_query': "OBJECT_NAME~~INTELSAT",
            'description': 'Intelsat geostationary communication satellites',
            'color': '#607D8B',
            'category': 'geostationary',
        },
        'ses': {
            'name': 'SES',
            'group': 'ses',
            'spacetrack_query': "OBJECT_NAME~~SES-,OBJECT_NAME~~ASTRA",
            'description': 'SES geostationary communication satellites',
            'color': '#795548',
            'category': 'geostationary',
        },
        'geo': {
            'name': 'Geostationary',
            'group': 'geo',
            'spacetrack_query': None,  # Use CelesTrak for this one
            'description': 'All geostationary satellites',
            'color': '#3F51B5',
            'category': 'geostationary',
        },
        
        # === Science/Other ===
        'stations': {
            'name': 'Space Stations',
            'group': 'stations',
            'spacetrack_query': "OBJECT_NAME~~ISS,OBJECT_NAME~~TIANGONG,OBJECT_NAME~~CSS",
            'description': 'International Space Station and other stations',
            'color': '#FFEB3B',
            'category': 'science',
        },
        'swarm': {
            'name': 'Swarm',
            'group': 'swarm',
            'spacetrack_query': "OBJECT_NAME~~SWARM",
            'description': 'ESA Swarm Earth observation mission',
            'color': '#AB47BC',
            'category': 'science',
        },
        
        # === Chinese Constellations ===
        'qianfan': {
            'name': 'Qianfan (千帆)',
            'group': 'qianfan',
            'spacetrack_query': "OBJECT_NAME~~QIANFAN,OBJECT_NAME~~千帆,OBJECT_NAME~~G60",
            'description': 'Chinese Qianfan (G60 Starlink) satellite internet constellation',
            'color': '#E53935',
            'category': 'internet',
        },
        'guowang': {
            'name': 'Guowang (国网)',
            'group': 'guowang',
            'spacetrack_query': "OBJECT_NAME~~GUOWANG,OBJECT_NAME~~GW-",
            'description': 'Chinese Guowang (SatNet) satellite constellation',
            'color': '#C62828',
            'category': 'internet',
        },
        'galaxyspace': {
            'name': 'GalaxySpace (银河航天)',
            'group': 'galaxyspace',
            'spacetrack_query': "OBJECT_NAME~~GALAXY,OBJECT_NAME~~YINHE",
            'description': 'GalaxySpace Chinese satellite internet constellation',
            'color': '#7B1FA2',
            'category': 'internet',
        },
        'jilin': {
            'name': 'Jilin-1 (吉林一号)',
            'group': 'jilin-1',
            'spacetrack_query': "OBJECT_NAME~~JILIN",
            'description': 'Jilin-1 Earth observation satellite constellation',
            'color': '#00796B',
            'category': 'earth_obs',
        },
        'tianqi': {
            'name': 'Tianqi (天启)',
            'group': 'tianqi',
            'spacetrack_query': "OBJECT_NAME~~TIANQI",
            'description': 'Tianqi IoT satellite constellation',
            'color': '#5D4037',
            'category': 'iot',
        },
        'yaogan': {
            'name': 'Yaogan (遥感)',
            'group': 'yaogan',
            'spacetrack_query': "OBJECT_NAME~~YAOGAN",
            'description': 'Chinese Yaogan reconnaissance satellite series',
            'color': '#455A64',
            'category': 'earth_obs',
        },
        
        # === Additional Cellular/Direct-to-Device ===
        'bluewalker': {
            'name': 'Bluewalker (AST)',
            'group': 'ast',  # CelesTrak uses 'ast' for AST SpaceMobile
            'spacetrack_query': "OBJECT_NAME~~BLUEWALKER,OBJECT_NAME~~AST SPACE",
            'description': 'AST SpaceMobile direct-to-cell satellite constellation',
            'color': '#1565C0',
            'category': 'cellular',
        },
        'lynk': {
            'name': 'Lynk',
            'group': 'other-comm',  # Lynk satellites are in other-comm group
            'spacetrack_query': "OBJECT_NAME~~LYNK",
            'description': 'Lynk Global satellite-to-phone constellation',
            'color': '#0097A7',
            'category': 'cellular',
        },
        'espace': {
            'name': 'E-Space',
            'group': 'espace',
            'spacetrack_query': "OBJECT_NAME~~E-SPACE",
            'description': 'E-Space low Earth orbit satellite constellation',
            'color': '#6A1B9A',
            'category': 'internet',
        },
        
        # === Additional IoT ===
        'geespace': {
            'name': 'Geespace',
            'group': 'geespace',
            'spacetrack_query': "OBJECT_NAME~~GEESPACE,OBJECT_NAME~~GEELY",
            'description': 'Geespace IoT and automotive satellite constellation',
            'color': '#37474F',
            'category': 'iot',
        },
        
        # === Earth Imaging ===
        'satelog': {
            'name': 'Satelog',
            'group': 'satelog',
            'spacetrack_query': "OBJECT_NAME~~SATELOG",
            'description': 'Satelog Earth observation constellation',
            'color': '#558B2F',
            'category': 'earth_obs',
        },
        
        # === Telesat LEO ===
        'telesat': {
            'name': 'Telesat',
            'group': 'telesat',
            'spacetrack_query': "OBJECT_NAME~~TELESAT",
            'description': 'Telesat Lightspeed LEO constellation',
            'color': '#00838F',
            'category': 'internet',
        },
        
        # === Special Categories ===
        'active': {
            'name': 'Active Satellites',
            'group': 'active',
            'spacetrack_query': None,  # Use CelesTrak
            'description': 'All active satellites',
            'color': '#8BC34A',
            'category': 'all',
        },
        'visual': {
            'name': 'Visual Satellites',
            'group': 'visual',
            'spacetrack_query': None,  # Use CelesTrak
            'description': 'Bright satellites visible to naked eye',
            'color': '#FDD835',
            'category': 'special',
        },
        'analyst': {
            'name': 'Analyst Objects',
            'group': 'analyst',
            'spacetrack_query': None,  # Use CelesTrak
            'description': 'Objects of special interest to analysts',
            'color': '#EF5350',
            'category': 'special',
        },
        'last-30-days': {
            'name': 'Recent Launches',
            'group': 'last-30-days',
            'spacetrack_query': 'LAUNCH/>now-30',  # Launched in last 30 days
            'description': 'Satellites launched in the last 30 days',
            'color': '#66BB6A',
            'category': 'special',
        },
    }
    
    # Scheduler settings
    TLE_UPDATE_HOUR = 1  # UTC hour to run daily TLE update
    TLE_UPDATE_MINUTE = 0


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False


# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
