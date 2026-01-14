"""
API route blueprints for the Satellite Tracker.
"""
from .constellation_routes import constellation_bp
from .satellite_routes import satellite_bp
from .ground_station_routes import ground_station_bp

__all__ = ['constellation_bp', 'satellite_bp', 'ground_station_bp']
