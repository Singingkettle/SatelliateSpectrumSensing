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
    
    # Additional orbital parameters for Altitude History charts
    period_minutes = db.Column(db.Float)       # Orbital period in minutes
    bstar = db.Column(db.Float)                # B* drag coefficient
    mean_anomaly = db.Column(db.Float)         # Mean anomaly in degrees
    raan = db.Column(db.Float)                 # Right ascension of ascending node
    arg_of_perigee = db.Column(db.Float)       # Argument of perigee
    
    # Metadata
    source = db.Column(db.String(50), default='SpaceTrack')  # Data source identifier
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
            'period_minutes': self.period_minutes,
            'bstar': self.bstar,
            'mean_anomaly': self.mean_anomaly,
            'raan': self.raan,
            'arg_of_perigee': self.arg_of_perigee,
            'source': self.source,
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
        }
    
    def __repr__(self):
        return f'<TLEHistory satellite_id={self.satellite_id} epoch={self.epoch}>'
