"""
Space-Track.org Multi-Account Pool Manager

Manages multiple Space-Track accounts to:
- Avoid rate limiting by rotating accounts
- Track per-account request counts and cooldowns
- Handle authentication failures gracefully
- Provide health status monitoring

Space-Track API Limits (per account):
- 30 requests per minute
- 300 requests per hour
- GP data: 1 query per hour for same data
- SATCAT: 1 query per day after 1700 UTC
"""

import time
import threading
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class AccountStatus(Enum):
    """Account status enumeration"""
    ACTIVE = 'active'
    RATE_LIMITED = 'rate_limited'
    SUSPENDED = 'suspended'
    AUTH_FAILED = 'auth_failed'
    COOLDOWN = 'cooldown'


class QueryType(Enum):
    """Query type for tracking different rate limits"""
    GP = 'gp'                    # General Perturbations (TLE)
    GP_HISTORY = 'gp_history'    # Historical TLE data
    SATCAT = 'satcat'            # Satellite Catalog
    DECAY = 'decay'              # Decay predictions
    TIP = 'tip'                  # Tracking and Impact Prediction
    OTHER = 'other'              # Other queries


@dataclass
class AccountState:
    """State tracking for a single account"""
    username: str
    password: str
    status: AccountStatus = AccountStatus.ACTIVE
    
    # Request tracking
    requests_this_minute: int = 0
    requests_this_hour: int = 0
    total_requests: int = 0
    
    # Timestamps
    last_request_time: Optional[datetime] = None
    minute_window_start: Optional[datetime] = None
    hour_window_start: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None
    
    # Query-specific cooldowns
    last_gp_query: Dict[str, datetime] = field(default_factory=dict)  # {constellation: timestamp}
    last_satcat_query: Optional[datetime] = None
    last_gp_history_query: Dict[str, datetime] = field(default_factory=dict)
    
    # Error tracking
    consecutive_errors: int = 0
    last_error: Optional[str] = None
    last_error_time: Optional[datetime] = None
    
    def reset_minute_counter(self):
        """Reset minute request counter"""
        self.requests_this_minute = 0
        self.minute_window_start = datetime.utcnow()
    
    def reset_hour_counter(self):
        """Reset hour request counter"""
        self.requests_this_hour = 0
        self.hour_window_start = datetime.utcnow()


class AccountPoolManager:
    """
    Space-Track Multi-Account Pool Manager
    
    Manages multiple accounts with:
    - Intelligent rotation based on availability
    - Per-account rate limiting
    - Query-type specific cooldowns
    - Health monitoring and auto-recovery
    """
    
    # Rate limiting constants (Space-Track official limits)
    MAX_REQUESTS_PER_MINUTE = 25      # Official: 30, conservative: 25
    MAX_REQUESTS_PER_HOUR = 280       # Official: 300, conservative: 280
    
    # Query-specific cooldowns (seconds)
    GP_QUERY_COOLDOWN = 3600          # 1 hour between same GP queries
    SATCAT_QUERY_COOLDOWN = 86400     # 24 hours between SATCAT queries
    GP_HISTORY_COOLDOWN = 604800      # 7 days for same history (download once)
    
    # Error handling
    RATE_LIMIT_COOLDOWN = 1800        # 30 minutes cooldown after rate limit
    AUTH_FAILURE_COOLDOWN = 3600      # 1 hour cooldown after auth failure
    MAX_CONSECUTIVE_ERRORS = 5        # Max errors before marking suspended
    
    # Timing
    ACCOUNT_ROTATION_DELAY = 2        # Seconds between account switches
    REQUEST_MIN_INTERVAL = 2          # Minimum seconds between requests
    
    def __init__(self, accounts: List[Dict[str, str]] = None):
        """
        Initialize the account pool.
        
        Args:
            accounts: List of {'username': str, 'password': str} dicts
        """
        self._lock = threading.RLock()
        self._accounts: Dict[str, AccountState] = {}
        self._current_index = 0
        self._last_request_time = None
        
        if accounts:
            for acc in accounts:
                self.add_account(acc['username'], acc['password'])
    
    def add_account(self, username: str, password: str) -> bool:
        """Add an account to the pool."""
        with self._lock:
            if username in self._accounts:
                return False
            
            self._accounts[username] = AccountState(
                username=username,
                password=password
            )
            print(f"[AccountPool] Added account: {self._mask_email(username)}")
            return True
    
    def remove_account(self, username: str) -> bool:
        """Remove an account from the pool."""
        with self._lock:
            if username in self._accounts:
                del self._accounts[username]
                return True
            return False
    
    def _mask_email(self, email: str) -> str:
        """Mask email for logging (show first 3 chars + domain)."""
        if '@' in email:
            local, domain = email.split('@', 1)
            if len(local) > 3:
                return f"{local[:3]}***@{domain}"
        return email[:3] + "***"
    
    def _is_minute_window_expired(self, state: AccountState) -> bool:
        """Check if the minute window has expired."""
        if state.minute_window_start is None:
            return True
        return (datetime.utcnow() - state.minute_window_start).total_seconds() >= 60
    
    def _is_hour_window_expired(self, state: AccountState) -> bool:
        """Check if the hour window has expired."""
        if state.hour_window_start is None:
            return True
        return (datetime.utcnow() - state.hour_window_start).total_seconds() >= 3600
    
    def _is_account_available(self, state: AccountState) -> bool:
        """Check if an account is available for use."""
        now = datetime.utcnow()
        
        # Check status
        if state.status == AccountStatus.SUSPENDED:
            return False
        
        if state.status == AccountStatus.AUTH_FAILED:
            # Check if cooldown expired
            if state.cooldown_until and now < state.cooldown_until:
                return False
            # Reset after cooldown
            state.status = AccountStatus.ACTIVE
            state.consecutive_errors = 0
        
        if state.status in (AccountStatus.RATE_LIMITED, AccountStatus.COOLDOWN):
            if state.cooldown_until and now < state.cooldown_until:
                return False
            # Reset after cooldown
            state.status = AccountStatus.ACTIVE
        
        # Check rate limits
        if self._is_minute_window_expired(state):
            state.reset_minute_counter()
        
        if self._is_hour_window_expired(state):
            state.reset_hour_counter()
        
        if state.requests_this_minute >= self.MAX_REQUESTS_PER_MINUTE:
            return False
        
        if state.requests_this_hour >= self.MAX_REQUESTS_PER_HOUR:
            return False
        
        return True
    
    def _can_query(self, state: AccountState, query_type: QueryType, 
                   constellation: str = None) -> bool:
        """Check if a specific query type is allowed for this account."""
        now = datetime.utcnow()
        
        if query_type == QueryType.GP and constellation:
            last_query = state.last_gp_query.get(constellation)
            if last_query:
                elapsed = (now - last_query).total_seconds()
                if elapsed < self.GP_QUERY_COOLDOWN:
                    return False
        
        elif query_type == QueryType.SATCAT:
            if state.last_satcat_query:
                elapsed = (now - state.last_satcat_query).total_seconds()
                if elapsed < self.SATCAT_QUERY_COOLDOWN:
                    return False
        
        elif query_type == QueryType.GP_HISTORY and constellation:
            last_query = state.last_gp_history_query.get(constellation)
            if last_query:
                elapsed = (now - last_query).total_seconds()
                if elapsed < self.GP_HISTORY_COOLDOWN:
                    return False
        
        return True
    
    def get_available_account(self, query_type: QueryType = QueryType.OTHER,
                              constellation: str = None) -> Optional[Dict[str, str]]:
        """
        Get an available account for the specified query type.
        
        Args:
            query_type: Type of query to be made
            constellation: Constellation slug (for query-specific cooldowns)
        
        Returns:
            Dict with 'username' and 'password', or None if no account available
        """
        with self._lock:
            if not self._accounts:
                print("[AccountPool] ERROR: No accounts configured!")
                return None
            
            # Enforce minimum interval between requests
            if self._last_request_time:
                elapsed = (datetime.utcnow() - self._last_request_time).total_seconds()
                if elapsed < self.REQUEST_MIN_INTERVAL:
                    time.sleep(self.REQUEST_MIN_INTERVAL - elapsed)
            
            # Try all accounts starting from current index
            accounts_list = list(self._accounts.values())
            n = len(accounts_list)
            
            for i in range(n):
                idx = (self._current_index + i) % n
                state = accounts_list[idx]
                
                if self._is_account_available(state):
                    if self._can_query(state, query_type, constellation):
                        # Rotate to next account for next request
                        self._current_index = (idx + 1) % n
                        return {
                            'username': state.username,
                            'password': state.password
                        }
            
            # No account available
            return None
    
    def record_request(self, username: str, query_type: QueryType = QueryType.OTHER,
                      constellation: str = None, success: bool = True):
        """
        Record a request made by an account.
        
        Args:
            username: Account username
            query_type: Type of query made
            constellation: Constellation slug (for tracking)
            success: Whether the request succeeded
        """
        with self._lock:
            if username not in self._accounts:
                return
            
            state = self._accounts[username]
            now = datetime.utcnow()
            
            # Update counters
            state.requests_this_minute += 1
            state.requests_this_hour += 1
            state.total_requests += 1
            state.last_request_time = now
            self._last_request_time = now
            
            # Update query-specific timestamps
            if success:
                state.consecutive_errors = 0
                
                if query_type == QueryType.GP and constellation:
                    state.last_gp_query[constellation] = now
                elif query_type == QueryType.SATCAT:
                    state.last_satcat_query = now
                elif query_type == QueryType.GP_HISTORY and constellation:
                    state.last_gp_history_query[constellation] = now
    
    def mark_rate_limited(self, username: str):
        """Mark an account as rate limited."""
        with self._lock:
            if username not in self._accounts:
                return
            
            state = self._accounts[username]
            state.status = AccountStatus.RATE_LIMITED
            state.cooldown_until = datetime.utcnow() + timedelta(seconds=self.RATE_LIMIT_COOLDOWN)
            state.consecutive_errors += 1
            state.last_error = "Rate limited (429)"
            state.last_error_time = datetime.utcnow()
            
            print(f"[AccountPool] Account {self._mask_email(username)} rate limited, "
                  f"cooldown until {state.cooldown_until.strftime('%H:%M:%S UTC')}")
            
            # Check if should be suspended
            if state.consecutive_errors >= self.MAX_CONSECUTIVE_ERRORS:
                state.status = AccountStatus.SUSPENDED
                print(f"[AccountPool] Account {self._mask_email(username)} SUSPENDED "
                      f"after {state.consecutive_errors} consecutive errors")
    
    def mark_auth_failed(self, username: str, error: str = None):
        """Mark an account as having authentication failure."""
        with self._lock:
            if username not in self._accounts:
                return
            
            state = self._accounts[username]
            state.status = AccountStatus.AUTH_FAILED
            state.cooldown_until = datetime.utcnow() + timedelta(seconds=self.AUTH_FAILURE_COOLDOWN)
            state.consecutive_errors += 1
            state.last_error = error or "Authentication failed"
            state.last_error_time = datetime.utcnow()
            
            print(f"[AccountPool] Account {self._mask_email(username)} auth failed: {error}")
            
            if state.consecutive_errors >= self.MAX_CONSECUTIVE_ERRORS:
                state.status = AccountStatus.SUSPENDED
                print(f"[AccountPool] Account {self._mask_email(username)} SUSPENDED")
    
    def mark_error(self, username: str, error: str):
        """Record a general error for an account."""
        with self._lock:
            if username not in self._accounts:
                return
            
            state = self._accounts[username]
            state.consecutive_errors += 1
            state.last_error = error
            state.last_error_time = datetime.utcnow()
            
            if state.consecutive_errors >= self.MAX_CONSECUTIVE_ERRORS:
                state.status = AccountStatus.COOLDOWN
                state.cooldown_until = datetime.utcnow() + timedelta(seconds=300)  # 5 min
    
    def reset_account(self, username: str):
        """Reset an account to active status."""
        with self._lock:
            if username not in self._accounts:
                return
            
            state = self._accounts[username]
            state.status = AccountStatus.ACTIVE
            state.consecutive_errors = 0
            state.cooldown_until = None
    
    def get_pool_status(self) -> Dict[str, Any]:
        """Get current status of the account pool."""
        with self._lock:
            now = datetime.utcnow()
            
            status = {
                'total_accounts': len(self._accounts),
                'active_accounts': 0,
                'rate_limited_accounts': 0,
                'suspended_accounts': 0,
                'auth_failed_accounts': 0,
                'cooldown_accounts': 0,
                'total_requests': 0,
                'accounts': []
            }
            
            for username, state in self._accounts.items():
                # Update availability check
                is_available = self._is_account_available(state)
                
                if state.status == AccountStatus.ACTIVE and is_available:
                    status['active_accounts'] += 1
                elif state.status == AccountStatus.RATE_LIMITED:
                    status['rate_limited_accounts'] += 1
                elif state.status == AccountStatus.SUSPENDED:
                    status['suspended_accounts'] += 1
                elif state.status == AccountStatus.AUTH_FAILED:
                    status['auth_failed_accounts'] += 1
                else:
                    status['cooldown_accounts'] += 1
                
                status['total_requests'] += state.total_requests
                
                # Calculate time until available
                time_until_available = None
                if state.cooldown_until and now < state.cooldown_until:
                    time_until_available = (state.cooldown_until - now).total_seconds()
                
                status['accounts'].append({
                    'username': self._mask_email(username),
                    'status': state.status.value,
                    'is_available': is_available,
                    'requests_this_minute': state.requests_this_minute,
                    'requests_this_hour': state.requests_this_hour,
                    'total_requests': state.total_requests,
                    'last_error': state.last_error,
                    'time_until_available': time_until_available,
                })
            
            return status
    
    def get_available_account_count(self) -> int:
        """Get count of currently available accounts."""
        with self._lock:
            return sum(1 for state in self._accounts.values() 
                      if self._is_account_available(state))
    
    def wait_for_available_account(self, timeout: int = 300, 
                                   query_type: QueryType = QueryType.OTHER,
                                   constellation: str = None) -> Optional[Dict[str, str]]:
        """
        Wait until an account becomes available.
        
        Args:
            timeout: Maximum seconds to wait
            query_type: Type of query
            constellation: Constellation slug
        
        Returns:
            Account dict or None if timeout
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            account = self.get_available_account(query_type, constellation)
            if account:
                return account
            
            # Wait and retry
            time.sleep(5)
        
        return None


# Singleton instance (will be initialized with config)
account_pool: Optional[AccountPoolManager] = None


def init_account_pool(accounts: List[Dict[str, str]]) -> AccountPoolManager:
    """Initialize the global account pool."""
    global account_pool
    account_pool = AccountPoolManager(accounts)
    return account_pool


def get_account_pool() -> AccountPoolManager:
    """Get the global account pool instance."""
    global account_pool
    if account_pool is None:
        raise RuntimeError("Account pool not initialized. Call init_account_pool() first.")
    return account_pool
