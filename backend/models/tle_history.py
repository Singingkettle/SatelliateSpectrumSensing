"""
TLE History model for tracking orbital decay and changes.
"""
from datetime import datetime
from . import db


class TLEHistory(db.Model):
    """
    Stores historical TLE data for analyzing orbital decay and changes over time.
    """
    __tablename__ = 'tle_history'
    
    id = db.Column(db.Integer, primary_key=True)
    satellite_id = db.Column(db.Integer, db.ForeignKey('satellites.id'), nullable=False, index=True)
    
    # TLE Data
    tle_line1 = db.Column(db.String(70), nullable=False)
    tle_line2 = db.Column(db.String(70), nullable=False)
    epoch = db.Column(db.DateTime, nullable=False, index=True)
    
    # Key orbital parameters for decay analysis
    semi_major_axis_km = db.Column(db.Float)
    mean_motion = db.Column(db.Float)
    eccentricity = db.Column(db.Float)
    inclination = db.Column(db.Float)
    apogee_km = db.Column(db.Float)
    perigee_km = db.Column(db.Float)
    
    # Metadata
    source = db.Column(db.String(20), default='SpaceTrack')  # 'SpaceTrack', 'CelesTrak', 'API2'
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {
            'id': self.id,
            'satellite_id': self.satellite_id,
            'epoch': self.epoch.isoformat() if self.epoch else None,
            'semi_major_axis_km': self.semi_major_axis_km,
            'mean_motion': self.mean_motion,
            'eccentricity': self.eccentricity,
            'inclination': self.inclination,
            'apogee_km': self.apogee_km,
            'perigee_km': self.perigee_km,
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
        }
    
    def __repr__(self):
        return f'<TLEHistory satellite_id={self.satellite_id} epoch={self.epoch}>'
