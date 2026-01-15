"""
SQLAlchemy database models for the Satellite Tracker.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .constellation import Constellation
from .launch import Launch
from .satellite import Satellite
from .ground_station import GroundStation
from .tle_history import TLEHistory

__all__ = ['db', 'Constellation', 'Launch', 'Satellite', 'GroundStation', 'TLEHistory']
