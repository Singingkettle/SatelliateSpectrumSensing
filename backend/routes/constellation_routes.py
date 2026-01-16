"""
API routes for constellation management.
Enhanced with statistics and launch history endpoints.
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from models import db, Constellation, Satellite
from services.tle_service import tle_service
from config import Config

constellation_bp = Blueprint('constellations', __name__, url_prefix='/api/constellations')


@constellation_bp.route('', methods=['GET'])
def get_constellations():
    """
    Get all available constellations.
    
    Returns list of constellations with their satellite counts and metadata.
    """
    # Get constellations from database
    db_constellations = Constellation.query.filter_by(is_active=True).all()
    
    # If database is empty, return configured constellations
    if not db_constellations:
        configured = []
        for slug, config in Config.CONSTELLATIONS.items():
            configured.append({
                'slug': slug,
                'name': config['name'],
                'description': config['description'],
                'color': config['color'],
                'satellite_count': 0,
                'is_loaded': False,
            })
        return jsonify(configured)
    
    # Return database constellations
    result = []
    for c in db_constellations:
        result.append({
            'id': c.id,
            'slug': c.slug,
            'name': c.name,
            'description': c.description,
            'color': c.color,
            'satellite_count': c.satellite_count,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'is_loaded': True,
        })
    
    # Add configured but not yet loaded constellations
    loaded_slugs = {c.slug for c in db_constellations}
    for slug, config in Config.CONSTELLATIONS.items():
        if slug not in loaded_slugs:
            result.append({
                'slug': slug,
                'name': config['name'],
                'description': config['description'],
                'color': config['color'],
                'satellite_count': 0,
                'is_loaded': False,
            })
    
    return jsonify(result)


@constellation_bp.route('/available', methods=['GET'])
def get_available_constellations():
    """
    Get all configured constellation definitions (not necessarily loaded).
    """
    result = []
    for slug, config in Config.CONSTELLATIONS.items():
        result.append({
            'slug': slug,
            'name': config['name'],
            'description': config['description'],
            'color': config['color'],
            'group': config['group'],
        })
    return jsonify(result)


@constellation_bp.route('/<slug>', methods=['GET'])
def get_constellation(slug):
    """
    Get a specific constellation by slug.
    """
    constellation = Constellation.query.filter_by(slug=slug).first()
    
    if not constellation:
        # Check if it's a configured constellation
        if slug in Config.CONSTELLATIONS:
            config = Config.CONSTELLATIONS[slug]
            return jsonify({
                'slug': slug,
                'name': config['name'],
                'description': config['description'],
                'color': config['color'],
                'satellite_count': 0,
                'is_loaded': False,
            })
        return jsonify({'error': 'Constellation not found'}), 404
    
    return jsonify(constellation.to_dict())


@constellation_bp.route('/<slug>/satellites', methods=['GET'])
def get_constellation_satellites(slug):
    """
    Get all satellites in a constellation.
    
    Query parameters:
    - limit: Maximum number of satellites to return (default: 1000)
    - offset: Offset for pagination (default: 0)
    - include_decayed: If true, include decayed satellites (default: false)
    """
    limit = request.args.get('limit', 1000, type=int)
    offset = request.args.get('offset', 0, type=int)
    include_decayed = request.args.get('include_decayed', 'false').lower() == 'true'
    
    constellation = Constellation.query.filter_by(slug=slug).first()
    
    if not constellation:
        return jsonify({'error': 'Constellation not found'}), 404
    
    query = Satellite.query.filter_by(constellation_id=constellation.id)
    
    if not include_decayed:
        query = query.filter_by(is_active=True)
    
    satellites = query.offset(offset).limit(limit).all()
    
    # Get total count with filter applied
    total_query = Satellite.query.filter_by(constellation_id=constellation.id)
    if not include_decayed:
        total_query = total_query.filter_by(is_active=True)
    total_count = total_query.count()
    
    return jsonify({
        'constellation': constellation.name,
        'total': total_count,
        'offset': offset,
        'limit': limit,
        'satellites': [sat.to_dict(include_tle=False) for sat in satellites]
    })


@constellation_bp.route('/<slug>/tle', methods=['GET'])
def get_constellation_tle(slug):
    """
    Get TLE data for all satellites in a constellation.
    Optimized for frontend orbit calculation.
    
    If no data exists, automatically fetches from external sources:
    1. api2.satellitemap.space (proxy)
    2. Space-Track.org
    3. CelesTrak
    
    Query parameters:
    - auto_fetch: Enable/disable auto-fetch on missing data (default: true)
    - include_decayed: If true, include decayed satellites (default: false)
    """
    if slug not in Config.CONSTELLATIONS:
        return jsonify({'error': f'Constellation "{slug}" not found'}), 404
    
    # Check if auto-fetch is enabled via query param
    auto_fetch = request.args.get('auto_fetch', 'true').lower() == 'true'
    include_decayed = request.args.get('include_decayed', 'false').lower() == 'true'
    
    try:
        tle_data = tle_service.get_constellation_tle(
            slug, 
            auto_fetch=auto_fetch,
            active_only=not include_decayed
        )
        
        # Get constellation metadata
        config = Config.CONSTELLATIONS[slug]
        constellation = Constellation.query.filter_by(slug=slug).first()
        
        return jsonify({
            'constellation': slug,
            'name': config.get('name', slug),
            'color': config.get('color', '#FFFFFF'),
            'count': len(tle_data),
            'satellites': tle_data,
            'last_updated': constellation.updated_at.isoformat() if constellation and constellation.updated_at else None,
            'auto_fetched': auto_fetch and len(tle_data) > 0,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@constellation_bp.route('/<slug>/stats', methods=['GET'])
def get_constellation_stats(slug):
    """
    Get statistics for a constellation including growth and decay data.
    
    Returns activity summary for different time periods.
    """
    constellation = Constellation.query.filter_by(slug=slug).first()
    
    if not constellation:
        if slug not in Config.CONSTELLATIONS:
            return jsonify({'error': 'Constellation not found'}), 404
        # Return empty stats for unconfigured constellation
        return jsonify({
            'constellation': slug,
            'stats': {
                'total': 0,
                'active': 0,
                'decayed': 0,
                'today': {'appeared': 0, 'decayed': 0, 'net_change': 0},
                'week': {'appeared': 0, 'decayed': 0, 'net_change': 0},
                'month': {'appeared': 0, 'decayed': 0, 'net_change': 0},
                'year': {'appeared': 0, 'decayed': 0, 'net_change': 0},
            }
        })
    
    # Calculate time boundaries
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start.replace(day=1)
    year_start = today_start.replace(month=1, day=1)
    
    # Get satellite counts
    total_count = Satellite.query.filter_by(constellation_id=constellation.id).count()
    active_count = Satellite.query.filter_by(
        constellation_id=constellation.id,
        is_active=True
    ).count()
    decayed_count = total_count - active_count
    
    # Get appearance counts (satellites added)
    today_appeared = Satellite.query.filter(
        Satellite.constellation_id == constellation.id,
        Satellite.created_at >= today_start
    ).count()
    
    week_appeared = Satellite.query.filter(
        Satellite.constellation_id == constellation.id,
        Satellite.created_at >= week_start
    ).count()
    
    month_appeared = Satellite.query.filter(
        Satellite.constellation_id == constellation.id,
        Satellite.created_at >= month_start
    ).count()
    
    year_appeared = Satellite.query.filter(
        Satellite.constellation_id == constellation.id,
        Satellite.created_at >= year_start
    ).count()
    
    # TODO: Track decay dates properly - for now estimate from inactive satellites
    # In production, this would come from a decay_date field on the satellite model
    today_decayed = 0
    week_decayed = max(0, int(decayed_count * 0.01))  # Rough estimate
    month_decayed = max(0, int(decayed_count * 0.05))
    year_decayed = decayed_count
    
    return jsonify({
        'constellation': slug,
        'name': constellation.name,
        'stats': {
            'total': total_count,
            'active': active_count,
            'decayed': decayed_count,
            'today': {
                'appeared': today_appeared,
                'decayed': today_decayed,
                'net_change': today_appeared - today_decayed
            },
            'week': {
                'appeared': week_appeared,
                'decayed': week_decayed,
                'net_change': week_appeared - week_decayed
            },
            'month': {
                'appeared': month_appeared,
                'decayed': month_decayed,
                'net_change': month_appeared - month_decayed
            },
            'year': {
                'appeared': year_appeared,
                'decayed': year_decayed,
                'net_change': year_appeared - year_decayed
            }
        },
        'updated_at': constellation.updated_at.isoformat() if constellation.updated_at else None
    })


@constellation_bp.route('/<slug>/launches', methods=['GET'])
def get_constellation_launches(slug):
    """
    Get launch history for a constellation.
    Groups satellites by launch date/mission.
    
    Query parameters:
    - year: Filter by year (optional)
    - limit: Maximum launches to return (default: 100)
    """
    constellation = Constellation.query.filter_by(slug=slug).first()
    
    if not constellation:
        if slug not in Config.CONSTELLATIONS:
            return jsonify({'error': 'Constellation not found'}), 404
        return jsonify({'constellation': slug, 'launches': []})
    
    year_filter = request.args.get('year', type=int)
    limit = request.args.get('limit', 100, type=int)
    
    # Get satellites grouped by international designator (which indicates launch)
    query = Satellite.query.filter_by(constellation_id=constellation.id)
    
    if year_filter:
        # Filter by year in COSPAR ID (format: YYYY-NNN)
        query = query.filter(Satellite.intl_designator.like(f'{year_filter}-%'))
    
    satellites = query.order_by(Satellite.intl_designator.desc()).all()
    
    # Group by launch (same COSPAR prefix)
    launches = {}
    for sat in satellites:
        if not sat.intl_designator:
            continue
        
        # COSPAR format: YYYY-NNNX -> group by YYYY-NNN
        parts = sat.intl_designator.split('-')
        if len(parts) >= 2:
            launch_id = f"{parts[0]}-{parts[1][:3] if len(parts[1]) > 3 else parts[1]}"
            
            if launch_id not in launches:
                launches[launch_id] = {
                    'cospar': launch_id,
                    'year': int(parts[0]) if parts[0].isdigit() else 0,
                    'satellites': [],
                    'count': 0,
                    'altitude_km': sat.apogee_km,
                    'inclination': sat.inclination,
                }
            
            launches[launch_id]['satellites'].append({
                'name': sat.name,
                'norad_id': sat.norad_id,
                'status': 'active' if sat.is_active else 'inactive',
            })
            launches[launch_id]['count'] += 1
    
    # Convert to list and sort by year/launch
    launch_list = sorted(launches.values(), key=lambda x: x['cospar'], reverse=True)
    
    # Group by year
    years = {}
    for launch in launch_list[:limit]:
        year = launch['year']
        if year not in years:
            years[year] = []
        years[year].append(launch)
    
    return jsonify({
        'constellation': slug,
        'name': constellation.name,
        'launch_count': len(launches),
        'launches_by_year': years
    })


@constellation_bp.route('/<slug>/growth', methods=['GET'])
def get_constellation_growth(slug):
    """
    Get growth data for constellation visualization.
    Returns satellite counts over time.
    
    Query parameters:
    - period: 'year', 'month', 'week' (default: 'year')
    """
    constellation = Constellation.query.filter_by(slug=slug).first()
    
    if not constellation:
        if slug not in Config.CONSTELLATIONS:
            return jsonify({'error': 'Constellation not found'}), 404
        return jsonify({'constellation': slug, 'growth': []})
    
    # Get all satellites ordered by creation date
    satellites = Satellite.query.filter_by(
        constellation_id=constellation.id
    ).order_by(Satellite.created_at).all()
    
    # Build cumulative growth data
    growth_data = []
    total = 0
    active = 0
    
    # Group by month for visualization
    current_month = None
    
    for sat in satellites:
        if sat.created_at:
            month_key = sat.created_at.strftime('%Y-%m')
            
            if month_key != current_month:
                if current_month is not None:
                    growth_data.append({
                        'date': current_month,
                        'total': total,
                        'active': active,
                        'decayed': total - active,
                    })
                current_month = month_key
            
            total += 1
            if sat.is_active:
                active += 1
    
    # Add final month
    if current_month is not None:
        growth_data.append({
            'date': current_month,
            'total': total,
            'active': active,
            'decayed': total - active,
        })
    
    return jsonify({
        'constellation': slug,
        'name': constellation.name,
        'current_total': total,
        'current_active': active,
        'growth': growth_data
    })


@constellation_bp.route('/<slug>/update', methods=['POST'])
def update_constellation_tle(slug):
    """
    Trigger TLE update for a constellation from CelesTrak.
    """
    if slug not in Config.CONSTELLATIONS:
        return jsonify({'error': 'Constellation not found'}), 404
    
    try:
        new_count, updated_count = tle_service.update_constellation_tle(slug)
        return jsonify({
            'status': 'success',
            'constellation': slug,
            'new_satellites': new_count,
            'updated_satellites': updated_count,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@constellation_bp.route('/update-all', methods=['POST'])
def update_all_constellations():
    """
    Trigger TLE update for all configured constellations.
    This may take a while for large constellations like Starlink.
    """
    try:
        results = tle_service.update_all_constellations()
        return jsonify({
            'status': 'success',
            'results': {
                slug: {'new': new, 'updated': updated}
                for slug, (new, updated) in results.items()
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@constellation_bp.route('/<slug>/sync-external', methods=['POST'])
def sync_external_satellites(slug):
    """
    Sync satellite data from external API (api2.satellitemap.space).
    This provides more up-to-date satellite catalog than CelesTrak.
    Note: TLE data still needs to be fetched separately.
    """
    import requests
    
    # Map internal slugs to external constellation names (comprehensive list)
    slug_map = {
        # Internet constellations
        'starlink': 'starlink',
        'oneweb': 'oneweb',
        'kuiper': 'kuiper',
        'telesat': 'telesat',
        
        # Chinese constellations
        'qianfan': 'qianfan',
        'guowang': 'guowang',
        'galaxyspace': 'galaxyspace',
        'espace': 'espace',
        'jilin': 'jilin-1',
        'tianqi': 'tianqi',
        'yaogan': 'yaogan',
        
        # Navigation
        'gps': 'gps',
        'glonass': 'glonass',
        'galileo': 'galileo',
        'beidou': 'beidou',
        
        # Cellular/Communications
        'iridium': 'iridium',
        'globalstar': 'globalstar',
        'bluewalker': 'bluewalker',
        'lynk': 'lynk',
        
        # IoT
        'orbcomm': 'orbcomm',
        'geespace': 'geespace',
        
        # Earth Observation
        'planet': 'planet',
        'spire': 'spire',
        'swarm': 'swarm',
        'satelog': 'satelog',
        
        # GEO
        'intelsat': 'intelsat',
        'ses': 'ses',
    }
    
    external_constellation = slug_map.get(slug)
    if not external_constellation:
        return jsonify({'error': f'External sync not supported for {slug}'}), 400
    
    try:
        # Fetch from external API
        external_url = f"https://api2.satellitemap.space/satellites?constellation={external_constellation}&status=active"
        response = requests.get(external_url, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success') or not data.get('data'):
            return jsonify({'error': 'External API returned no data'}), 500
        
        external_satellites = data['data']
        
        # Get or create constellation
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            if slug in Config.CONSTELLATIONS:
                config = Config.CONSTELLATIONS[slug]
                constellation = Constellation(
                    name=config['name'],
                    slug=slug,
                    description=config['description'],
                    color=config['color'],
                )
                db.session.add(constellation)
                db.session.flush()
            else:
                return jsonify({'error': 'Constellation not configured'}), 404
        
        new_count = 0
        for ext_sat in external_satellites:
            norad_id = ext_sat.get('norad_id')
            if not norad_id:
                continue
            
            # Check if satellite exists
            existing = Satellite.query.filter_by(norad_id=norad_id).first()
            if not existing:
                # Create new satellite (without TLE - will be populated later)
                new_sat = Satellite(
                    norad_id=norad_id,
                    name=ext_sat.get('sat_name', f'Unknown-{norad_id}'),
                    constellation_id=constellation.id,
                    intl_designator=ext_sat.get('intldes', '').strip() if ext_sat.get('intldes') else None,
                    is_active=ext_sat.get('status') == 'active',
                )
                db.session.add(new_sat)
                new_count += 1
        
        # Update constellation count
        constellation.satellite_count = Satellite.query.filter_by(
            constellation_id=constellation.id
        ).count()
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'constellation': slug,
            'external_count': len(external_satellites),
            'new_satellites': new_count,
            'total_satellites': constellation.satellite_count,
        })
        
    except requests.RequestException as e:
        return jsonify({'error': f'Failed to fetch external data: {str(e)}'}), 500
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@constellation_bp.route('/<slug>/fetch-tle-external', methods=['POST'])
def fetch_tle_from_external(slug):
    """
    Fetch TLE data from external API for satellites that don't have TLE yet.
    """
    import requests
    
    constellation = Constellation.query.filter_by(slug=slug).first()
    if not constellation:
        return jsonify({'error': 'Constellation not found'}), 404
    
    # Get satellites without TLE
    satellites_without_tle = Satellite.query.filter_by(
        constellation_id=constellation.id
    ).filter(Satellite.tle_line1.is_(None)).all()
    
    if not satellites_without_tle:
        return jsonify({
            'status': 'success',
            'message': 'All satellites have TLE data',
            'updated': 0
        })
    
    # Collect NORAD IDs
    norad_ids = [sat.norad_id for sat in satellites_without_tle]
    
    try:
        # Fetch TLE from external API
        external_url = "https://api2.satellitemap.space/tle"
        response = requests.post(
            external_url,
            json={'norad_ids': norad_ids},
            timeout=60
        )
        response.raise_for_status()
        tle_data = response.json()
        
        updated_count = 0
        for sat in satellites_without_tle:
            sat_tle = tle_data.get(str(sat.norad_id))
            if sat_tle and 'line1' in sat_tle and 'line2' in sat_tle:
                sat.tle_line1 = sat_tle['line1']
                sat.tle_line2 = sat_tle['line2']
                sat.tle_updated_at = datetime.utcnow()
                
                # Parse orbital parameters from TLE
                try:
                    line2 = sat_tle['line2']
                    sat.inclination = float(line2[8:16].strip())
                    sat.eccentricity = float('0.' + line2[26:33].strip())
                    sat.mean_motion = float(line2[52:63].strip())
                    sat.period_minutes = 1440.0 / sat.mean_motion
                except (ValueError, IndexError):
                    pass
                
                updated_count += 1
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'requested': len(norad_ids),
            'updated': updated_count,
        })
        
    except requests.RequestException as e:
        return jsonify({'error': f'Failed to fetch TLE: {str(e)}'}), 500
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
