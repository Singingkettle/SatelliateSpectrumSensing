"""
Ground Station model for satellite ground stations.
"""
from datetime import datetime
from . import db


class GroundStation(db.Model):
    """
    Represents a satellite ground station.
    """
    __tablename__ = 'ground_stations'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    constellation_id = db.Column(db.Integer, db.ForeignKey('constellations.id'), index=True)
    
    # Location
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    altitude_m = db.Column(db.Float, default=0)
    
    # Metadata
    station_type = db.Column(db.String(50))  # gateway, ground_terminal, etc.
    country = db.Column(db.String(50))
    city = db.Column(db.String(100))
    operator = db.Column(db.String(100))
    
    # Status
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'constellation_id': self.constellation_id,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'altitude_m': self.altitude_m,
            'station_type': self.station_type,
            'country': self.country,
            'city': self.city,
            'operator': self.operator,
            'is_active': self.is_active,
        }
    
    def __repr__(self):
        return f'<GroundStation {self.name}>'
