"""
Space-Track.org API Service
Handles authentication and data fetching from Space-Track.org
"""
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from config import Config


class SpaceTrackService:
    """
    Service for interacting with Space-Track.org API.
    Documentation: https://www.space-track.org/documentation
    """
    
    BASE_URL = "https://www.space-track.org"
    LOGIN_URL = f"{BASE_URL}/ajaxauth/login"
    
    # Default credentials (should be set via environment variables in production)
    DEFAULT_USERNAME = "changshuo@bupt.edu.cn"
    DEFAULT_PASSWORD = "Heitong1234...."
    
    def __init__(self, username: str = None, password: str = None):
        self.username = username or getattr(Config, 'SPACETRACK_USERNAME', self.DEFAULT_USERNAME)
        self.password = password or getattr(Config, 'SPACETRACK_PASSWORD', self.DEFAULT_PASSWORD)
        self.session = requests.Session()
        self._authenticated = False
    
    def authenticate(self) -> bool:
        """Authenticate with Space-Track.org."""
        try:
            response = self.session.post(
                self.LOGIN_URL,
                data={
                    'identity': self.username,
                    'password': self.password
                },
                timeout=30
            )
            
            if response.status_code == 200 and 'error' not in response.text.lower():
                self._authenticated = True
                print("[SpaceTrack] Authentication successful")
                return True
            else:
                print(f"[SpaceTrack] Authentication failed: {response.text[:200]}")
                return False
        except requests.RequestException as e:
            print(f"[SpaceTrack] Authentication error: {e}")
            return False
    
    def _ensure_authenticated(self):
        """Ensure we have a valid session."""
        if not self._authenticated:
            self.authenticate()
    
    def get_api_status(self) -> Dict[str, Any]:
        """
        Get Space-Track API status and health information.
        """
        self._ensure_authenticated()
        
        status = {
            'authenticated': self._authenticated,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'unknown',
            'message': '',
        }
        
        try:
            # Test the API with a simple query
            test_url = f"{self.BASE_URL}/basicspacedata/query/class/boxscore/format/json"
            response = self.session.get(test_url, timeout=10)
            
            if response.status_code == 200:
                status['status'] = 'online'
                status['message'] = 'Space-Track API is operational'
                try:
                    boxscore = response.json()
                    if boxscore:
                        status['boxscore'] = boxscore[0] if isinstance(boxscore, list) else boxscore
                except:
                    pass
            else:
                status['status'] = 'degraded'
                status['message'] = f'API returned status {response.status_code}'
                
        except requests.RequestException as e:
            status['status'] = 'offline'
            status['message'] = str(e)
        
        return status
    
    def get_recent_tle_updates(self, days: int = 1) -> Dict[str, Any]:
        """
        Get statistics about recent TLE updates.
        """
        self._ensure_authenticated()
        
        result = {
            'days': days,
            'timestamp': datetime.utcnow().isoformat(),
            'updates': [],
            'total_count': 0,
        }
        
        try:
            # Get decay data (TIP messages)
            decay_url = f"{self.BASE_URL}/basicspacedata/query/class/decay/DECAY_EPOCH/>now-{days}/orderby/DECAY_EPOCH%20desc/format/json"
            response = self.session.get(decay_url, timeout=30)
            
            if response.status_code == 200:
                decays = response.json()
                result['decays'] = decays[:20] if decays else []
                result['decay_count'] = len(decays) if decays else 0
                
        except requests.RequestException as e:
            result['error'] = str(e)
        
        return result
    
    def get_tip_messages(self, limit: int = 20) -> List[Dict]:
        """
        Get Tracking and Impact Prediction (TIP) messages.
        These are re-entry predictions.
        """
        self._ensure_authenticated()
        
        try:
            # TIP messages from decay class
            url = f"{self.BASE_URL}/basicspacedata/query/class/tip/format/json/limit/{limit}"
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 200:
                return response.json() or []
            return []
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching TIP messages: {e}")
            return []
    
    def get_latest_tle_by_norad(self, norad_ids: List[int]) -> List[Dict]:
        """
        Get latest TLE for specific NORAD IDs.
        """
        self._ensure_authenticated()
        
        if not norad_ids:
            return []
        
        try:
            norad_str = ','.join(map(str, norad_ids))
            url = f"{self.BASE_URL}/basicspacedata/query/class/tle_latest/NORAD_CAT_ID/{norad_str}/ORDINAL/1/format/json"
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 200:
                return response.json() or []
            return []
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching TLE: {e}")
            return []
    
    def get_tle_publish_stats(self, days: int = 21) -> List[Dict]:
        """
        Get TLE publication statistics for the last N days.
        """
        self._ensure_authenticated()
        
        stats = []
        
        try:
            # Get GP data publish counts per day
            url = f"{self.BASE_URL}/basicspacedata/query/class/gp_history/EPOCH/>now-{days}/format/json/limit/10000"
            response = self.session.get(url, timeout=60)
            
            if response.status_code == 200:
                data = response.json() or []
                
                # Group by date
                date_counts = {}
                for entry in data:
                    epoch = entry.get('EPOCH', '')[:10]  # Get date part
                    if epoch:
                        date_counts[epoch] = date_counts.get(epoch, 0) + 1
                
                # Convert to list sorted by date
                stats = [
                    {'date': date, 'count': count}
                    for date, count in sorted(date_counts.items())
                ]
                
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching publish stats: {e}")
        
        return stats
    
    def get_latest_launches(self, days: int = 30) -> List[Dict]:
        """
        Get satellites launched in the last N days.
        """
        self._ensure_authenticated()
        
        try:
            cutoff = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
            url = f"{self.BASE_URL}/basicspacedata/query/class/satcat/LAUNCH/>={cutoff}/orderby/LAUNCH%20desc/format/json"
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 200:
                return response.json() or []
            return []
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching launches: {e}")
            return []
    
    def get_announcements(self) -> List[Dict]:
        """
        Get Space-Track announcements.
        """
        self._ensure_authenticated()
        
        try:
            url = f"{self.BASE_URL}/basicspacedata/query/class/announcement/format/json/limit/5"
            response = self.session.get(url, timeout=15)
            
            if response.status_code == 200:
                return response.json() or []
            return []
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching announcements: {e}")
            return []
    
    def get_full_status(self) -> Dict[str, Any]:
        """
        Get comprehensive Space-Track status including all metrics.
        """
        status = self.get_api_status()
        
        if status['status'] == 'online':
            status['tip_messages'] = self.get_tip_messages(10)
            status['announcements'] = self.get_announcements()
            status['recent_launches'] = self.get_latest_launches(7)[:10]
            status['tle_stats'] = self.get_tle_publish_stats(21)
        
        return status
    
    def logout(self):
        """Logout and close session."""
        try:
            logout_url = f"{self.BASE_URL}/ajaxauth/logout"
            self.session.get(logout_url, timeout=10)
        except:
            pass
        finally:
            self._authenticated = False
            self.session.close()


# Singleton instance
spacetrack_service = SpaceTrackService()
