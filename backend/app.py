"""
Satellite Tracker Backend Application
Flask application entry point with database initialization and API routes.
"""
import os
import atexit
from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from config import config
from models import db


def create_app(config_name=None):
    """
    Application factory function.
    
    Args:
        config_name: Configuration name ('development', 'production', or 'default')
    
    Returns:
        Flask application instance
    """
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Set dynamic engine options based on database type
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = config[config_name].get_engine_options()
    
    # Initialize extensions
    db.init_app(app)
    Migrate(app, db)
    
    # Enable SQLite WAL mode for better concurrency
    if app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite'):
        with app.app_context():
            from sqlalchemy import text
            try:
                db.session.execute(text('PRAGMA journal_mode=WAL'))
                db.session.execute(text('PRAGMA synchronous=NORMAL'))
                db.session.execute(text('PRAGMA busy_timeout=30000'))
                db.session.commit()
                app.logger.info('SQLite WAL mode enabled for better concurrency')
            except Exception as e:
                app.logger.warning(f'Could not enable WAL mode: {e}')
    
    # Enable CORS
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Register blueprints
    from routes.constellation_routes import constellation_bp
    from routes.satellite_routes import satellite_bp
    from routes.ground_station_routes import ground_station_bp
    from routes.spacetrack_routes import spacetrack_bp
    from routes.statistics_routes import statistics_bp
    
    app.register_blueprint(constellation_bp)
    app.register_blueprint(satellite_bp)
    app.register_blueprint(ground_station_bp)
    app.register_blueprint(spacetrack_bp)
    app.register_blueprint(statistics_bp)
    
    # Health check endpoint
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint for monitoring."""
        return jsonify({
            'status': 'ok',
            'message': 'Satellite Tracker API is running',
            'version': '2.0.0',
            'data_source': 'space-track.org via CelesTrak'
        })
    
    # API info endpoint
    @app.route('/api', methods=['GET'])
    def api_info():
        """API information and available endpoints."""
        return jsonify({
            'name': 'ChangShuoSpace API',
            'version': '2.0.0',
            'data_source': 'space-track.org (via CelesTrak mirror)',
            'endpoints': {
                'constellations': '/api/constellations',
                'satellites': '/api/satellites',
                'ground_stations': '/api/ground-stations',
                'statistics': '/api/statistics',
                'scheduler': '/api/scheduler/status',
                'health': '/api/health',
            }
        })
    
    # Scheduler status endpoint
    @app.route('/api/scheduler/status', methods=['GET'])
    def scheduler_status():
        """Get scheduler status and statistics."""
        from services.scheduler_service import get_scheduler_status
        return jsonify(get_scheduler_status())
    
    # Manual TLE update trigger
    @app.route('/api/scheduler/trigger-update', methods=['POST'])
    def trigger_update():
        """Manually trigger a TLE update."""
        from services.scheduler_service import trigger_manual_update
        trigger_manual_update()
        return jsonify({
            'status': 'success',
            'message': 'TLE update triggered'
        })
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Resource not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({'error': 'Internal server error'}), 500
    
    return app


# Create application instance
app = create_app()


def init_database():
    """Initialize database and create tables."""
    with app.app_context():
        db.create_all()
        print("[Database] Tables created successfully")


def start_scheduler():
    """Start background scheduler and services."""
    from services.scheduler_service import initialize_scheduler, shutdown_scheduler
    from services.tle_service import tle_service
    
    initialize_scheduler(app)
    atexit.register(shutdown_scheduler)
    
    # Perform TLE service startup check (restore cache, check history)
    with app.app_context():
        try:
            tle_service.startup_check()
        except Exception as e:
            print(f"[Startup] Error during TLE service check: {e}")


if __name__ == '__main__':
    # Initialize database
    init_database()
    
    # Start background scheduler
    start_scheduler()
    
    # Run the application
    print("=" * 50)
    print("ChangShuoSpace API Server")
    print("=" * 50)
    print(f"Server running at: http://localhost:6359")
    print(f"API documentation: http://localhost:6359/api")
    print("=" * 50)
    
    app.run(
        host='0.0.0.0',
        port=6359,
        debug=False,
        use_reloader=False
    )
