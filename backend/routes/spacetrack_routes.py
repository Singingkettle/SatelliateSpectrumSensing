"""
API routes for Space-Track.org status monitoring.
Replicates functionality from satellitemap.space/space-track-status
"""
from flask import Blueprint, jsonify, request
from services.spacetrack_service import spacetrack_service

spacetrack_bp = Blueprint('spacetrack', __name__, url_prefix='/api/spacetrack')


@spacetrack_bp.route('/status', methods=['GET'])
def get_status():
    """
    Get comprehensive Space-Track.org status.
    
    Returns:
    - API status (online/degraded/offline)
    - Authentication status
    - Recent TIP messages
    - Announcements
    - Recent launches
    - TLE publication statistics
    """
    try:
        status = spacetrack_service.get_full_status()
        return jsonify(status)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'authenticated': False
        }), 500


@spacetrack_bp.route('/health', methods=['GET'])
def get_health():
    """
    Quick health check for Space-Track API.
    """
    try:
        status = spacetrack_service.get_api_status()
        return jsonify(status)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@spacetrack_bp.route('/tip', methods=['GET'])
def get_tip_messages():
    """
    Get Tracking and Impact Prediction (TIP) messages.
    These are re-entry predictions.
    
    Query params:
    - limit: Max number of messages (default: 20)
    """
    limit = request.args.get('limit', 20, type=int)
    
    try:
        messages = spacetrack_service.get_tip_messages(limit)
        return jsonify({
            'count': len(messages),
            'messages': messages
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'messages': []
        }), 500


@spacetrack_bp.route('/announcements', methods=['GET'])
def get_announcements():
    """
    Get Space-Track.org announcements.
    """
    try:
        announcements = spacetrack_service.get_announcements()
        return jsonify({
            'count': len(announcements),
            'announcements': announcements
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'announcements': []
        }), 500


@spacetrack_bp.route('/launches', methods=['GET'])
def get_recent_launches():
    """
    Get recently launched satellites.
    
    Query params:
    - days: Number of days to look back (default: 30)
    - limit: Max number of results (default: 50)
    """
    days = request.args.get('days', 30, type=int)
    limit = request.args.get('limit', 50, type=int)
    
    try:
        launches = spacetrack_service.get_recent_launches(days)
        return jsonify({
            'days': days,
            'count': len(launches),
            'launches': launches[:limit]
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'launches': []
        }), 500


@spacetrack_bp.route('/tle-stats', methods=['GET'])
def get_tle_stats():
    """
    Get TLE publication statistics.
    
    Query params:
    - days: Number of days to include (default: 21)
    """
    days = request.args.get('days', 21, type=int)
    
    try:
        stats = spacetrack_service.get_tle_publish_stats(days)
        return jsonify({
            'days': days,
            'stats': stats
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'stats': []
        }), 500


@spacetrack_bp.route('/tle/<int:norad_id>', methods=['GET'])
def get_tle_for_satellite(norad_id):
    """
    Get latest TLE from Space-Track for a specific satellite.
    """
    try:
        tle_data = spacetrack_service.get_latest_tle_by_norad([norad_id])
        if tle_data:
            return jsonify(tle_data[0])
        return jsonify({'error': 'TLE not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
