"""
Ground Station Data Service

Handles fetching and managing satellite ground station data.
Space-Track does NOT provide ground station data, so we use:
1. Community-maintained data sources
2. Local JSON configuration files

Primary sources:
- Starlink: starlinkstatus.space / community data
- OneWeb: Public documentation
- Other: Manual configuration
"""

import os
import json
import requests
from datetime import datetime
from typing import Dict, List, Optional
from threading import Lock

from models import db, GroundStation, Constellation
from config import Config


class GroundStationService:
    """
    Service for managing satellite ground station data.
    
    Since Space-Track doesn't provide ground station information,
    we rely on community data sources and local configuration.
    """
    
    # Data directory for local ground station files
    DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'ground_stations')
    
    # Community data sources
    STARLINK_STATIONS_SOURCES = [
        # Primary: GitHub community data
        "https://raw.githubusercontent.com/Starlink-Observer/ground-stations/main/stations.json",
        # Backup: Local file
        None  # Falls back to local data/ground_stations/starlink.json
    ]
    
    # Rate limiting
    SYNC_RATE_LIMIT = 86400  # 24 hours between syncs
    
    def __init__(self):
        self._rate_limit_lock = Lock()
        self._last_sync_time = {}
        
        # Ensure data directory exists
        os.makedirs(self.DATA_DIR, exist_ok=True)
    
    def _check_rate_limit(self, key: str) -> bool:
        """Check if we can sync."""
        with self._rate_limit_lock:
            import time
            last_time = self._last_sync_time.get(key, 0)
            return time.time() - last_time >= self.SYNC_RATE_LIMIT
    
    def _update_rate_limit(self, key: str):
        """Update last sync time."""
        with self._rate_limit_lock:
            import time
            self._last_sync_time[key] = time.time()
    
    def get_constellation_stations(self, slug: str) -> List[Dict]:
        """
        Get ground stations for a constellation.
        
        Args:
            slug: Constellation slug
        
        Returns:
            List of ground station dictionaries
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
        
        stations = GroundStation.query.filter_by(
            constellation_id=constellation.id,
            is_active=True
        ).all()
        
        return [s.to_dict() for s in stations]
    
    def get_station_count(self, slug: str) -> int:
        """Get count of ground stations for a constellation."""
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return 0
        
        return GroundStation.query.filter_by(
            constellation_id=constellation.id,
            is_active=True
        ).count()
    
    def get_all_stations(self) -> List[Dict]:
        """Get all ground stations."""
        stations = GroundStation.query.filter_by(is_active=True).all()
        return [s.to_dict() for s in stations]
    
    def sync_stations(self, slug: str) -> Dict:
        """
        Sync ground stations for a constellation from available sources.
        
        Args:
            slug: Constellation slug
        
        Returns:
            Sync result statistics
        """
        if not self._check_rate_limit(f"sync:{slug}"):
            return {'status': 'rate_limited'}
        
        result = {'status': 'ok', 'added': 0, 'updated': 0}
        
        # Load data based on constellation
        if slug == 'starlink':
            data = self._load_starlink_stations()
        elif slug == 'oneweb':
            data = self._load_oneweb_stations()
        else:
            data = self._load_local_stations(slug)
        
        if not data:
            result['status'] = 'no_data'
            return result
        
        # Get or create constellation
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            result['status'] = 'constellation_not_found'
            return result
        
        # Process stations
        for station_data in data:
            existing = GroundStation.query.filter_by(
                name=station_data.get('name'),
                constellation_id=constellation.id
            ).first()
            
            if existing:
                # Update
                self._update_station(existing, station_data)
                result['updated'] += 1
            else:
                # Create
                station = self._create_station(station_data, constellation.id)
                if station:
                    db.session.add(station)
                    result['added'] += 1
        
        db.session.commit()
        self._update_rate_limit(f"sync:{slug}")
        
        return result
    
    def _load_starlink_stations(self) -> List[Dict]:
        """Load Starlink ground station data."""
        # Try remote sources first
        for source_url in self.STARLINK_STATIONS_SOURCES:
            if source_url:
                try:
                    response = requests.get(source_url, timeout=30)
                    if response.status_code == 200:
                        data = response.json()
                        if isinstance(data, list):
                            return data
                        if isinstance(data, dict) and 'stations' in data:
                            return data['stations']
                except Exception as e:
                    print(f"[GroundStationService] Failed to fetch from {source_url}: {e}")
        
        # Fall back to local file
        return self._load_local_stations('starlink')
    
    def _load_oneweb_stations(self) -> List[Dict]:
        """Load OneWeb ground station data."""
        return self._load_local_stations('oneweb')
    
    def _load_local_stations(self, slug: str) -> List[Dict]:
        """Load ground stations from local JSON file."""
        filepath = os.path.join(self.DATA_DIR, f"{slug}.json")
        
        if not os.path.exists(filepath):
            print(f"[GroundStationService] No local data for {slug}")
            return []
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                if isinstance(data, dict) and 'stations' in data:
                    return data['stations']
                return []
        except Exception as e:
            print(f"[GroundStationService] Error loading {filepath}: {e}")
            return []
    
    def _create_station(self, data: Dict, constellation_id: int) -> Optional[GroundStation]:
        """Create a GroundStation from dictionary data."""
        try:
            return GroundStation(
                name=data.get('name', 'Unknown'),
                constellation_id=constellation_id,
                latitude=float(data.get('latitude', data.get('lat', 0))),
                longitude=float(data.get('longitude', data.get('lng', data.get('lon', 0)))),
                altitude_m=float(data.get('altitude_m', data.get('altitude', 0))),
                station_type=data.get('type', data.get('station_type', 'gateway')),
                country=data.get('country'),
                city=data.get('city'),
                operator=data.get('operator'),
                is_active=data.get('is_active', data.get('status') != 'inactive'),
            )
        except Exception as e:
            print(f"[GroundStationService] Error creating station: {e}")
            return None
    
    def _update_station(self, station: GroundStation, data: Dict):
        """Update a GroundStation with new data."""
        if data.get('latitude') or data.get('lat'):
            station.latitude = float(data.get('latitude', data.get('lat')))
        if data.get('longitude') or data.get('lng') or data.get('lon'):
            station.longitude = float(data.get('longitude', data.get('lng', data.get('lon'))))
        if data.get('altitude_m') or data.get('altitude'):
            station.altitude_m = float(data.get('altitude_m', data.get('altitude', 0)))
        if data.get('type') or data.get('station_type'):
            station.station_type = data.get('type', data.get('station_type'))
        if data.get('country'):
            station.country = data['country']
        if data.get('city'):
            station.city = data['city']
        if data.get('operator'):
            station.operator = data['operator']
        if 'is_active' in data or 'status' in data:
            station.is_active = data.get('is_active', data.get('status') != 'inactive')
        
        station.updated_at = datetime.utcnow()
    
    def add_station_manually(self, slug: str, station_data: Dict) -> Optional[Dict]:
        """
        Manually add a ground station.
        
        Args:
            slug: Constellation slug
            station_data: Station data dictionary
        
        Returns:
            Created station data or None
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return None
        
        # Check for duplicate
        existing = GroundStation.query.filter_by(
            name=station_data.get('name'),
            constellation_id=constellation.id
        ).first()
        
        if existing:
            return existing.to_dict()
        
        station = self._create_station(station_data, constellation.id)
        if station:
            db.session.add(station)
            db.session.commit()
            return station.to_dict()
        
        return None
    
    def save_local_stations(self, slug: str, stations: List[Dict]) -> bool:
        """
        Save ground stations to local JSON file.
        
        Args:
            slug: Constellation slug
            stations: List of station dictionaries
        
        Returns:
            True if successful
        """
        filepath = os.path.join(self.DATA_DIR, f"{slug}.json")
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({
                    'constellation': slug,
                    'updated_at': datetime.utcnow().isoformat(),
                    'stations': stations
                }, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[GroundStationService] Error saving to {filepath}: {e}")
            return False
    
    def get_station_statistics(self, slug: str) -> Dict:
        """
        Get ground station statistics for a constellation.
        
        Returns:
            Dict with station counts by country, type, etc.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return {}
        
        stations = GroundStation.query.filter_by(
            constellation_id=constellation.id
        ).all()
        
        stats = {
            'total': len(stations),
            'active': sum(1 for s in stations if s.is_active),
            'by_country': {},
            'by_type': {},
        }
        
        for station in stations:
            if station.country:
                stats['by_country'][station.country] = stats['by_country'].get(station.country, 0) + 1
            if station.station_type:
                stats['by_type'][station.station_type] = stats['by_type'].get(station.station_type, 0) + 1
        
        return stats


# Singleton instance
ground_station_service = GroundStationService()
