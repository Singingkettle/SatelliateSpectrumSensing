"""
Space-Track.org API Service

Handles authentication and data fetching from Space-Track.org
with multi-account pool management for rate limit compliance.

API Documentation: https://www.space-track.org/documentation

USAGE POLICY COMPLIANCE:
- GP (TLEs): 1 query per hour max for same constellation
- GP_HISTORY: Download once per satellite lifetime, store locally
- SATCAT: 1 query per day after 1700 UTC
- Rate limit: 30 requests/minute, 300 requests/hour
- Avoid scheduling at :00 or :30 (peak times)
"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from config import Config
from services.account_pool import (
    AccountPoolManager, 
    QueryType, 
    init_account_pool, 
    get_account_pool
)


class SpaceTrackError(Exception):
    """Base exception for Space-Track errors"""
    pass


class RateLimitError(SpaceTrackError):
    """Raised when rate limit is hit"""
    pass


class AuthenticationError(SpaceTrackError):
    """Raised when authentication fails"""
    pass


class NoAvailableAccountError(SpaceTrackError):
    """Raised when no accounts are available"""
    pass


class SpaceTrackService:
    """
    Service for interacting with Space-Track.org API.
    
    Uses multi-account pool for:
    - Automatic account rotation
    - Rate limit management
    - Failover handling
    """
    
    BASE_URL = "https://www.space-track.org"
    LOGIN_URL = f"{BASE_URL}/ajaxauth/login"
    LOGOUT_URL = f"{BASE_URL}/ajaxauth/logout"
    
    # Timeouts
    AUTH_TIMEOUT = 30
    QUERY_TIMEOUT = 120
    BULK_QUERY_TIMEOUT = 300
    
    def __init__(self):
        """Initialize the Space-Track service with account pool."""
        # Initialize account pool with configured accounts
        self.account_pool = init_account_pool(Config.SPACETRACK_ACCOUNTS)
        
        # Session cache per account
        self._sessions: Dict[str, requests.Session] = {}
        self._session_auth_time: Dict[str, datetime] = {}
        
        # Session expiry (re-auth after this time)
        self._session_max_age = timedelta(hours=1)
        
        print(f"[SpaceTrack] Initialized with {len(Config.SPACETRACK_ACCOUNTS)} accounts")
    
    def _get_session(self, username: str) -> requests.Session:
        """Get or create a session for an account."""
        if username not in self._sessions:
            self._sessions[username] = requests.Session()
        return self._sessions[username]
    
    def _is_session_valid(self, username: str) -> bool:
        """Check if a session is still valid."""
        if username not in self._session_auth_time:
            return False
        
        age = datetime.utcnow() - self._session_auth_time[username]
        return age < self._session_max_age
    
    def _authenticate(self, username: str, password: str) -> bool:
        """Authenticate with Space-Track using specific credentials."""
        session = self._get_session(username)
        
        try:
            response = session.post(
                self.LOGIN_URL,
                data={'identity': username, 'password': password},
                timeout=self.AUTH_TIMEOUT
            )
            
            if response.status_code == 200 and 'error' not in response.text.lower():
                self._session_auth_time[username] = datetime.utcnow()
                print(f"[SpaceTrack] Auth success: {username[:10]}***")
                return True
            else:
                print(f"[SpaceTrack] Auth failed for {username[:10]}***: {response.text[:100]}")
                return False
                
        except requests.RequestException as e:
            print(f"[SpaceTrack] Auth error: {e}")
            return False
    
    def _ensure_authenticated(self, username: str, password: str) -> bool:
        """Ensure we have a valid authenticated session."""
        if self._is_session_valid(username):
            return True
        return self._authenticate(username, password)
    
    def _execute_query(self, url: str, query_type: QueryType = QueryType.OTHER,
                      constellation: str = None, timeout: int = None) -> Optional[Any]:
        """
        Execute a query with automatic account rotation and retry.
        
        Args:
            url: Full URL to query
            query_type: Type of query for rate limit tracking
            constellation: Constellation slug for tracking
            timeout: Request timeout
        
        Returns:
            Response data (JSON) or None on failure
        """
        timeout = timeout or self.QUERY_TIMEOUT
        max_retries = min(3, len(Config.SPACETRACK_ACCOUNTS))
        
        for attempt in range(max_retries):
            # Get available account
            account = self.account_pool.get_available_account(query_type, constellation)
            
            if not account:
                # Wait for an account to become available
                print(f"[SpaceTrack] No accounts available, waiting...")
                account = self.account_pool.wait_for_available_account(
                    timeout=120, 
                    query_type=query_type, 
                    constellation=constellation
                )
                if not account:
                    raise NoAvailableAccountError("All accounts exhausted or in cooldown")
            
            username = account['username']
            password = account['password']
            
            try:
                # Ensure authenticated
                if not self._ensure_authenticated(username, password):
                    self.account_pool.mark_auth_failed(username, "Authentication failed")
                    continue
                
                # Execute query
                session = self._get_session(username)
                response = session.get(url, timeout=timeout)
                
                if response.status_code == 200:
                    # Record successful request
                    self.account_pool.record_request(username, query_type, constellation, True)
                    
                    try:
                        return response.json()
                    except ValueError:
                        # Return raw text for TLE format
                        return response.text
                
                elif response.status_code == 429:
                    # Rate limited
                    print(f"[SpaceTrack] Rate limited (429) on {username[:10]}***")
                    self.account_pool.mark_rate_limited(username)
                    time.sleep(2)
                    continue
                
                elif response.status_code in (401, 403):
                    # Auth issue
                    print(f"[SpaceTrack] Auth error ({response.status_code}) on {username[:10]}***")
                    self.account_pool.mark_auth_failed(username, f"HTTP {response.status_code}")
                    # Clear session to force re-auth
                    if username in self._session_auth_time:
                        del self._session_auth_time[username]
                    continue
                
                else:
                    # Other error
                    print(f"[SpaceTrack] Error {response.status_code}: {response.text[:200]}")
                    self.account_pool.mark_error(username, f"HTTP {response.status_code}")
                    
            except requests.Timeout:
                print(f"[SpaceTrack] Timeout on {username[:10]}***")
                self.account_pool.mark_error(username, "Timeout")
                
            except requests.RequestException as e:
                print(f"[SpaceTrack] Request error: {e}")
                self.account_pool.mark_error(username, str(e))
        
        return None
    
    # ==================== API Methods ====================
    
    def get_api_status(self) -> Dict[str, Any]:
        """Get Space-Track API status and health information."""
        status = {
            'authenticated': False,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'unknown',
            'message': '',
            'account_pool': self.account_pool.get_pool_status(),
        }
        
        try:
            url = f"{self.BASE_URL}/basicspacedata/query/class/boxscore/format/json"
            data = self._execute_query(url, QueryType.OTHER)
            
            if data:
                status['authenticated'] = True
                status['status'] = 'online'
                status['message'] = 'Space-Track API is operational'
                if isinstance(data, list) and data:
                    status['boxscore'] = data[0]
            else:
                status['status'] = 'error'
                status['message'] = 'Failed to query API'
                
        except Exception as e:
            status['status'] = 'offline'
            status['message'] = str(e)
        
        return status
    
    def get_gp_data(self, query_filter: str, constellation: str = None) -> List[Dict]:
        """
        Get General Perturbations (GP/TLE) data.
        
        Args:
            query_filter: Space-Track query filter (e.g., "OBJECT_NAME~~STARLINK")
            constellation: Constellation slug for rate limit tracking
        
        Returns:
            List of GP data dictionaries
        """
        # Build URL for GP class (latest TLEs)
        # Add DECAY_DATE/null-val to get only active satellites
        # Add epoch/>now-30 to get recent data
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"DECAY_DATE/null-val/"
            f"{query_filter}/"
            f"orderby/NORAD_CAT_ID asc/"
            f"format/json"
        )
        
        print(f"[SpaceTrack] Querying GP data: {query_filter}")
        data = self._execute_query(url, QueryType.GP, constellation)
        
        if isinstance(data, list):
            print(f"[SpaceTrack] GP query returned {len(data)} records")
            return data
        return []
    
    def get_gp_data_tle_format(self, query_filter: str, constellation: str = None) -> str:
        """
        Get GP data in TLE format (3-line).
        
        Returns:
            TLE text data
        """
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"DECAY_DATE/null-val/"
            f"{query_filter}/"
            f"orderby/NORAD_CAT_ID asc/"
            f"format/tle"
        )
        
        data = self._execute_query(url, QueryType.GP, constellation)
        return data if isinstance(data, str) else ""
    
    def query_satcat(self, query_filter: str, constellation: str = None) -> List[Dict]:
        """
        Query SATCAT (Satellite Catalog) for satellite metadata.
        
        IMPORTANT: SATCAT should only be queried once per day after 1700 UTC.
        
        Args:
            query_filter: Space-Track query filter
            constellation: Constellation slug for rate limit tracking
        
        Returns:
            List of SATCAT records
        """
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/satcat/"
            f"{query_filter}/"
            f"orderby/LAUNCH desc/"
            f"format/json"
        )
        
        print(f"[SpaceTrack] Querying SATCAT: {query_filter}")
        print(f"[SpaceTrack] NOTE: SATCAT queries limited to 1/day per Space-Track policy")
        
        data = self._execute_query(url, QueryType.SATCAT, constellation)
        
        if isinstance(data, list):
            print(f"[SpaceTrack] SATCAT query returned {len(data)} records")
            return data
        return []
    
    def get_satcat_by_norad_ids(self, norad_ids: List[int]) -> List[Dict]:
        """
        Get SATCAT data for specific NORAD IDs.
        
        Args:
            norad_ids: List of NORAD catalog IDs
        
        Returns:
            List of SATCAT records
        """
        if not norad_ids:
            return []
        
        results = []
        CHUNK_SIZE = 100
        
        for i in range(0, len(norad_ids), CHUNK_SIZE):
            chunk = norad_ids[i:i + CHUNK_SIZE]
            id_list = ",".join(map(str, chunk))
            
            url = (
                f"{self.BASE_URL}/basicspacedata/query/class/satcat/"
                f"NORAD_CAT_ID/{id_list}/"
                f"format/json"
            )
            
            data = self._execute_query(url, QueryType.SATCAT)
            if isinstance(data, list):
                results.extend(data)
            
            # Throttle between chunks
            if i + CHUNK_SIZE < len(norad_ids):
                time.sleep(2)
        
        return results
    
    def get_gp_history(self, norad_ids: List[int], start_date: datetime,
                       end_date: datetime = None, constellation: str = None) -> List[Dict]:
        """
        Fetch historical GP (TLE) data for satellites.
        
        IMPORTANT: Per Space-Track documentation, GP_HISTORY should only be
        downloaded ONCE per satellite and stored locally. Do NOT re-download!
        
        Args:
            norad_ids: List of NORAD catalog IDs
            start_date: Start of history range
            end_date: End of history range (default: now)
            constellation: Constellation slug for tracking
        
        Returns:
            List of historical GP records
        """
        if not norad_ids:
            return []
        
        if not end_date:
            end_date = datetime.utcnow()
        
        results = []
        CHUNK_SIZE = 100  # Balance between efficiency and URL length
        
        date_range = f"{start_date.strftime('%Y-%m-%d')}--{end_date.strftime('%Y-%m-%d')}"
        
        print(f"[SpaceTrack] Fetching GP history for {len(norad_ids)} satellites")
        print(f"[SpaceTrack] Date range: {date_range}")
        print(f"[SpaceTrack] NOTE: GP_HISTORY should be downloaded once and stored locally")
        
        total_chunks = (len(norad_ids) - 1) // CHUNK_SIZE + 1
        
        for i in range(0, len(norad_ids), CHUNK_SIZE):
            chunk = norad_ids[i:i + CHUNK_SIZE]
            chunk_num = i // CHUNK_SIZE + 1
            id_list = ",".join(map(str, chunk))
            
            url = (
                f"{self.BASE_URL}/basicspacedata/query/class/gp_history/"
                f"NORAD_CAT_ID/{id_list}/"
                f"EPOCH/{date_range}/"
                f"orderby/EPOCH asc/"
                f"format/json"
            )
            
            print(f"[SpaceTrack] Querying history chunk {chunk_num}/{total_chunks}...")
            
            data = self._execute_query(
                url, 
                QueryType.GP_HISTORY, 
                constellation,
                timeout=self.BULK_QUERY_TIMEOUT
            )
            
            if isinstance(data, list):
                results.extend(data)
                print(f"[SpaceTrack] Chunk {chunk_num}: {len(data)} records")
            
            # Throttle between chunks
            if i + CHUNK_SIZE < len(norad_ids):
                time.sleep(3)
        
        print(f"[SpaceTrack] GP history complete: {len(results)} total records")
        return results
    
    def get_latest_tle_by_norad(self, norad_ids: List[int]) -> List[Dict]:
        """
        Get latest TLE for specific NORAD IDs.
        
        Args:
            norad_ids: List of NORAD catalog IDs
        
        Returns:
            List of TLE records
        """
        if not norad_ids:
            return []
        
        norad_str = ','.join(map(str, norad_ids))
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"NORAD_CAT_ID/{norad_str}/"
            f"format/json"
        )
        
        data = self._execute_query(url, QueryType.GP)
        return data if isinstance(data, list) else []
    
    def get_decay_data(self, days: int = 30) -> List[Dict]:
        """
        Get recent decay (re-entry) data.
        
        Args:
            days: Number of days to look back
        
        Returns:
            List of decay records
        """
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/decay/"
            f"DECAY_EPOCH/>now-{days}/"
            f"orderby/DECAY_EPOCH desc/"
            f"format/json"
        )
        
        data = self._execute_query(url, QueryType.DECAY)
        return data if isinstance(data, list) else []
    
    def get_tip_messages(self, limit: int = 20) -> List[Dict]:
        """
        Get Tracking and Impact Prediction (TIP) messages.
        These are re-entry predictions.
        
        Args:
            limit: Maximum number of records
        
        Returns:
            List of TIP records
        """
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/tip/"
            f"format/json/"
            f"limit/{limit}"
        )
        
        data = self._execute_query(url, QueryType.TIP)
        return data if isinstance(data, list) else []
    
    def get_announcements(self, limit: int = 5) -> List[Dict]:
        """Get Space-Track announcements."""
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/announcement/"
            f"format/json/"
            f"limit/{limit}"
        )
        
        data = self._execute_query(url, QueryType.OTHER)
        return data if isinstance(data, list) else []
    
    def get_recent_launches(self, days: int = 30) -> List[Dict]:
        """
        Get satellites launched in the last N days.
        
        Args:
            days: Number of days to look back
        
        Returns:
            List of recently launched satellites
        """
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/satcat/"
            f"LAUNCH/>={cutoff}/"
            f"orderby/LAUNCH desc/"
            f"format/json"
        )
        
        data = self._execute_query(url, QueryType.SATCAT)
        return data if isinstance(data, list) else []
    
    def get_full_status(self) -> Dict[str, Any]:
        """Get comprehensive Space-Track status including all metrics."""
        status = self.get_api_status()
        
        if status['status'] == 'online':
            try:
                status['tip_messages'] = self.get_tip_messages(10)
                status['announcements'] = self.get_announcements()
                status['recent_decays'] = self.get_decay_data(7)[:10]
            except Exception as e:
                status['additional_data_error'] = str(e)
        
        return status
    
    def logout_all(self):
        """Logout from all sessions."""
        for username, session in self._sessions.items():
            try:
                session.get(self.LOGOUT_URL, timeout=10)
            except:
                pass
            finally:
                session.close()
        
        self._sessions.clear()
        self._session_auth_time.clear()


# Singleton instance
spacetrack_service = SpaceTrackService()
