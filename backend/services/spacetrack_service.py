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
import urllib.parse
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
            session = requests.Session()
            # Add proper user-agent to avoid being blocked
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
            })
            self._sessions[username] = session
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
        max_retries = min(5, len(Config.SPACETRACK_ACCOUNTS))
        backoff_time = 2  # Initial backoff in seconds
        
        for attempt in range(max_retries):
            # Get available account
            account = self.account_pool.get_available_account(query_type, constellation)
            
            if not account:
                # Wait for an account to become available
                print(f"[SpaceTrack] No accounts available, waiting...", flush=True)
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
                    
                    # Check for HTML response (indicates error page)
                    content_type = response.headers.get('Content-Type', '')
                    if 'text/html' in content_type and response.text.startswith('<!DOCTYPE'):
                        print(f"[SpaceTrack] Received HTML error page instead of data", flush=True)
                        print(f"[SpaceTrack] Response preview: {response.text[:200]}", flush=True)
                        # Might be a server error disguised as 200
                        continue
                    
                    try:
                        return response.json()
                    except ValueError:
                        # Return raw text for TLE format
                        return response.text
                
                elif response.status_code == 429:
                    # Rate limited
                    print(f"[SpaceTrack] Rate limited (429) on {username[:10]}***", flush=True)
                    self.account_pool.mark_rate_limited(username)
                    time.sleep(backoff_time)
                    backoff_time *= 2  # Exponential backoff
                    continue
                
                elif response.status_code in (401, 403):
                    # Auth issue
                    print(f"[SpaceTrack] Auth error ({response.status_code}) on {username[:10]}***", flush=True)
                    self.account_pool.mark_auth_failed(username, f"HTTP {response.status_code}")
                    # Clear session to force re-auth
                    if username in self._session_auth_time:
                        del self._session_auth_time[username]
                    continue
                
                elif response.status_code == 500:
                    # Server error - check if it's a rate limit message
                    response_text = response.text.lower()
                    if 'rate limit' in response_text or 'violated your query' in response_text:
                        print(f"[SpaceTrack] Rate limit triggered (500) on {username[:10]}***", flush=True)
                        self.account_pool.mark_rate_limited(username)
                        # Wait longer for rate limit recovery
                        wait_time = min(60, backoff_time * 4)
                        print(f"[SpaceTrack] Waiting {wait_time}s before retry...", flush=True)
                        time.sleep(wait_time)
                        backoff_time *= 2
                        continue
                    else:
                        # Other 500 error
                        print(f"[SpaceTrack] Server error (500): {response.text[:300]}", flush=True)
                        self.account_pool.mark_error(username, "Server error 500")
                        # Try with different account after short wait
                        time.sleep(2)
                        continue
                
                else:
                    # Other error
                    print(f"[SpaceTrack] Error {response.status_code}: {response.text[:200]}", flush=True)
                    self.account_pool.mark_error(username, f"HTTP {response.status_code}")
                    
            except requests.Timeout:
                print(f"[SpaceTrack] Timeout on {username[:10]}***", flush=True)
                self.account_pool.mark_error(username, "Timeout")
                
            except requests.RequestException as e:
                print(f"[SpaceTrack] Request error: {e}", flush=True)
                self.account_pool.mark_error(username, str(e))
        
        print(f"[SpaceTrack] All retries exhausted for URL: {url[:100]}...", flush=True)
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
    
    def test_query_format(self, test_name: str = "STARLINK-1") -> Dict[str, Any]:
        """
        Test different query formats to diagnose API issues.
        
        This method tries multiple URL formats to find what works.
        """
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'test_name': test_name,
            'tests': []
        }
        
        # Test 1: Simple query with exact name match
        test1_url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"OBJECT_NAME/{test_name}/"
            f"format/json/limit/1"
        )
        results['tests'].append({
            'name': 'exact_match',
            'url': test1_url,
            'result': self._test_single_query(test1_url)
        })
        
        # Test 2: Query with contains operator (~~)
        test2_url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"OBJECT_NAME/~~STARLINK/"
            f"format/json/limit/5"
        )
        results['tests'].append({
            'name': 'contains_operator',
            'url': test2_url,
            'result': self._test_single_query(test2_url)
        })
        
        # Test 3: Query with NORAD_CAT_ID (simpler)
        test3_url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"NORAD_CAT_ID/44713/"
            f"format/json"
        )
        results['tests'].append({
            'name': 'norad_id',
            'url': test3_url,
            'result': self._test_single_query(test3_url)
        })
        
        # Test 4: Query GP class without any filters (just limit)
        test4_url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"format/json/limit/3"
        )
        results['tests'].append({
            'name': 'no_filter',
            'url': test4_url,
            'result': self._test_single_query(test4_url)
        })
        
        return results
    
    def _test_single_query(self, url: str) -> Dict[str, Any]:
        """Execute a single test query and return detailed results."""
        result = {
            'success': False,
            'status_code': None,
            'content_type': None,
            'response_preview': None,
            'record_count': 0,
            'error': None
        }
        
        account = self.account_pool.get_available_account(QueryType.OTHER)
        if not account:
            result['error'] = 'No available account'
            return result
        
        username = account['username']
        password = account['password']
        
        try:
            if not self._ensure_authenticated(username, password):
                result['error'] = 'Authentication failed'
                return result
            
            session = self._get_session(username)
            response = session.get(url, timeout=30)
            
            result['status_code'] = response.status_code
            result['content_type'] = response.headers.get('Content-Type', 'unknown')
            
            if response.status_code == 200:
                if 'application/json' in result['content_type']:
                    try:
                        data = response.json()
                        result['success'] = True
                        result['record_count'] = len(data) if isinstance(data, list) else 1
                        result['response_preview'] = str(data)[:200] if data else 'empty'
                    except ValueError as e:
                        result['error'] = f'JSON parse error: {e}'
                        result['response_preview'] = response.text[:200]
                else:
                    result['response_preview'] = response.text[:200]
                    result['error'] = f'Unexpected content type: {result["content_type"]}'
            else:
                result['response_preview'] = response.text[:300]
                result['error'] = f'HTTP {response.status_code}'
                
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def _format_query_filter(self, query_filter: str) -> str:
        """
        Convert query filter to proper Space-Track URL format.
        
        Space-Track API URL format: /class/{class}/predicate/value/predicate/value/.../format/{format}
        
        Input: "OBJECT_NAME~~STARLINK" or "OBJECT_NAME~~STARLINK,NORAD_CAT_ID>40000"
        Output: "OBJECT_NAME/~~STARLINK/" or "OBJECT_NAME/~~STARLINK/NORAD_CAT_ID/>40000/"
        
        Operators supported by Space-Track:
        - ~~ : contains (case-insensitive)
        - ^ : starts with
        - $ : ends with
        - <> : not equal
        - < : less than
        - > : greater than
        - <= : less than or equal
        - >= : greater than or equal
        - -- : range (value1--value2)
        - null-val : is null (no value needed)
        """
        if not query_filter:
            return ""
        
        # Handle multiple conditions (comma-separated)
        conditions = query_filter.split(',')
        parts = []
        
        for condition in conditions:
            condition = condition.strip()
            if not condition:
                continue
            
            # Check for null-val special case
            if condition.endswith('/null-val'):
                parts.append(f"{condition}/")
                continue
            
            # Parse operator and value - check longer operators first
            operators = ['~~', '<>', '<=', '>=', '^', '$', '<', '>', '--']
            found_op = False
            
            for op in operators:
                if op in condition:
                    idx = condition.index(op)
                    field = condition[:idx].strip()
                    value = condition[idx + len(op):].strip()
                    # URL encode the value to handle special characters
                    encoded_value = urllib.parse.quote(value, safe='')
                    parts.append(f"{field}/{op}{encoded_value}/")
                    found_op = True
                    break
            
            if not found_op:
                # No operator found, treat as field=value
                if '=' in condition:
                    field, value = condition.split('=', 1)
                    encoded_value = urllib.parse.quote(value.strip(), safe='')
                    parts.append(f"{field.strip()}/{encoded_value}/")
                elif '/' in condition:
                    # Already formatted
                    if not condition.endswith('/'):
                        parts.append(f"{condition}/")
                    else:
                        parts.append(condition)
                else:
                    # Just a field name (invalid, but handle gracefully)
                    parts.append(f"{condition}/")
        
        return ''.join(parts)
    
    def get_gp_data(self, query_filter: str, constellation: str = None) -> List[Dict]:
        """
        Get General Perturbations (GP/TLE) data.
        
        Args:
            query_filter: Space-Track query filter (e.g., "OBJECT_NAME~~STARLINK")
            constellation: Constellation slug for rate limit tracking
        
        Returns:
            List of GP data dictionaries
        """
        # Format query filter for Space-Track URL
        formatted_filter = self._format_query_filter(query_filter)
        
        # Build URL for GP class (latest TLEs)
        # Add DECAY_DATE/null-val to get only active satellites
        # Note: orderby value needs URL encoding for spaces
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"DECAY_DATE/null-val/"
            f"{formatted_filter}"
            f"orderby/NORAD_CAT_ID%20asc/"
            f"format/json"
        )
        
        print(f"[SpaceTrack] Querying GP data: {query_filter}", flush=True)
        print(f"[SpaceTrack] URL: {url}", flush=True)
        data = self._execute_query(url, QueryType.GP, constellation)
        
        if isinstance(data, list):
            print(f"[SpaceTrack] GP query returned {len(data)} records", flush=True)
            return data
        elif data is not None:
            print(f"[SpaceTrack] Unexpected response type: {type(data)}", flush=True)
        return []
    
    def get_gp_data_tle_format(self, query_filter: str, constellation: str = None) -> str:
        """
        Get GP data in TLE format (3-line).
        
        Returns:
            TLE text data
        """
        formatted_filter = self._format_query_filter(query_filter)
        
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/gp/"
            f"DECAY_DATE/null-val/"
            f"{formatted_filter}"
            f"orderby/NORAD_CAT_ID%20asc/"
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
        formatted_filter = self._format_query_filter(query_filter)
        
        url = (
            f"{self.BASE_URL}/basicspacedata/query/class/satcat/"
            f"{formatted_filter}"
            f"orderby/LAUNCH%20desc/"
            f"format/json"
        )
        
        print(f"[SpaceTrack] Querying SATCAT: {query_filter}", flush=True)
        print(f"[SpaceTrack] URL: {url}", flush=True)
        print(f"[SpaceTrack] NOTE: SATCAT queries limited to 1/day per Space-Track policy", flush=True)
        
        data = self._execute_query(url, QueryType.SATCAT, constellation)
        
        if isinstance(data, list):
            print(f"[SpaceTrack] SATCAT query returned {len(data)} records", flush=True)
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
        
        For large date ranges or many objects, Space-Track recommends downloading
        year-bundled zip files from their cloud storage instead of using API.
        
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
        
        # Limit date range to avoid overwhelming the server
        # Space-Track recommends downloading year-bundled files for large ranges
        max_days = 365  # Limit to 1 year per query
        date_span = (end_date - start_date).days
        
        if date_span > max_days:
            print(f"[SpaceTrack] WARNING: Date range ({date_span} days) exceeds recommended limit ({max_days} days)", flush=True)
            print(f"[SpaceTrack] Consider downloading year-bundled files for large ranges", flush=True)
            # Split into yearly chunks
            return self._get_gp_history_chunked_by_year(norad_ids, start_date, end_date, constellation)
        
        results = []
        CHUNK_SIZE = 20  # Smaller chunks for history queries
        
        # Use CREATION_DATE instead of EPOCH for GP_HISTORY queries
        # Format: CREATION_DATE/start--end/ or CREATION_DATE/>start/
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        print(f"[SpaceTrack] Fetching GP history for {len(norad_ids)} satellites", flush=True)
        print(f"[SpaceTrack] Date range: {start_str} to {end_str} ({date_span} days)", flush=True)
        print(f"[SpaceTrack] NOTE: GP_HISTORY should be downloaded once and stored locally", flush=True)
        
        total_chunks = (len(norad_ids) - 1) // CHUNK_SIZE + 1
        
        for i in range(0, len(norad_ids), CHUNK_SIZE):
            chunk = norad_ids[i:i + CHUNK_SIZE]
            chunk_num = i // CHUNK_SIZE + 1
            id_list = ",".join(map(str, chunk))
            
            # Try different URL formats - Space-Track API can be finicky
            # Valid Space-Track operators: > < -- ~~ ^ $ <> (NOT >= or <=)
            urls_to_try = [
                # Format 1: CREATION_DATE with range operator (recommended by Space-Track)
                (
                    f"{self.BASE_URL}/basicspacedata/query/class/gp_history/"
                    f"NORAD_CAT_ID/{id_list}/"
                    f"CREATION_DATE/{start_str}--{end_str}/"
                    f"orderby/CREATION_DATE%20asc/"
                    f"format/json"
                ),
                # Format 2: Use EPOCH instead of CREATION_DATE (alternative field)
                (
                    f"{self.BASE_URL}/basicspacedata/query/class/gp_history/"
                    f"NORAD_CAT_ID/{id_list}/"
                    f"EPOCH/{start_str}--{end_str}/"
                    f"orderby/EPOCH%20asc/"
                    f"format/json"
                ),
                # Format 3: Use > and < operators (NOT >= or <=, they're invalid)
                (
                    f"{self.BASE_URL}/basicspacedata/query/class/gp_history/"
                    f"NORAD_CAT_ID/{id_list}/"
                    f"CREATION_DATE/%3E{start_str}/"
                    f"CREATION_DATE/%3C{end_str}/"
                    f"orderby/CREATION_DATE%20asc/"
                    f"format/json"
                ),
            ]
            
            data = None
            for url_idx, url in enumerate(urls_to_try, 1):
                print(f"[SpaceTrack] Querying history chunk {chunk_num}/{total_chunks} (format {url_idx}/{len(urls_to_try)})...", flush=True)
                print(f"[SpaceTrack] URL: {url[:150]}...", flush=True)
                
                data = self._execute_query(
                    url, 
                    QueryType.GP_HISTORY, 
                    constellation,
                    timeout=self.BULK_QUERY_TIMEOUT
                )
                
                if isinstance(data, list):
                    if data:
                        print(f"[SpaceTrack] Chunk {chunk_num}: {len(data)} records (format {url_idx} succeeded)", flush=True)
                        break
                    else:
                        print(f"[SpaceTrack] Chunk {chunk_num}: Format {url_idx} returned empty list", flush=True)
                elif data is None:
                    print(f"[SpaceTrack] Chunk {chunk_num}: Format {url_idx} failed, trying next...", flush=True)
                    if url_idx < len(urls_to_try):
                        time.sleep(3)  # Wait before trying next format
                    continue
            
            if isinstance(data, list):
                results.extend(data)
            elif data is None:
                print(f"[SpaceTrack] Chunk {chunk_num}: All formats failed, skipping this chunk", flush=True)
            
            # Throttle between chunks - GP_HISTORY has strict rate limits
            if i + CHUNK_SIZE < len(norad_ids):
                wait_time = 10  # Longer wait for history queries
                print(f"[SpaceTrack] Waiting {wait_time}s before next chunk...", flush=True)
                time.sleep(wait_time)
        
        print(f"[SpaceTrack] GP history complete: {len(results)} total records", flush=True)
        return results
    
    def _get_gp_history_chunked_by_year(self, norad_ids: List[int], start_date: datetime,
                                        end_date: datetime, constellation: str = None) -> List[Dict]:
        """
        Fetch GP history by splitting into yearly chunks.
        
        This is used when the date range exceeds recommended limits.
        """
        results = []
        current_start = start_date
        
        while current_start < end_date:
            # Calculate end of current year or end_date, whichever is earlier
            current_end = min(
                datetime(current_start.year + 1, 1, 1),
                end_date
            )
            
            print(f"[SpaceTrack] Fetching year {current_start.year}...", flush=True)
            
            year_results = self.get_gp_history(
                norad_ids, 
                current_start, 
                current_end, 
                constellation
            )
            
            results.extend(year_results)
            
            # Move to next year
            current_start = current_end
            
            # Wait between years
            if current_start < end_date:
                time.sleep(5)
        
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
    
    def get_gp_by_name_pattern(self, pattern: str, constellation: str = None, 
                                limit: int = None) -> List[Dict]:
        """
        Get GP data by name pattern using the contains operator.
        
        This is a simpler version of get_gp_data that focuses on
        a single name pattern without additional filters.
        
        Args:
            pattern: Name pattern to search for (e.g., "STARLINK")
            constellation: Constellation slug for rate limit tracking
            limit: Maximum number of results (optional)
        
        Returns:
            List of GP data dictionaries
        """
        # Build URL with the contains operator
        # URL encode the pattern for safety
        encoded_pattern = urllib.parse.quote(pattern, safe='')
        
        url_parts = [
            f"{self.BASE_URL}/basicspacedata/query/class/gp",
            f"OBJECT_NAME/~~{encoded_pattern}",
            f"DECAY_DATE/null-val",  # Only active satellites
            f"orderby/NORAD_CAT_ID%20asc",
            "format/json"
        ]
        
        if limit:
            url_parts.append(f"limit/{limit}")
        
        url = "/".join(url_parts) + "/"
        
        print(f"[SpaceTrack] Querying GP by pattern: {pattern}", flush=True)
        print(f"[SpaceTrack] URL: {url}", flush=True)
        
        data = self._execute_query(url, QueryType.GP, constellation)
        
        if isinstance(data, list):
            print(f"[SpaceTrack] Pattern query returned {len(data)} records", flush=True)
            return data
        return []
    
    def get_gp_by_multiple_patterns(self, patterns: List[str], constellation: str = None) -> List[Dict]:
        """
        Get GP data matching any of multiple name patterns.
        
        Since Space-Track may not support OR queries well, this method
        makes separate queries for each pattern and combines the results.
        
        Args:
            patterns: List of name patterns to search for
            constellation: Constellation slug for rate limit tracking
        
        Returns:
            Combined list of GP data dictionaries (deduplicated by NORAD_CAT_ID)
        """
        all_results = {}
        
        for pattern in patterns:
            print(f"[SpaceTrack] Querying pattern: {pattern}", flush=True)
            data = self.get_gp_by_name_pattern(pattern, constellation, limit=2000)
            
            for record in data:
                norad_id = record.get('NORAD_CAT_ID')
                if norad_id and norad_id not in all_results:
                    all_results[norad_id] = record
            
            # Throttle between pattern queries
            if len(patterns) > 1:
                time.sleep(2)
        
        result_list = list(all_results.values())
        print(f"[SpaceTrack] Combined results: {len(result_list)} unique satellites", flush=True)
        return result_list
    
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
            f"orderby/DECAY_EPOCH%20desc/"
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
            f"orderby/LAUNCH%20desc/"
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
