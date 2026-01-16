"""
Launch model for tracking satellite launches.
"""
from datetime import datetime
from . import db


class Launch(db.Model):
    """
    Represents a rocket launch event.
    """
    __tablename__ = 'launches'
    
    id = db.Column(db.Integer, primary_key=True)
    cospar_id = db.Column(db.String(20), unique=True, nullable=False, index=True)  # International Designator (e.g., 2024-012)
    mission_name = db.Column(db.String(200), index=True)
    launch_date = db.Column(db.DateTime, index=True)
    launch_site = db.Column(db.String(100))
    launch_site_full = db.Column(db.String(200))  # Full site name
    rocket_type = db.Column(db.String(100))
    rocket_family = db.Column(db.String(50))      # e.g., Falcon, Atlas, Soyuz
    launch_success = db.Column(db.Boolean, default=True)
    
    # Additional details
    payload_count = db.Column(db.Integer)          # Number of payloads
    orbit_type = db.Column(db.String(20))          # LEO, GEO, MEO, SSO, etc.
    orbit_altitude_km = db.Column(db.Float)        # Target orbit altitude
    orbit_inclination = db.Column(db.Float)        # Target orbit inclination
    mission_description = db.Column(db.Text)       # Mission description
    
    # External references
    launch_library_id = db.Column(db.String(50))   # Launch Library 2 ID
    video_url = db.Column(db.String(500))          # Launch video URL
    wiki_url = db.Column(db.String(500))           # Wikipedia URL
    
    # Metadata
    data_source = db.Column(db.String(50), default='SpaceTrack')  # Data source
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    satellites = db.relationship('Satellite', backref='launch', lazy='dynamic')
    
    def to_dict(self, include_details=False):
        """Convert model to dictionary."""
        data = {
            'id': self.id,
            'cospar_id': self.cospar_id,
            'mission_name': self.mission_name,
            'launch_date': self.launch_date.isoformat() if self.launch_date else None,
            'launch_site': self.launch_site,
            'rocket_type': self.rocket_type,
            'launch_success': self.launch_success,
            'satellite_count': self.satellites.count(),
            'payload_count': self.payload_count,
            'orbit_type': self.orbit_type,
        }
        
        if include_details:
            data.update({
                'launch_site_full': self.launch_site_full,
                'rocket_family': self.rocket_family,
                'orbit_altitude_km': self.orbit_altitude_km,
                'orbit_inclination': self.orbit_inclination,
                'mission_description': self.mission_description,
                'launch_library_id': self.launch_library_id,
                'video_url': self.video_url,
                'wiki_url': self.wiki_url,
                'data_source': self.data_source,
            })
        
        return data
    
    def __repr__(self):
        return f'<Launch {self.cospar_id} - {self.mission_name}>'
