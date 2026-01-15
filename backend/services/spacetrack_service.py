"""
Space-Track.org API Service
Handles authentication and data fetching from Space-Track.org
"""
import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from config import Config


class SpaceTrackService:
    """
    Service for interacting with Space-Track.org API.
    Documentation: https://www.space-track.org/documentation
    
    API USAGE POLICY (MUST COMPLY):
    - GP (TLEs): 1 query per hour max
    - GP_HISTORY: Once per lifetime - download and store locally
    - SATCAT: 1 query per day after 1700 UTC
    - Rate limit: 30 requests/minute, 300 requests/hour
    - Do NOT schedule at :00 or :30 (peak times)
    - Use comma-delimited lists instead of individual queries
    """
    
    BASE_URL = "https://www.space-track.org"
    LOGIN_URL = f"{BASE_URL}/ajaxauth/login"
    
    # Rate limiting constants from documentation
    MAX_REQUESTS_PER_MINUTE = 25  # Stay under 30 limit
    MAX_REQUESTS_PER_HOUR = 280   # Stay under 300 limit
    GP_QUERY_INTERVAL = 3600     # 1 hour between same GP queries
    SATCAT_QUERY_INTERVAL = 86400  # 1 day between SATCAT queries
    GP_HISTORY_ONCE = True       # Download history once, store locally
    
    # Default credentials (should be set via environment variables in production)
    DEFAULT_USERNAME = "changshuo@bupt.edu.cn"
    DEFAULT_PASSWORD = "Heitong1234...."
    
    def __init__(self, username: str = None, password: str = None):
        # Load account pool
        self.accounts = getattr(Config, 'SPACETRACK_ACCOUNTS', [])
        
        # Backward compatibility / specific override
        if username and password:
            self.accounts = [{'username': username, 'password': password}]
        elif not self.accounts:
            # Fallback to single legacy config
            u = getattr(Config, 'SPACETRACK_USERNAME', self.DEFAULT_USERNAME)
            p = getattr(Config, 'SPACETRACK_PASSWORD', self.DEFAULT_PASSWORD)
            self.accounts = [{'username': u, 'password': p}]
            
        self.current_account_index = 0
        self._set_current_credentials()
        
        self.session = requests.Session()
        self._authenticated = False

    def _set_current_credentials(self):
        """Set current username/password based on index."""
        if self.accounts:
            acc = self.accounts[self.current_account_index]
            self.username = acc['username']
            self.password = acc['password']

    def rotate_account(self) -> bool:
        """Switch to the next available account in the pool."""
        if len(self.accounts) <= 1:
            print("[SpaceTrack] No other accounts available to rotate.")
            return False
            
        prev_user = self.username
        self.current_account_index = (self.current_account_index + 1) % len(self.accounts)
        self._set_current_credentials()
        self._authenticated = False
        
        # Reset session cookies to clear any bans/flags
        self.session = requests.Session()
        
        print(f"[SpaceTrack] Rotating account from {prev_user} to {self.username}")
        return True
    
    def authenticate(self) -> bool:
        """Authenticate with Space-Track.org, rotating accounts on failure."""
        attempts = len(self.accounts)
        
        while attempts > 0:
            try:
                print(f"[SpaceTrack] Authenticating as {self.username}...")
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
                    print(f"[SpaceTrack] Authentication successful ({self.username})")
                    return True
                else:
                    print(f"[SpaceTrack] Authentication failed for {self.username}: {response.text[:200]}")
                    if not self.rotate_account():
                        return False
                    attempts -= 1
                    
            except requests.RequestException as e:
                print(f"[SpaceTrack] Authentication network error: {e}")
                # Network error might not be account related, but we can try next anyway
                if not self.rotate_account():
                    return False
                attempts -= 1
                
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

    def get_bulk_history(self, norad_ids: List[int], start_date: datetime, end_date: datetime = None) -> List[Dict]:
        """
        Fetch historical TLE data for a list of NORAD IDs within a time range.
        
        IMPORTANT: Per Space-Track documentation, GP_HISTORY should only be downloaded ONCE
        per satellite and stored locally. Do NOT re-download the same history!
        
        This method uses gp_history class which is more appropriate for bulk historical data.
        It handles chunking to respect URL length limits and includes proper throttling.
        
        Args:
            norad_ids: List of satellite catalog numbers
            start_date: Start of the history range
            end_date: End of the history range (default: now)
            
        Returns:
            List of TLE dictionaries (GP format)
        """
        self._ensure_authenticated()
        
        if not end_date:
            end_date = datetime.utcnow()
            
        results = []
        # Use larger chunks for efficiency - Space-Track allows comma-delimited lists
        # But balance with URL length limits (~4000 chars)
        CHUNK_SIZE = 100  # ~100 NORAD IDs per request is reasonable
        
        # Format dates for Space-Track query (YYYY-MM-DD)
        date_range = f"{start_date.strftime('%Y-%m-%d')}--{end_date.strftime('%Y-%m-%d')}"
        
        print(f"[SpaceTrack] Fetching history for {len(norad_ids)} satellites from {start_date.date()} to {end_date.date()}")
        print(f"[SpaceTrack] NOTE: Per policy, history should be stored locally and not re-downloaded")
        
        total_chunks = (len(norad_ids) - 1) // CHUNK_SIZE + 1
        
        for i in range(0, len(norad_ids), CHUNK_SIZE):
            chunk = norad_ids[i:i + CHUNK_SIZE]
            id_list = ",".join(map(str, chunk))
            chunk_num = i // CHUNK_SIZE + 1
            
            # Use gp_history class for historical data (per documentation)
            # Note: gp_history is the correct class for bulk historical TLE download
            query_url = (
                f"{self.BASE_URL}/basicspacedata/query/class/gp_history/"
                f"NORAD_CAT_ID/{id_list}/"
                f"EPOCH/{date_range}/"
                f"orderby/EPOCH asc/format/json"
            )
            
            try:
                print(f"[SpaceTrack] Querying chunk {chunk_num}/{total_chunks} ({len(chunk)} satellites)...")
                response = self.session.get(query_url, timeout=120)
                
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        results.extend(data)
                        print(f"[SpaceTrack] Chunk {chunk_num}: received {len(data)} records")
                    # Throttle between chunks - stay well under 30/minute limit
                    # With 100 IDs per chunk, we want ~3 seconds between requests
                    time.sleep(3)
                elif response.status_code == 429:
                    print("[SpaceTrack] Rate limit hit! Waiting 90s before retry...")
                    time.sleep(90)
                    # Retry this chunk once
                    response = self.session.get(query_url, timeout=120)
                    if response.status_code == 200:
                        data = response.json()
                        if data:
                            results.extend(data)
                elif response.status_code in (401, 403):
                    print(f"[SpaceTrack] Auth error {response.status_code}, rotating account...")
                    if self.rotate_account():
                        self._ensure_authenticated()
                        # Retry with new account
                        response = self.session.get(query_url, timeout=120)
                        if response.status_code == 200:
                            data = response.json()
                            if data:
                                results.extend(data)
                else:
                    print(f"[SpaceTrack] Error: {response.status_code} - {response.text[:200]}")
                    
            except requests.RequestException as e:
                print(f"[SpaceTrack] Request failed: {e}")
                time.sleep(5)  # Brief pause before next chunk
                
        print(f"[SpaceTrack] History fetch complete: {len(results)} total records")
        return results
    
    def get_satcat_data(self, norad_ids: List[int]) -> List[Dict]:
        """
        Fetch SATCAT data for specific NORAD IDs.
        Useful for getting launch details (Site, Date, Mission).
        """
        self._ensure_authenticated()
        
        results = []
        CHUNK_SIZE = 100
        
        print(f"[SpaceTrack] Fetching SATCAT for {len(norad_ids)} satellites")
        
        import time
        for i in range(0, len(norad_ids), CHUNK_SIZE):
            chunk = norad_ids[i:i + CHUNK_SIZE]
            id_list = ",".join(map(str, chunk))
            
            # Query satcat by NORAD_CAT_ID
            url = f"{self.BASE_URL}/basicspacedata/query/class/satcat/NORAD_CAT_ID/{id_list}/format/json"
            
            try:
                response = self.session.get(url, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    results.extend(data)
                    time.sleep(1) # Polite throttle
                elif response.status_code == 429:
                    print("[SpaceTrack] Rate limit hit! Sleeping...")
                    time.sleep(30)
                else:
                    print(f"[SpaceTrack] SATCAT error: {response.status_code}")
            except Exception as e:
                print(f"[SpaceTrack] SATCAT request failed: {e}")
                
        return results

    def query_satcat(self, query: str) -> List[Dict]:
        """
        Query SATCAT by arbitrary filter (e.g. OBJECT_NAME~~STARLINK).
        Returns ALL matching objects (active and decayed).
        
        IMPORTANT: Per Space-Track documentation, SATCAT should only be queried
        once per day after 1700 UTC. Data should be stored locally.
        """
        self._ensure_authenticated()
        try:
            # Query satcat with the provided filter
            # Using format/json/orderby/LAUNCH desc
            url = f"{self.BASE_URL}/basicspacedata/query/class/satcat/{query}/orderby/LAUNCH%20desc/format/json"
            print(f"[SpaceTrack] Querying SATCAT (once/day limit): {query}")
            
            response = self.session.get(url, timeout=120)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    print(f"[SpaceTrack] SATCAT returned {len(data)} records")
                    return data
                elif isinstance(data, dict) and 'error' in str(data).lower():
                    print(f"[SpaceTrack] SATCAT query error in response: {data}")
                    return []
                return data or []
            elif response.status_code == 429:
                print("[SpaceTrack] Rate limit hit on SATCAT query - try again after 1700 UTC")
                return []
            elif response.status_code in (401, 403):
                print(f"[SpaceTrack] Auth error {response.status_code} on SATCAT, rotating account...")
                if self.rotate_account():
                    self._ensure_authenticated()
                    # Retry with new account
                    response = self.session.get(url, timeout=120)
                    if response.status_code == 200:
                        return response.json() or []
                return []
            else:
                print(f"[SpaceTrack] SATCAT query error: {response.status_code} - {response.text[:200]}")
                return []
        except requests.RequestException as e:
            print(f"[SpaceTrack] SATCAT query failed: {e}")
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
