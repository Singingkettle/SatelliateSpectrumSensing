from flask import Blueprint, jsonify, request
from services.statistics_service import statistics_service
from services.tle_service import tle_service
from config import Config

statistics_bp = Blueprint('statistics', __name__, url_prefix='/api/statistics')

@statistics_bp.route('/constellation/<slug>/summary', methods=['GET'])
def constellation_summary(slug):
    """Get summary statistics for a constellation."""
    data = statistics_service.get_constellation_summary(slug)
    if not data:
        return jsonify({'error': 'Constellation not found'}), 404
    return jsonify(data)

@statistics_bp.route('/constellation/<slug>/ensure-data', methods=['POST'])
def ensure_constellation_data(slug):
    """
    Ensure real historical data exists for a constellation by triggering
    Space-Track SATCAT metadata update and incremental TLE history backfill.
    
    The history backfill is incremental and rate-limit compliant:
    - Downloads in small batches with delays between requests
    - Already downloaded data is never re-downloaded
    - Can be called multiple times to complete large constellations
    
    Query parameters:
    - days: Number of days of history to fetch (default: 3 years = 1095)
    - max_batches: Maximum batches to process (default: 10, use 0 for unlimited)
    """
    from models import Constellation, Satellite
    
    if slug not in Config.CONSTELLATIONS:
        return jsonify({'error': 'Constellation not found'}), 404

    days = request.args.get('days', 365 * 3, type=int)  # Default 3 years
    max_batches = request.args.get('max_batches', 10, type=int)
    if max_batches == 0:
        max_batches = None  # Unlimited
    
    # 1. Sync FULL catalog (Active + Decayed) to ensure all satellites are in DB
    catalog_result = tle_service.sync_catalog_from_spacetrack(slug)
    
    # 2. Get current satellite count
    constellation = Constellation.query.filter_by(slug=slug).first()
    sat_count = 0
    if constellation:
        sat_count = Satellite.query.filter_by(constellation_id=constellation.id).count()
    
    # 3. Incremental history backfill (rate-limit compliant)
    history_result = tle_service.sync_constellation_history(
        slug, 
        days=days,
        max_batches=max_batches
    )

    return jsonify({
        'status': 'ok',
        'constellation': slug,
        'satellite_count': sat_count,
        'catalog_sync': catalog_result,
        'history_result': history_result,
    })


@statistics_bp.route('/constellation/<slug>/history-status', methods=['GET'])
def get_history_status(slug):
    """
    Get the current status of history backfill for a constellation.
    Does NOT trigger any downloads - just reports current progress.
    
    Query parameters:
    - days: Target history days (default: 3 years = 1095)
    """
    if slug not in Config.CONSTELLATIONS:
        return jsonify({'error': 'Constellation not found'}), 404
    
    days = request.args.get('days', 365 * 3, type=int)
    status = tle_service.get_history_backfill_status(slug, days=days)
    
    return jsonify(status)

@statistics_bp.route('/constellation/<slug>/altitude-distribution', methods=['GET'])
def altitude_distribution(slug):
    """Get altitude distribution histogram."""
    data = statistics_service.get_altitude_distribution(slug)
    return jsonify(data)

@statistics_bp.route('/constellation/<slug>/inclination-distribution', methods=['GET'])
def inclination_distribution(slug):
    """Get inclination distribution histogram."""
    data = statistics_service.get_inclination_distribution(slug)
    return jsonify(data)

@statistics_bp.route('/constellation/<slug>/launches', methods=['GET'])
def constellation_launches(slug):
    """Get launch history."""
    use_estimate = request.args.get('estimate', 'false').lower() == 'true'
    data = statistics_service.get_launch_history(slug, use_estimate=use_estimate)
    return jsonify(data)

@statistics_bp.route('/constellation/<slug>/growth', methods=['GET'])
def constellation_growth(slug):
    """Get growth history (active count over time)."""
    use_estimate = request.args.get('estimate', 'false').lower() == 'true'
    data = statistics_service.get_constellation_growth(slug, use_estimate=use_estimate)
    return jsonify(data)

@statistics_bp.route('/constellation/<slug>/decays', methods=['GET'])
def constellation_decays(slug):
    """Get decay history."""
    data = statistics_service.get_decay_history(slug)
    return jsonify(data)

@statistics_bp.route('/satellite/<int:norad_id>/decay', methods=['GET'])
def satellite_decay(norad_id):
    """Get orbital decay history for a specific satellite."""
    data = statistics_service.get_orbital_decay(norad_id)
    return jsonify(data)
