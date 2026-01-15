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
    cospar_id = db.Column(db.String(20), unique=True, nullable=False, index=True)  # International Designator (e.g., 2024-012A)
    mission_name = db.Column(db.String(100), index=True)
    launch_date = db.Column(db.DateTime, index=True)
    launch_site = db.Column(db.String(100))
    rocket_type = db.Column(db.String(50))
    launch_success = db.Column(db.Boolean, default=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    satellites = db.relationship('Satellite', backref='launch', lazy='dynamic')
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {
            'id': self.id,
            'cospar_id': self.cospar_id,
            'mission_name': self.mission_name,
            'launch_date': self.launch_date.isoformat() if self.launch_date else None,
            'launch_site': self.launch_site,
            'rocket_type': self.rocket_type,
            'launch_success': self.launch_success,
            'satellite_count': self.satellites.count()
        }
    
    def __repr__(self):
        return f'<Launch {self.cospar_id} - {self.mission_name}>'
