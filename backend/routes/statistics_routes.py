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
    Space-Track SATCAT metadata update and optionally TLE history backfill.
    
    NOTE: For large constellations (Starlink, OneWeb), history backfill is
    skipped by default to avoid overwhelming Space-Track API. Use the
    'force_history' parameter to override.
    
    Query parameters:
    - days: Number of days of history to fetch (default: 30)
    - force_history: Force history loading even for large constellations (default: false)
    """
    from models import Constellation, Satellite
    
    if slug not in Config.CONSTELLATIONS:
        return jsonify({'error': 'Constellation not found'}), 404

    days = request.args.get('days', Config.HISTORY_DAYS_DEFAULT, type=int)
    force_history = request.args.get('force_history', 'false').lower() == 'true'
    
    # 1. Sync FULL catalog (Active + Decayed) to ensure all satellites are in DB
    catalog_result = tle_service.sync_catalog_from_spacetrack(slug)
    
    # 2. Check satellite count before attempting history backfill
    constellation = Constellation.query.filter_by(slug=slug).first()
    sat_count = 0
    if constellation:
        sat_count = Satellite.query.filter_by(constellation_id=constellation.id).count()
    
    history_result = {}
    
    # Skip history for large constellations unless forced
    # GP_HISTORY has strict rate limits and should be downloaded once per lifetime
    if sat_count > 500 and not force_history:
        history_result = {
            'skipped': True,
            'reason': f'Constellation has {sat_count} satellites (>500), history loading skipped',
            'suggestion': 'For large constellations, download history from Space-Track cloud storage at https://ln5.sync.com/dl/afd354190',
            'override': 'Add ?force_history=true to force history loading (not recommended)'
        }
    else:
        # Backfill TLE history for all satellites
        history_added = tle_service.sync_constellation_history(slug, days=days)
        history_result = {'records_added': history_added}

    return jsonify({
        'status': 'ok',
        'constellation': slug,
        'satellite_count': sat_count,
        'catalog_sync': catalog_result,
        'history_result': history_result,
    })

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
