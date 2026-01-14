"""
Constellation model for satellite constellations.
"""
from datetime import datetime
from . import db


class Constellation(db.Model):
    """
    Represents a satellite constellation (e.g., Starlink, GPS, OneWeb).
    """
    __tablename__ = 'constellations'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False, index=True)
    slug = db.Column(db.String(50), unique=True, nullable=False, index=True)
    description = db.Column(db.Text)
    tle_source_url = db.Column(db.String(255))
    celestrak_group = db.Column(db.String(50))
    color = db.Column(db.String(20), default='#FFFFFF')
    satellite_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    satellites = db.relationship('Satellite', backref='constellation', lazy='dynamic')
    ground_stations = db.relationship('GroundStation', backref='constellation', lazy='dynamic')
    
    def to_dict(self, include_satellites=False):
        """Convert model to dictionary."""
        data = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'color': self.color,
            'satellite_count': self.satellite_count,
            'is_active': self.is_active,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_satellites:
            data['satellites'] = [sat.to_dict() for sat in self.satellites.limit(100)]
        return data
    
    def __repr__(self):
        return f'<Constellation {self.name}>'
