"""
Space-Track Account model for persistent account state tracking.
"""
from datetime import datetime
from . import db


class SpaceTrackAccount(db.Model):
    """
    Stores Space-Track account information and usage statistics.
    Used for persistent tracking across application restarts.
    """
    __tablename__ = 'spacetrack_accounts'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_encrypted = db.Column(db.String(256), nullable=False)
    
    # Status
    status = db.Column(db.String(20), default='active')  # active, rate_limited, suspended, auth_failed
    is_enabled = db.Column(db.Boolean, default=True)
    
    # Timestamps
    last_used_at = db.Column(db.DateTime)
    cooldown_until = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Usage statistics
    total_requests = db.Column(db.Integer, default=0)
    requests_today = db.Column(db.Integer, default=0)
    requests_this_week = db.Column(db.Integer, default=0)
    last_reset_date = db.Column(db.Date)
    
    # Error tracking
    consecutive_errors = db.Column(db.Integer, default=0)
    total_errors = db.Column(db.Integer, default=0)
    last_error = db.Column(db.Text)
    last_error_time = db.Column(db.DateTime)
    
    # Query-specific tracking (stored as JSON-like text)
    last_gp_queries = db.Column(db.Text)  # JSON: {constellation: timestamp}
    last_satcat_query = db.Column(db.DateTime)
    last_gp_history_queries = db.Column(db.Text)  # JSON: {constellation: timestamp}
    
    def to_dict(self, include_sensitive=False):
        """Convert model to dictionary."""
        data = {
            'id': self.id,
            'username': self.username,
            'status': self.status,
            'is_enabled': self.is_enabled,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'cooldown_until': self.cooldown_until.isoformat() if self.cooldown_until else None,
            'total_requests': self.total_requests,
            'requests_today': self.requests_today,
            'consecutive_errors': self.consecutive_errors,
            'last_error': self.last_error,
        }
        if include_sensitive:
            data['password_encrypted'] = self.password_encrypted
        return data
    
    def __repr__(self):
        return f'<SpaceTrackAccount {self.username} ({self.status})>'


class DataSyncLog(db.Model):
    """
    Logs data synchronization events for auditing and debugging.
    """
    __tablename__ = 'data_sync_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Sync details
    sync_type = db.Column(db.String(50), nullable=False)  # gp, satcat, gp_history, launch, ground_station
    constellation_slug = db.Column(db.String(50), index=True)
    
    # Account used
    account_username = db.Column(db.String(100))
    
    # Results
    status = db.Column(db.String(20), default='pending')  # pending, success, failed, partial
    records_fetched = db.Column(db.Integer, default=0)
    records_new = db.Column(db.Integer, default=0)
    records_updated = db.Column(db.Integer, default=0)
    
    # Timing
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    duration_seconds = db.Column(db.Float)
    
    # Error info
    error_message = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'sync_type': self.sync_type,
            'constellation_slug': self.constellation_slug,
            'account_username': self.account_username,
            'status': self.status,
            'records_fetched': self.records_fetched,
            'records_new': self.records_new,
            'records_updated': self.records_updated,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration_seconds': self.duration_seconds,
            'error_message': self.error_message,
        }
    
    def __repr__(self):
        return f'<DataSyncLog {self.sync_type} {self.constellation_slug} ({self.status})>'
