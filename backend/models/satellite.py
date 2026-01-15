"""
Satellite model for individual satellites.
"""
from datetime import datetime
from . import db


class Satellite(db.Model):
    """
    Represents an individual satellite with its TLE data and orbital parameters.
    """
    __tablename__ = 'satellites'
    
    id = db.Column(db.Integer, primary_key=True)
    norad_id = db.Column(db.Integer, unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    constellation_id = db.Column(db.Integer, db.ForeignKey('constellations.id'), index=True)
    launch_id = db.Column(db.Integer, db.ForeignKey('launches.id'), index=True, nullable=True)
    
    # TLE Data
    tle_line1 = db.Column(db.String(70))
    tle_line2 = db.Column(db.String(70))
    tle_epoch = db.Column(db.DateTime)
    
    # Satellite metadata
    intl_designator = db.Column(db.String(20))
    launch_date = db.Column(db.Date)
    decay_date = db.Column(db.Date)
    object_type = db.Column(db.String(20))  # PAYLOAD, ROCKET BODY, DEBRIS
    rcs_size = db.Column(db.String(10))  # SMALL, MEDIUM, LARGE
    country_code = db.Column(db.String(10))
    
    # Orbital parameters (derived from TLE)
    period_minutes = db.Column(db.Float)
    inclination = db.Column(db.Float)  # degrees
    apogee_km = db.Column(db.Float)
    perigee_km = db.Column(db.Float)
    eccentricity = db.Column(db.Float)
    semi_major_axis_km = db.Column(db.Float)
    mean_motion = db.Column(db.Float)  # revolutions per day
    
    # Status
    is_active = db.Column(db.Boolean, default=True)
    tle_updated_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    tle_history = db.relationship('TLEHistory', backref='satellite', lazy='dynamic',
                                   cascade='all, delete-orphan')
    
    def to_dict(self, include_tle=True):
        """Convert model to dictionary."""
        data = {
            'id': self.id,
            'norad_id': self.norad_id,
            'name': self.name,
            'constellation_id': self.constellation_id,
            'intl_designator': self.intl_designator,
            'launch_date': self.launch_date.isoformat() if self.launch_date else None,
            'object_type': self.object_type,
            'country_code': self.country_code,
            'period_minutes': self.period_minutes,
            'inclination': self.inclination,
            'apogee_km': self.apogee_km,
            'perigee_km': self.perigee_km,
            'eccentricity': self.eccentricity,
            'semi_major_axis_km': self.semi_major_axis_km,
            'mean_motion': self.mean_motion,
            'is_active': self.is_active,
            'tle_updated_at': self.tle_updated_at.isoformat() if self.tle_updated_at else None,
        }
        if include_tle:
            # Include TLE at top level for orbit calculation
            data['line1'] = self.tle_line1
            data['line2'] = self.tle_line2
            data['tle_epoch'] = self.tle_epoch.isoformat() if self.tle_epoch else None
            # Also include nested structure for backward compatibility
            data['tle'] = {
                'line1': self.tle_line1,
                'line2': self.tle_line2,
                'epoch': self.tle_epoch.isoformat() if self.tle_epoch else None,
            }
        return data
    
    def to_tle_dict(self):
        """Return minimal TLE data for frontend orbit calculation."""
        return {
            'name': self.name,
            'norad_id': self.norad_id,
            'line1': self.tle_line1,
            'line2': self.tle_line2,
        }
    
    def __repr__(self):
        return f'<Satellite {self.name} (NORAD: {self.norad_id})>'
