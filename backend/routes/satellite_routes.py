"""
API routes for satellite data and operations.
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from models import db, Satellite, Constellation, TLEHistory
from services.orbit_service import orbit_service

satellite_bp = Blueprint('satellites', __name__, url_prefix='/api/satellites')


@satellite_bp.route('', methods=['GET'])
def get_satellites():
    """
    Get satellites with filtering and pagination.
    
    Query parameters:
    - constellation: Filter by constellation slug
    - search: Search by name (partial match)
    - limit: Maximum results (default: 100)
    - offset: Pagination offset (default: 0)
    - include_tle: Include TLE data (default: false)
    """
    constellation_slug = request.args.get('constellation')
    search = request.args.get('search')
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)
    include_tle = request.args.get('include_tle', 'false').lower() == 'true'
    
    query = Satellite.query
    
    # Filter by constellation
    if constellation_slug:
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if constellation:
            query = query.filter_by(constellation_id=constellation.id)
        else:
            return jsonify({'error': 'Constellation not found'}), 404
    
    # Search by name
    if search:
        query = query.filter(Satellite.name.ilike(f'%{search}%'))
    
    # Get total count before pagination
    total = query.count()
    
    # Apply pagination
    satellites = query.offset(offset).limit(limit).all()
    
    return jsonify({
        'total': total,
        'offset': offset,
        'limit': limit,
        'satellites': [sat.to_dict(include_tle=include_tle) for sat in satellites]
    })


@satellite_bp.route('/search', methods=['GET'])
def search_satellites():
    """
    Search satellites by name or NORAD ID.
    
    Query parameters:
    - q: Search query (name or NORAD ID)
    - limit: Maximum results (default: 50)
    """
    query = request.args.get('q', '')
    limit = request.args.get('limit', 50, type=int)
    
    if not query:
        return jsonify({'error': 'Search query required'}), 400
    
    results = []
    
    # Try to parse as NORAD ID
    try:
        norad_id = int(query)
        satellite = Satellite.query.filter_by(norad_id=norad_id).first()
        if satellite:
            results.append(satellite.to_dict(include_tle=False))
    except ValueError:
        pass
    
    # Search by name
    name_results = Satellite.query.filter(
        Satellite.name.ilike(f'%{query}%')
    ).limit(limit).all()
    
    # Add name results, avoiding duplicates
    existing_ids = {r['id'] for r in results}
    for sat in name_results:
        if sat.id not in existing_ids:
            results.append(sat.to_dict(include_tle=False))
    
    return jsonify({
        'query': query,
        'count': len(results),
        'results': results[:limit]
    })


@satellite_bp.route('/<int:norad_id>', methods=['GET'])
def get_satellite(norad_id):
    """
    Get detailed information for a specific satellite by NORAD ID.
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    data = satellite.to_dict(include_tle=True)
    
    # Include constellation info
    if satellite.constellation:
        data['constellation'] = {
            'id': satellite.constellation.id,
            'name': satellite.constellation.name,
            'slug': satellite.constellation.slug,
            'color': satellite.constellation.color,
        }
    
    return jsonify(data)


@satellite_bp.route('/<int:norad_id>/tle', methods=['GET'])
def get_satellite_tle(norad_id):
    """
    Get TLE data for a specific satellite.
    Optimized response for frontend orbit calculation.
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    return jsonify({
        'name': satellite.name,
        'norad_id': satellite.norad_id,
        'line1': satellite.tle_line1,
        'line2': satellite.tle_line2,
        'epoch': satellite.tle_epoch.isoformat() if satellite.tle_epoch else None,
    })


@satellite_bp.route('/<int:norad_id>/position', methods=['GET'])
def get_satellite_position(norad_id):
    """
    Get current position of a satellite.
    
    Query parameters:
    - time: ISO datetime string (default: now)
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    if not satellite.tle_line1 or not satellite.tle_line2:
        return jsonify({'error': 'No TLE data available'}), 400
    
    # Parse time parameter
    time_str = request.args.get('time')
    if time_str:
        try:
            time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid time format'}), 400
    else:
        time = datetime.utcnow()
    
    position = orbit_service.propagate_satellite(
        satellite.tle_line1,
        satellite.tle_line2,
        time
    )
    
    if not position:
        return jsonify({'error': 'Failed to calculate position'}), 500
    
    return jsonify({
        'satellite': satellite.name,
        'norad_id': norad_id,
        **position
    })


@satellite_bp.route('/<int:norad_id>/orbit', methods=['GET'])
def get_satellite_orbit(norad_id):
    """
    Get orbit track for a satellite.
    
    Query parameters:
    - duration: Track duration in minutes (default: 90)
    - step: Time step in seconds (default: 60)
    - start: Start time ISO string (default: now)
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    if not satellite.tle_line1 or not satellite.tle_line2:
        return jsonify({'error': 'No TLE data available'}), 400
    
    duration = request.args.get('duration', 90, type=int)
    step = request.args.get('step', 60, type=int)
    
    start_str = request.args.get('start')
    if start_str:
        try:
            start_time = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid start time format'}), 400
    else:
        start_time = datetime.utcnow()
    
    track = orbit_service.get_orbit_track(
        satellite.tle_line1,
        satellite.tle_line2,
        start_time,
        duration,
        step
    )
    
    return jsonify({
        'satellite': satellite.name,
        'norad_id': norad_id,
        'duration_minutes': duration,
        'step_seconds': step,
        'track': track
    })


@satellite_bp.route('/<int:norad_id>/history', methods=['GET'])
def get_satellite_history(norad_id):
    """
    Get TLE history for orbital decay analysis.
    
    Query parameters:
    - days: Number of days of history (default: 90)
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    days = request.args.get('days', 90, type=int)
    
    analysis = orbit_service.get_decay_analysis(satellite.id, days)
    
    return jsonify({
        'satellite': satellite.name,
        'norad_id': norad_id,
        **analysis
    })


@satellite_bp.route('/<int:norad_id>/tle-history', methods=['GET'])
def get_satellite_tle_history(norad_id):
    """
    Get raw TLE history data points for graphing orbital parameters over time.
    
    Query parameters:
    - days: Number of days of history (default: 365)
    - limit: Maximum number of data points (default: 500)
    
    Returns historical values for:
    - semi_major_axis_km: For altitude trend analysis
    - mean_motion: For orbital period changes
    - eccentricity: For orbit shape changes
    - inclination: For orbital plane changes
    - apogee_km/perigee_km: For altitude range
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    days = request.args.get('days', 365, type=int)
    limit = request.args.get('limit', 500, type=int)
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    history = TLEHistory.query.filter(
        TLEHistory.satellite_id == satellite.id,
        TLEHistory.epoch >= cutoff
    ).order_by(TLEHistory.epoch.asc()).limit(limit).all()
    
    return jsonify({
        'satellite': satellite.name,
        'norad_id': norad_id,
        'days': days,
        'count': len(history),
        'data': [h.to_dict() for h in history],
        # Summary statistics
        'summary': {
            'altitude_trend': _calculate_trend([h.semi_major_axis_km for h in history if h.semi_major_axis_km]),
            'first_record': history[0].epoch.isoformat() if history else None,
            'last_record': history[-1].epoch.isoformat() if history else None,
        }
    })


def _calculate_trend(values):
    """Calculate simple trend (increasing/decreasing/stable) from a list of values."""
    if not values or len(values) < 2:
        return 'unknown'
    
    first_avg = sum(values[:min(5, len(values))]) / min(5, len(values))
    last_avg = sum(values[-min(5, len(values)):]) / min(5, len(values))
    
    change_pct = (last_avg - first_avg) / first_avg * 100 if first_avg else 0
    
    if change_pct > 0.1:
        return 'increasing'
    elif change_pct < -0.1:
        return 'decreasing'
    else:
        return 'stable'


@satellite_bp.route('/<int:norad_id>/passes', methods=['GET'])
def get_satellite_passes(norad_id):
    """
    Predict satellite passes over an observer location.
    
    Query parameters:
    - lat: Observer latitude (required)
    - lon: Observer longitude (required)
    - alt: Observer altitude in meters (default: 0)
    - days: Prediction period in days (default: 7)
    - min_elevation: Minimum elevation angle (default: 10)
    """
    satellite = Satellite.query.filter_by(norad_id=norad_id).first()
    
    if not satellite:
        return jsonify({'error': 'Satellite not found'}), 404
    
    if not satellite.tle_line1 or not satellite.tle_line2:
        return jsonify({'error': 'No TLE data available'}), 400
    
    # Parse required parameters
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    
    if lat is None or lon is None:
        return jsonify({'error': 'Observer latitude and longitude required'}), 400
    
    alt = request.args.get('alt', 0, type=float)
    days = request.args.get('days', 7, type=int)
    min_elevation = request.args.get('min_elevation', 10, type=float)
    
    passes = orbit_service.predict_passes(
        satellite.tle_line1,
        satellite.tle_line2,
        lat, lon, alt,
        days=days,
        min_elevation=min_elevation
    )
    
    return jsonify({
        'satellite': satellite.name,
        'norad_id': norad_id,
        'observer': {'latitude': lat, 'longitude': lon, 'altitude_m': alt},
        'prediction_days': days,
        'min_elevation': min_elevation,
        'passes': passes
    })


@satellite_bp.route('/<int:norad_id>/sync-history', methods=['POST'])
def sync_satellite_history(norad_id):
    """
    Trigger backfill of TLE history for a specific satellite.
    Creates the satellite if it doesn't exist.
    """
    days = request.args.get('days', 3650, type=int) # Default 10 years for manual check
    
    try:
        from services.tle_service import tle_service
        count = tle_service.sync_satellite_history(norad_id, days=days)
        return jsonify({
            'status': 'success',
            'norad_id': norad_id,
            'history_records_added': count
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@satellite_bp.route('/all-tle', methods=['GET'])
def get_all_tle():
    """
    Get TLE data for all satellites.
    Warning: This can be a large response.
    
    Query parameters:
    - constellation: Filter by constellation slug
    """
    constellation_slug = request.args.get('constellation')
    
    query = Satellite.query
    
    if constellation_slug:
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if constellation:
            query = query.filter_by(constellation_id=constellation.id)
        else:
            return jsonify({'error': 'Constellation not found'}), 404
    
    satellites = query.all()
    
    return jsonify({
        'count': len(satellites),
        'satellites': [sat.to_tle_dict() for sat in satellites]
    })
