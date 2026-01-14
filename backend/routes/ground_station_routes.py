"""
API routes for ground station data.
"""
import requests
from flask import Blueprint, jsonify, request
from models import db, GroundStation, Constellation

ground_station_bp = Blueprint('ground_stations', __name__, url_prefix='/api/ground-stations')

# External API for ground station data
SATELLITEMAP_API = 'https://api2.satellitemap.space/api/ground-stations'


@ground_station_bp.route('', methods=['GET'])
def get_ground_stations():
    """
    Get all ground stations with optional filtering.
    
    Query parameters:
    - constellation: Filter by constellation slug
    - country: Filter by country
    - type: Filter by station type
    """
    constellation_slug = request.args.get('constellation')
    country = request.args.get('country')
    station_type = request.args.get('type')
    
    query = GroundStation.query.filter_by(is_active=True)
    
    if constellation_slug:
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if constellation:
            query = query.filter_by(constellation_id=constellation.id)
    
    if country:
        query = query.filter(GroundStation.country.ilike(f'%{country}%'))
    
    if station_type:
        query = query.filter_by(station_type=station_type)
    
    stations = query.all()
    
    return jsonify({
        'count': len(stations),
        'stations': [station.to_dict() for station in stations]
    })


@ground_station_bp.route('/<int:station_id>', methods=['GET'])
def get_ground_station(station_id):
    """
    Get a specific ground station by ID.
    """
    station = GroundStation.query.get(station_id)
    
    if not station:
        return jsonify({'error': 'Ground station not found'}), 404
    
    data = station.to_dict()
    
    # Include constellation info if available
    if station.constellation:
        data['constellation'] = {
            'id': station.constellation.id,
            'name': station.constellation.name,
            'slug': station.constellation.slug,
        }
    
    return jsonify(data)


@ground_station_bp.route('', methods=['POST'])
def create_ground_station():
    """
    Create a new ground station.
    
    Request body:
    - name: Station name (required)
    - latitude: Latitude in degrees (required)
    - longitude: Longitude in degrees (required)
    - constellation_slug: Associated constellation slug
    - altitude_m: Altitude in meters
    - station_type: Type of station
    - country: Country
    - city: City
    - operator: Operator name
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    
    required_fields = ['name', 'latitude', 'longitude']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400
    
    # Find constellation if specified
    constellation_id = None
    if 'constellation_slug' in data:
        constellation = Constellation.query.filter_by(slug=data['constellation_slug']).first()
        if constellation:
            constellation_id = constellation.id
    
    station = GroundStation(
        name=data['name'],
        latitude=data['latitude'],
        longitude=data['longitude'],
        constellation_id=constellation_id,
        altitude_m=data.get('altitude_m', 0),
        station_type=data.get('station_type'),
        country=data.get('country'),
        city=data.get('city'),
        operator=data.get('operator'),
    )
    
    db.session.add(station)
    db.session.commit()
    
    return jsonify(station.to_dict()), 201


@ground_station_bp.route('/<int:station_id>', methods=['PUT'])
def update_ground_station(station_id):
    """
    Update a ground station.
    """
    station = GroundStation.query.get(station_id)
    
    if not station:
        return jsonify({'error': 'Ground station not found'}), 404
    
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    
    # Update fields
    if 'name' in data:
        station.name = data['name']
    if 'latitude' in data:
        station.latitude = data['latitude']
    if 'longitude' in data:
        station.longitude = data['longitude']
    if 'altitude_m' in data:
        station.altitude_m = data['altitude_m']
    if 'station_type' in data:
        station.station_type = data['station_type']
    if 'country' in data:
        station.country = data['country']
    if 'city' in data:
        station.city = data['city']
    if 'operator' in data:
        station.operator = data['operator']
    if 'is_active' in data:
        station.is_active = data['is_active']
    
    if 'constellation_slug' in data:
        constellation = Constellation.query.filter_by(slug=data['constellation_slug']).first()
        station.constellation_id = constellation.id if constellation else None
    
    db.session.commit()
    
    return jsonify(station.to_dict())


@ground_station_bp.route('/<int:station_id>', methods=['DELETE'])
def delete_ground_station(station_id):
    """
    Delete a ground station.
    """
    station = GroundStation.query.get(station_id)
    
    if not station:
        return jsonify({'error': 'Ground station not found'}), 404
    
    db.session.delete(station)
    db.session.commit()
    
    return jsonify({'status': 'deleted', 'id': station_id})


@ground_station_bp.route('/seed-starlink', methods=['POST'])
def seed_starlink_ground_stations():
    """
    Seed database with known Starlink ground station locations.
    """
    # Known Starlink ground station locations (approximate)
    starlink_stations = [
        {'name': 'Starlink Gateway - Merrillan', 'latitude': 44.44, 'longitude': -90.83, 'country': 'USA', 'city': 'Merrillan, WI'},
        {'name': 'Starlink Gateway - Greenville', 'latitude': 34.85, 'longitude': -82.39, 'country': 'USA', 'city': 'Greenville, SC'},
        {'name': 'Starlink Gateway - Conrad', 'latitude': 48.17, 'longitude': -111.94, 'country': 'USA', 'city': 'Conrad, MT'},
        {'name': 'Starlink Gateway - Hawthorne', 'latitude': 33.92, 'longitude': -118.33, 'country': 'USA', 'city': 'Hawthorne, CA'},
        {'name': 'Starlink Gateway - Boca Chica', 'latitude': 25.99, 'longitude': -97.15, 'country': 'USA', 'city': 'Boca Chica, TX'},
        {'name': 'Starlink Gateway - North Bend', 'latitude': 43.41, 'longitude': -124.24, 'country': 'USA', 'city': 'North Bend, OR'},
        {'name': 'Starlink Gateway - Redmond', 'latitude': 47.67, 'longitude': -122.12, 'country': 'USA', 'city': 'Redmond, WA'},
        {'name': 'Starlink Gateway - Gravelly Point', 'latitude': 61.10, 'longitude': -146.35, 'country': 'USA', 'city': 'Gravelly Point, AK'},
        {'name': 'Starlink Gateway - Villenave', 'latitude': 44.78, 'longitude': -0.56, 'country': 'France', 'city': 'Villenave-d\'Ornon'},
        {'name': 'Starlink Gateway - Warkworth', 'latitude': -36.43, 'longitude': 174.66, 'country': 'New Zealand', 'city': 'Warkworth'},
        {'name': 'Starlink Gateway - Punta Arenas', 'latitude': -53.16, 'longitude': -70.91, 'country': 'Chile', 'city': 'Punta Arenas'},
        {'name': 'Starlink Gateway - Puebla', 'latitude': 19.04, 'longitude': -98.21, 'country': 'Mexico', 'city': 'Puebla'},
        {'name': 'Starlink Gateway - Adelaide', 'latitude': -34.93, 'longitude': 138.60, 'country': 'Australia', 'city': 'Adelaide'},
    ]
    
    # Get or create Starlink constellation
    constellation = Constellation.query.filter_by(slug='starlink').first()
    
    added = 0
    for station_data in starlink_stations:
        # Check if station already exists
        existing = GroundStation.query.filter_by(
            name=station_data['name']
        ).first()
        
        if not existing:
            station = GroundStation(
                name=station_data['name'],
                latitude=station_data['latitude'],
                longitude=station_data['longitude'],
                country=station_data['country'],
                city=station_data['city'],
                station_type='gateway',
                operator='SpaceX',
                constellation_id=constellation.id if constellation else None,
            )
            db.session.add(station)
            added += 1
    
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'stations_added': added,
        'total_stations': GroundStation.query.count()
    })


@ground_station_bp.route('/fetch-external', methods=['POST'])
def fetch_external_ground_stations():
    """
    Fetch ground stations from satellitemap.space API and store locally.
    """
    try:
        limit = request.args.get('limit', 500, type=int)
        response = requests.get(f'{SATELLITEMAP_API}?limit={limit}', timeout=30)
        response.raise_for_status()
        
        external_stations = response.json()
        
        # Get Starlink constellation for association
        starlink = Constellation.query.filter_by(slug='starlink').first()
        
        added = 0
        updated = 0
        
        for ext_station in external_stations:
            # Check if station exists by name or coordinates
            existing = GroundStation.query.filter(
                db.or_(
                    GroundStation.name == ext_station.get('name'),
                    db.and_(
                        db.func.abs(GroundStation.latitude - ext_station.get('lat', 0)) < 0.01,
                        db.func.abs(GroundStation.longitude - ext_station.get('lon', 0)) < 0.01
                    )
                )
            ).first()
            
            if existing:
                # Update existing station
                existing.name = ext_station.get('name', existing.name)
                existing.latitude = ext_station.get('lat', existing.latitude)
                existing.longitude = ext_station.get('lon', existing.longitude)
                existing.country = ext_station.get('country', existing.country)
                existing.city = ext_station.get('city', existing.city)
                existing.station_type = ext_station.get('type', 'gateway')
                updated += 1
            else:
                # Create new station
                station = GroundStation(
                    name=ext_station.get('name', f"Station_{ext_station.get('id', 'unknown')}"),
                    latitude=ext_station.get('lat', 0),
                    longitude=ext_station.get('lon', 0),
                    country=ext_station.get('country'),
                    city=ext_station.get('city'),
                    station_type=ext_station.get('type', 'gateway'),
                    operator=ext_station.get('operator', 'SpaceX'),
                    constellation_id=starlink.id if starlink else None,
                )
                db.session.add(station)
                added += 1
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'stations_added': added,
            'stations_updated': updated,
            'total_fetched': len(external_stations),
            'total_in_db': GroundStation.query.count()
        })
        
    except requests.RequestException as e:
        return jsonify({
            'error': f'Failed to fetch from external API: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'error': f'Error processing ground stations: {str(e)}'
        }), 500


@ground_station_bp.route('/proxy', methods=['GET'])
def proxy_ground_stations():
    """
    Proxy ground stations directly from satellitemap.space API.
    This allows frontend to get live data without CORS issues.
    """
    try:
        limit = request.args.get('limit', 500, type=int)
        response = requests.get(f'{SATELLITEMAP_API}?limit={limit}', timeout=30)
        response.raise_for_status()
        
        stations = response.json()
        
        # Transform to our format
        formatted_stations = []
        for station in stations:
            formatted_stations.append({
                'id': station.get('id'),
                'name': station.get('name', f"Station {station.get('id', '')}"),
                'latitude': station.get('lat', 0),
                'longitude': station.get('lon', 0),
                'country': station.get('country'),
                'city': station.get('city'),
                'station_type': station.get('type', 'gateway'),
                'operator': station.get('operator', 'SpaceX'),
                'status': station.get('status', 'active'),
            })
        
        return jsonify({
            'count': len(formatted_stations),
            'stations': formatted_stations,
            'source': 'satellitemap.space'
        })
        
    except requests.RequestException as e:
        # Fallback to local database
        stations = GroundStation.query.filter_by(is_active=True).all()
        return jsonify({
            'count': len(stations),
            'stations': [s.to_dict() for s in stations],
            'source': 'local',
            'warning': f'External API unavailable: {str(e)}'
        })
