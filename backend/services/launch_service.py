"""
Launch Data Service

Handles fetching and enriching satellite launch data.
Primary source: Space-Track SATCAT
Secondary source: Launch Library 2 API (for additional details)
"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from threading import Lock

from models import db, Launch, Satellite, Constellation
from config import Config


class LaunchService:
    """
    Service for managing satellite launch data.
    
    Data sources:
    1. Space-Track SATCAT - Basic launch info (COSPAR, date, site)
    2. Launch Library 2 API - Detailed info (rocket, mission, video)
    """
    
    # Launch Library 2 API
    LL2_BASE_URL = Config.LAUNCH_LIBRARY_API_URL
    LL2_TIMEOUT = 30
    
    # Rate limiting for Launch Library (free tier: 15 requests/hour)
    LL2_RATE_LIMIT = 300  # 5 minutes between requests (conservative)
    
    def __init__(self):
        self._rate_limit_lock = Lock()
        self._last_ll2_request = 0
    
    def _check_ll2_rate_limit(self) -> bool:
        """Check if we can make a Launch Library request."""
        with self._rate_limit_lock:
            elapsed = time.time() - self._last_ll2_request
            return elapsed >= self.LL2_RATE_LIMIT
    
    def _update_ll2_rate_limit(self):
        """Update last request time."""
        with self._rate_limit_lock:
            self._last_ll2_request = time.time()
    
    def get_constellation_launches(self, slug: str, 
                                   include_details: bool = False) -> List[Dict]:
        """
        Get all launches for a constellation.
        
        Args:
            slug: Constellation slug
            include_details: Whether to include detailed info
        
        Returns:
            List of launch dictionaries
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
        
        # Get launches with satellites in this constellation
        launches = db.session.query(Launch)\
            .join(Satellite, Satellite.launch_id == Launch.id)\
            .filter(Satellite.constellation_id == constellation.id)\
            .distinct()\
            .order_by(Launch.launch_date.desc())\
            .all()
        
        result = []
        for launch in launches:
            # Count satellites from this constellation in this launch
            sat_count = Satellite.query.filter_by(
                launch_id=launch.id,
                constellation_id=constellation.id
            ).count()
            
            active_count = Satellite.query.filter_by(
                launch_id=launch.id,
                constellation_id=constellation.id,
                is_active=True
            ).count()
            
            data = launch.to_dict(include_details)
            data['satellite_count'] = sat_count
            data['active_count'] = active_count
            
            result.append(data)
        
        return result
    
    def get_launch_by_cospar(self, cospar_id: str) -> Optional[Dict]:
        """Get launch details by COSPAR ID."""
        launch = Launch.query.filter_by(cospar_id=cospar_id).first()
        if launch:
            return launch.to_dict(include_details=True)
        return None
    
    def get_recent_launches(self, days: int = 30) -> List[Dict]:
        """Get launches from the last N days."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        launches = Launch.query.filter(
            Launch.launch_date >= cutoff
        ).order_by(Launch.launch_date.desc()).all()
        
        return [l.to_dict() for l in launches]
    
    def enrich_launch_from_ll2(self, cospar_id: str) -> Optional[Dict]:
        """
        Enrich launch data from Launch Library 2 API.
        
        Args:
            cospar_id: COSPAR ID (e.g., "2024-012")
        
        Returns:
            Updated launch data or None if failed
        """
        if not self._check_ll2_rate_limit():
            print(f"[LaunchService] LL2 rate limited")
            return None
        
        launch = Launch.query.filter_by(cospar_id=cospar_id).first()
        if not launch:
            return None
        
        try:
            # Search for launch in LL2
            # Convert COSPAR to search format (e.g., "2024-012" -> "2024")
            year = cospar_id[:4] if len(cospar_id) >= 4 else None
            if not year:
                return None
            
            # Search by year and approximate date
            search_url = f"{self.LL2_BASE_URL}/launch/"
            params = {
                'year': year,
                'limit': 100,
                'mode': 'detailed'
            }
            
            if launch.launch_date:
                # Add date filter
                start = launch.launch_date - timedelta(days=1)
                end = launch.launch_date + timedelta(days=1)
                params['net__gte'] = start.strftime('%Y-%m-%d')
                params['net__lte'] = end.strftime('%Y-%m-%d')
            
            response = requests.get(search_url, params=params, timeout=self.LL2_TIMEOUT)
            self._update_ll2_rate_limit()
            
            if response.status_code != 200:
                print(f"[LaunchService] LL2 API error: {response.status_code}")
                return None
            
            data = response.json()
            results = data.get('results', [])
            
            # Find matching launch
            for ll2_launch in results:
                # Match by mission name or date
                if self._matches_launch(launch, ll2_launch):
                    self._update_launch_from_ll2(launch, ll2_launch)
                    db.session.commit()
                    return launch.to_dict(include_details=True)
            
            print(f"[LaunchService] No LL2 match found for {cospar_id}")
            return None
            
        except requests.RequestException as e:
            print(f"[LaunchService] LL2 request error: {e}")
            return None
        except Exception as e:
            print(f"[LaunchService] Error enriching launch: {e}")
            return None
    
    def _matches_launch(self, launch: Launch, ll2_data: Dict) -> bool:
        """Check if LL2 data matches our launch."""
        # Compare dates (within 1 day)
        if launch.launch_date and ll2_data.get('net'):
            try:
                ll2_date = datetime.fromisoformat(ll2_data['net'].replace('Z', '+00:00'))
                date_diff = abs((launch.launch_date - ll2_date.replace(tzinfo=None)).days)
                if date_diff <= 1:
                    return True
            except:
                pass
        
        # Compare mission names
        if launch.mission_name and ll2_data.get('name'):
            if launch.mission_name.lower() in ll2_data['name'].lower():
                return True
            if ll2_data['name'].lower() in launch.mission_name.lower():
                return True
        
        return False
    
    def _update_launch_from_ll2(self, launch: Launch, ll2_data: Dict):
        """Update launch record with LL2 data."""
        if ll2_data.get('name'):
            launch.mission_name = ll2_data['name']
        
        if ll2_data.get('mission', {}).get('description'):
            launch.mission_description = ll2_data['mission']['description']
        
        rocket = ll2_data.get('rocket', {}).get('configuration', {})
        if rocket.get('name'):
            launch.rocket_type = rocket['name']
        if rocket.get('family', {}).get('name'):
            launch.rocket_family = rocket['family']['name']
        
        pad = ll2_data.get('pad', {})
        if pad.get('name'):
            launch.launch_site_full = pad['name']
        if pad.get('location', {}).get('name'):
            launch.launch_site = pad['location']['name']
        
        if ll2_data.get('id'):
            launch.launch_library_id = str(ll2_data['id'])
        
        if ll2_data.get('vidURLs'):
            videos = ll2_data['vidURLs']
            if videos:
                launch.video_url = videos[0].get('url')
        
        if ll2_data.get('infographic'):
            launch.wiki_url = ll2_data['infographic']
        
        launch.data_source = 'LaunchLibrary2'
        launch.updated_at = datetime.utcnow()
    
    def get_launch_statistics(self, slug: str) -> Dict:
        """
        Get launch statistics for a constellation.
        
        Returns:
            Dict with launch counts by year, site, rocket, etc.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return {}
        
        # Get all launches for this constellation
        launches = db.session.query(Launch)\
            .join(Satellite, Satellite.launch_id == Launch.id)\
            .filter(Satellite.constellation_id == constellation.id)\
            .distinct().all()
        
        stats = {
            'total_launches': len(launches),
            'successful_launches': sum(1 for l in launches if l.launch_success),
            'by_year': {},
            'by_site': {},
            'by_rocket': {},
        }
        
        for launch in launches:
            # By year
            if launch.launch_date:
                year = launch.launch_date.year
                stats['by_year'][year] = stats['by_year'].get(year, 0) + 1
            
            # By site
            if launch.launch_site:
                site = launch.launch_site
                stats['by_site'][site] = stats['by_site'].get(site, 0) + 1
            
            # By rocket
            if launch.rocket_type:
                rocket = launch.rocket_type
                stats['by_rocket'][rocket] = stats['by_rocket'].get(rocket, 0) + 1
        
        return stats


# Singleton instance
launch_service = LaunchService()
