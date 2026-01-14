"""
TLE (Two-Line Element) data service.
Handles fetching, parsing, and storing satellite TLE data.
Multi-source strategy:
1. api2.satellitemap.space (proxy for real-time data)
2. Space-Track.org (primary authoritative source)
3. CelesTrak (backup/mirror)
"""

import re
import math
import requests
import redis
import json
import time
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from threading import Lock

from models import db, Constellation, Satellite, TLEHistory
from config import Config


class TLEService:
    """
    Service for managing TLE data from multiple sources.
    Sources (in priority order):
    1. api2.satellitemap.space - Real-time proxy with comprehensive data
    2. Space-Track.org - Primary authoritative source
    3. CelesTrak - Backup mirror
    """

    # Earth constants for orbital calculations
    EARTH_RADIUS_KM = 6378.137
    EARTH_MU = 398600.4418  # km^3/s^2
    
    # External API endpoints
    API2_SATELLITES_URL = "https://api2.satellitemap.space/satellites"
    API2_TLE_URL = "https://api2.satellitemap.space/tle"
    
    # Rate limiting settings - Space-Track.org compliance
    # IMPORTANT: Space-Track requires minimum 1 hour between queries for same GP data
    # We use 3600 seconds (1 hour) to comply with their API usage policy
    RATE_LIMIT_SECONDS = 3600  # Minimum 1 hour between Space-Track API calls per constellation
    CELESTRAK_RATE_LIMIT = 60  # CelesTrak is more lenient - 1 minute minimum
    AUTO_FETCH_ENABLED = True  # Enable auto-fetch on missing data
    
    # Slug mapping for api2.satellitemap.space
    # Maps our internal slugs to api2's constellation identifiers
    API2_SLUG_MAP = {
        # Internet constellations
        'starlink': 'starlink',
        'oneweb': 'oneweb',
        'kuiper': 'kuiper',
        'telesat': 'telesat',
        
        # Chinese constellations (primary targets for api2 proxy)
        'qianfan': 'qianfan',
        'guowang': 'guowang',
        'galaxyspace': 'galaxyspace',
        'espace': 'espace',
        'jilin': 'jilin-1',
        'tianqi': 'tianqi',
        'yaogan': 'yaogan',
        
        # Navigation/Positioning
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
        
        # Earth Observation & Weather
        'planet': 'planet',
        'spire': 'spire',
        'swarm': 'swarm',
        'satelog': 'satelog',
        
        # GEO Communications
        'ses': 'ses',
        'intelsat': 'intelsat',
        'geo': 'geo',
        
        # Space Stations
        'stations': 'stations',
    }

    def __init__(self):
        self.redis_client = redis.Redis(
            host=Config.REDIS_HOST,
            port=Config.REDIS_PORT,
            db=Config.REDIS_DB,
            decode_responses=True,
        )
        self.celestrak_url = Config.CELESTRAK_BASE_URL
        self.supplemental_url = getattr(Config, "CELESTRAK_SUPPLEMENTAL_URL", None)
        self.constellations = Config.CONSTELLATIONS
        
        # Space-Track session
        self.spacetrack_url = Config.SPACETRACK_URL
        self.spacetrack_session = requests.Session()
        self._spacetrack_authenticated = False
        
        # Rate limiting
        self._rate_limit_lock = Lock()
        self._last_fetch_time = {}  # {slug: timestamp}

    # ==================== Rate Limiting ====================
    
    def _check_rate_limit(self, slug: str, source: str = 'spacetrack') -> bool:
        """
        Check if we can make another API call for this constellation.
        
        Space-Track.org API Policy Compliance:
        - Minimum 1 hour between queries for same GP data
        - Do not query at :00 or :30 (peak times)
        
        Args:
            slug: Constellation slug
            source: 'spacetrack' or 'celestrak' - different rate limits apply
            
        Returns:
            True if API call is allowed, False if rate limited
        """
        with self._rate_limit_lock:
            # Use source-specific rate limit key
            rate_key = f"{source}:{slug}"
            last_time = self._last_fetch_time.get(rate_key, 0)
            current_time = time.time()
            
            # Apply different rate limits based on source
            if source == 'spacetrack':
                limit = self.RATE_LIMIT_SECONDS  # 3600 seconds (1 hour)
            else:
                limit = self.CELESTRAK_RATE_LIMIT  # 60 seconds
            
            if current_time - last_time < limit:
                remaining = int(limit - (current_time - last_time))
                print(f"[RateLimit] {source}/{slug}: rate limited, {remaining}s remaining")
                return False
            return True
    
    def _update_rate_limit(self, slug: str, source: str = 'spacetrack'):
        """Update the last fetch time for rate limiting."""
        with self._rate_limit_lock:
            rate_key = f"{source}:{slug}"
            self._last_fetch_time[rate_key] = time.time()

    # ==================== api2.satellitemap.space Proxy Methods ====================
    
    def fetch_from_api2_proxy(self, constellation_slug: str) -> Optional[List[Dict]]:
        """
        Fetch satellite data from api2.satellitemap.space proxy.
        Returns list of satellite dicts with TLE data if available.
        """
        api2_constellation = self.API2_SLUG_MAP.get(constellation_slug)
        if not api2_constellation:
            print(f"[API2] No mapping for constellation: {constellation_slug}")
            return None
        
        try:
            # Fetch satellite list
            params = {
                'constellation': api2_constellation,
                'status': 'active',
            }
            print(f"[API2] Fetching satellites for {constellation_slug}...")
            response = requests.get(self.API2_SATELLITES_URL, params=params, timeout=60)
            
            if response.status_code != 200:
                print(f"[API2] Error {response.status_code}: {response.text[:200]}")
                return None
            
            data = response.json()
            if not data.get('success') or not data.get('data'):
                print(f"[API2] No data returned for {constellation_slug}")
                return None
            
            satellites = data['data']
            print(f"[API2] Fetched {len(satellites)} satellites for {constellation_slug}")
            
            # Fetch TLE data for these satellites
            norad_ids = [sat.get('norad_id') for sat in satellites if sat.get('norad_id')]
            if not norad_ids:
                return None
            
            # Batch TLE request
            tle_response = requests.post(
                self.API2_TLE_URL,
                json={'norad_ids': norad_ids},
                timeout=90
            )
            
            if tle_response.status_code != 200:
                print(f"[API2] TLE fetch error: {tle_response.status_code}")
                # Return satellites without TLE - can be fetched later
                return [self._convert_api2_satellite(sat, None) for sat in satellites]
            
            tle_data = tle_response.json()
            
            # Merge satellite info with TLE
            result = []
            for sat in satellites:
                norad_id = sat.get('norad_id')
                tle = tle_data.get(str(norad_id)) if norad_id else None
                result.append(self._convert_api2_satellite(sat, tle))
            
            print(f"[API2] Successfully fetched {len(result)} satellites with TLE for {constellation_slug}")
            return result
            
        except requests.RequestException as e:
            print(f"[API2] Request error for {constellation_slug}: {e}")
            return None
        except Exception as e:
            print(f"[API2] Unexpected error for {constellation_slug}: {e}")
            return None
    
    def _convert_api2_satellite(self, sat_data: Dict, tle_data: Optional[Dict]) -> Dict:
        """Convert api2 satellite data to our internal format."""
        result = {
            'norad_id': sat_data.get('norad_id'),
            'name': sat_data.get('sat_name', f"Unknown-{sat_data.get('norad_id')}"),
            'intl_designator': sat_data.get('intldes', '').strip() if sat_data.get('intldes') else None,
            'is_active': sat_data.get('status') == 'active',
        }
        
        if tle_data and 'line1' in tle_data and 'line2' in tle_data:
            result['line1'] = tle_data['line1']
            result['line2'] = tle_data['line2']
            
            # Parse orbital parameters from TLE line2
            try:
                line2 = tle_data['line2']
                result['inclination'] = float(line2[8:16].strip())
                result['eccentricity'] = float('0.' + line2[26:33].strip())
                result['mean_motion'] = float(line2[52:63].strip())
                result['period_minutes'] = 1440.0 / result['mean_motion']
                
                # Calculate semi-major axis
                period_seconds = result['period_minutes'] * 60
                result['semi_major_axis_km'] = (
                    self.EARTH_MU * (period_seconds / (2 * math.pi)) ** 2
                ) ** (1/3)
                
                # Calculate apogee/perigee
                result['apogee_km'] = result['semi_major_axis_km'] * (1 + result['eccentricity']) - self.EARTH_RADIUS_KM
                result['perigee_km'] = result['semi_major_axis_km'] * (1 - result['eccentricity']) - self.EARTH_RADIUS_KM
                
                # Parse epoch
                result['epoch'] = self.parse_tle_epoch(tle_data['line1'])
            except (ValueError, IndexError, KeyError) as e:
                print(f"[API2] Error parsing TLE for {result['norad_id']}: {e}")
        
        return result

    # ==================== Space-Track API Methods ====================
    
    def _spacetrack_login(self) -> bool:
        """
        Authenticate with Space-Track.org API.
        Implements: https://www.space-track.org/documentation#api-authMethod
        """
        if self._spacetrack_authenticated:
            return True
        
        # Check if credentials are configured
        username = os.environ.get('SPACETRACK_USERNAME', Config.SPACETRACK_USERNAME)
        password = os.environ.get('SPACETRACK_PASSWORD', Config.SPACETRACK_PASSWORD)
        
        if not username or not password:
            print("[SpaceTrack] Credentials not configured - skipping SpaceTrack source")
            return False
            
        try:
            login_url = f"{self.spacetrack_url}/ajaxauth/login"
            response = self.spacetrack_session.post(
                login_url,
                data={
                    'identity': username,
                    'password': password
                },
                timeout=30
            )
            
            if response.status_code == 200 and '"Login":"Failed"' not in response.text:
                self._spacetrack_authenticated = True
                print("[SpaceTrack] Authentication successful")
                return True
            else:
                print(f"[SpaceTrack] Authentication failed: {response.text[:200]}")
                return False
        except requests.RequestException as e:
            print(f"[SpaceTrack] Authentication error: {e}")
            return False

    def fetch_tle_from_spacetrack(self, constellation_slug: str) -> Optional[str]:
        """
        Fetch TLE data from Space-Track.org for a given constellation.
        Uses the GP class as recommended by Space-Track documentation.
        
        IMPORTANT: Space-Track.org API Usage Policy
        - Do NOT access same GP data more than once per hour
        - Do NOT query at :00 or :30 (peak times)
        - Use combined queries where possible
        
        API Endpoint: /basicspacedata/query/class/gp/...
        Documentation: https://www.space-track.org/documentation#api-basicSpaceDataGp
        """
        # Check rate limit BEFORE authenticating to save resources
        if not self._check_rate_limit(constellation_slug, source='spacetrack'):
            print(f"[SpaceTrack] Rate limited for {constellation_slug} - minimum 1 hour between queries")
            return None
        
        if not self._spacetrack_login():
            print(f"[SpaceTrack] Cannot fetch TLE - not authenticated")
            return None
            
        if constellation_slug not in self.constellations:
            raise ValueError(f"Unknown constellation: {constellation_slug}")

        config = self.constellations[constellation_slug]
        spacetrack_query = config.get('spacetrack_query')
        
        if not spacetrack_query:
            # No Space-Track query configured, fall back to CelesTrak
            return None
            
        try:
            # Build the Space-Track API URL
            # Format: /basicspacedata/query/class/gp/DECAY_DATE/null-val/EPOCH/>now-30/predicates/query/format/tle
            # Using TLE format for compatibility with existing parser
            
            # Handle special query formats
            if spacetrack_query.startswith('LAUNCH/'):
                # Special case for recent launches
                query_url = f"{self.spacetrack_url}/basicspacedata/query/class/gp/DECAY_DATE/null-val/{spacetrack_query}/orderby/NORAD_CAT_ID/format/tle"
            elif '~~' in spacetrack_query:
                # Contains query (e.g., OBJECT_NAME~~STARLINK)
                # Handle multiple OR conditions
                if ',' in spacetrack_query:
                    # Multiple conditions - need separate queries
                    conditions = spacetrack_query.split(',')
                    all_tle = ""
                    for condition in conditions:
                        part_url = f"{self.spacetrack_url}/basicspacedata/query/class/gp/DECAY_DATE/null-val/{condition}/orderby/NORAD_CAT_ID/format/tle"
                        response = self.spacetrack_session.get(part_url, timeout=120)
                        if response.status_code == 200:
                            all_tle += response.text + "\n"
                    return all_tle if all_tle else None
                else:
                    query_url = f"{self.spacetrack_url}/basicspacedata/query/class/gp/DECAY_DATE/null-val/{spacetrack_query}/orderby/NORAD_CAT_ID/format/tle"
            else:
                # Direct query
                query_url = f"{self.spacetrack_url}/basicspacedata/query/class/gp/DECAY_DATE/null-val/{spacetrack_query}/orderby/NORAD_CAT_ID/format/tle"
            
            print(f"[SpaceTrack] Fetching TLE for {constellation_slug}...")
            response = self.spacetrack_session.get(query_url, timeout=120)
            
            if response.status_code == 200:
                tle_text = response.text
                # Update rate limit tracker after successful fetch
                self._update_rate_limit(constellation_slug, source='spacetrack')
                print(f"[SpaceTrack] Fetched {len(tle_text)} bytes for {constellation_slug}")
                print(f"[SpaceTrack] Next query for {constellation_slug} allowed after 1 hour")
                return tle_text
            else:
                print(f"[SpaceTrack] Error {response.status_code}: {response.text[:200]}")
                return None
                
        except requests.RequestException as e:
            print(f"[SpaceTrack] Error fetching TLE for {constellation_slug}: {e}")
            return None

    # ==================== CelesTrak API Methods ====================
    
    def get_celestrak_url(self, group: str, format: str = "tle") -> str:
        """Generate CelesTrak API URL for a constellation group."""
        return f"{self.celestrak_url}?GROUP={group}&FORMAT={format}"

    def get_supplemental_url(self, file_name: str, format: str = "tle") -> str:
        """Generate CelesTrak supplemental API URL."""
        return f"{self.supplemental_url}?FILE={file_name}&FORMAT={format}"

    def fetch_tle_from_celestrak(self, constellation_slug: str) -> Optional[str]:
        """
        Fetch TLE data from CelesTrak for a given constellation.
        Used as backup when Space-Track is unavailable or rate limited.
        CelesTrak mirrors Space-Track data with less strict rate limits.
        """
        if constellation_slug not in self.constellations:
            raise ValueError(f"Unknown constellation: {constellation_slug}")

        # Check CelesTrak rate limit (more lenient than Space-Track)
        if not self._check_rate_limit(constellation_slug, source='celestrak'):
            print(f"[CelesTrak] Rate limited for {constellation_slug}")
            return None

        config = self.constellations[constellation_slug]
        group = config["group"]
        url = self.get_celestrak_url(group)

        tle_text = ""

        try:
            # Fetch main TLE data
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            tle_text = response.text
            # Update rate limit tracker
            self._update_rate_limit(constellation_slug, source='celestrak')
            print(f"[CelesTrak] Fetched {len(tle_text)} bytes for {constellation_slug}")

            # Also fetch supplemental data if configured
            supplemental = config.get("supplemental")
            if supplemental and self.supplemental_url:
                try:
                    supp_url = self.get_supplemental_url(supplemental)
                    supp_response = requests.get(supp_url, timeout=60)
                    supp_response.raise_for_status()
                    supp_text = supp_response.text
                    print(f"[CelesTrak] Fetched {len(supp_text)} bytes supplemental for {constellation_slug}")
                    tle_text = tle_text + "\n" + supp_text
                except requests.RequestException as e:
                    print(f"[CelesTrak] Warning: Failed to fetch supplemental data: {e}")

            return tle_text
        except requests.RequestException as e:
            print(f"[CelesTrak] Error fetching TLE for {constellation_slug}: {e}")
            return None

    # ==================== TLE Parsing Methods ====================

    def parse_tle_epoch(self, line1: str) -> Optional[datetime]:
        """
        Parse epoch from TLE line 1.
        Format: YY DDD.DDDDDDDD where YY is year, DDD.DD is day of year
        """
        try:
            epoch_str = line1[18:32].strip()
            year_2digit = int(epoch_str[:2])
            day_fraction = float(epoch_str[2:])

            # Convert 2-digit year to 4-digit
            if year_2digit >= 57:
                year = 1900 + year_2digit
            else:
                year = 2000 + year_2digit

            epoch = datetime(year, 1, 1) + timedelta(days=day_fraction - 1)
            return epoch
        except (ValueError, IndexError) as e:
            return None

    def parse_norad_id(self, line1: str) -> Optional[int]:
        """Extract NORAD catalog ID from TLE line 1."""
        try:
            return int(line1[2:7].strip())
        except (ValueError, IndexError):
            return None

    def parse_intl_designator(self, line1: str) -> Optional[str]:
        """Extract international designator from TLE line 1."""
        try:
            return line1[9:17].strip()
        except IndexError:
            return None

    def calculate_orbital_params(self, line2: str) -> Dict:
        """
        Calculate orbital parameters from TLE line 2.
        """
        try:
            inclination = float(line2[8:16].strip())
            eccentricity = float("0." + line2[26:33].strip())
            mean_motion = float(line2[52:63].strip())

            period_minutes = 1440.0 / mean_motion
            period_seconds = period_minutes * 60
            semi_major_axis = (
                self.EARTH_MU * (period_seconds / (2 * math.pi)) ** 2
            ) ** (1 / 3)

            apogee = semi_major_axis * (1 + eccentricity) - self.EARTH_RADIUS_KM
            perigee = semi_major_axis * (1 - eccentricity) - self.EARTH_RADIUS_KM

            return {
                "inclination": inclination,
                "eccentricity": eccentricity,
                "mean_motion": mean_motion,
                "period_minutes": period_minutes,
                "semi_major_axis_km": semi_major_axis,
                "apogee_km": apogee,
                "perigee_km": perigee,
            }
        except (ValueError, IndexError) as e:
            return {}

    def parse_tle_text(self, tle_text: str) -> List[Dict]:
        """
        Parse raw TLE text into structured list.
        Handles duplicates by keeping the entry with the most recent epoch.
        """
        lines = [line.strip() for line in tle_text.strip().split("\n") if line.strip()]
        tle_dict = {}

        i = 0
        while i < len(lines) - 2:
            if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
                name = lines[i].strip()
                line1 = lines[i + 1].strip()
                line2 = lines[i + 2].strip()

                norad_id = self.parse_norad_id(line1)
                epoch = self.parse_tle_epoch(line1)
                intl_designator = self.parse_intl_designator(line1)
                orbital_params = self.calculate_orbital_params(line2)

                tle_entry = {
                    "name": name,
                    "line1": line1,
                    "line2": line2,
                    "norad_id": norad_id,
                    "intl_designator": intl_designator,
                    "epoch": epoch,
                    **orbital_params,
                }

                if norad_id:
                    existing = tle_dict.get(norad_id)
                    if existing:
                        if epoch and existing.get("epoch"):
                            if epoch > existing["epoch"]:
                                tle_dict[norad_id] = tle_entry
                        elif epoch:
                            tle_dict[norad_id] = tle_entry
                    else:
                        tle_dict[norad_id] = tle_entry

                i += 3
            else:
                i += 1

        return list(tle_dict.values())

    # ==================== Update Methods ====================

    def update_constellation_tle(self, constellation_slug: str, force_celestrak: bool = False) -> Tuple[int, int]:
        """
        Update TLE data for a constellation in the database.
        
        Strategy:
        1. Try Space-Track first (primary source, most up-to-date)
        2. Fall back to CelesTrak if Space-Track fails
        
        Args:
            constellation_slug: The constellation identifier
            force_celestrak: If True, skip Space-Track and use CelesTrak directly
            
        Returns:
            Tuple of (new_count, updated_count)
        """
        tle_text = None
        source = "unknown"
        
        # Try Space-Track first (unless forced to use CelesTrak)
        if not force_celestrak:
            tle_text = self.fetch_tle_from_spacetrack(constellation_slug)
            if tle_text:
                source = "SpaceTrack"
        
        # Fall back to CelesTrak
        if not tle_text:
            tle_text = self.fetch_tle_from_celestrak(constellation_slug)
            if tle_text:
                source = "CelesTrak"
        
        if not tle_text:
            raise Exception(f"Failed to fetch TLE data for {constellation_slug} from any source")

        # Parse TLE data
        tle_entries = self.parse_tle_text(tle_text)
        print(f"[{source}] Parsed {len(tle_entries)} TLE entries for {constellation_slug}")

        # Get or create constellation
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            config = self.constellations[constellation_slug]
            constellation = Constellation(
                name=config["name"],
                slug=constellation_slug,
                description=config["description"],
                celestrak_group=config["group"],
                color=config["color"],
                tle_source_url=f"{self.spacetrack_url}/basicspacedata/query/class/gp/",
            )
            db.session.add(constellation)
            db.session.flush()

        new_count = 0
        updated_count = 0

        for entry in tle_entries:
            if not entry.get("norad_id"):
                continue

            satellite = Satellite.query.filter_by(norad_id=entry["norad_id"]).first()

            if satellite:
                old_epoch = satellite.tle_epoch

                satellite.name = entry["name"]
                satellite.tle_line1 = entry["line1"]
                satellite.tle_line2 = entry["line2"]
                satellite.tle_epoch = entry.get("epoch")
                satellite.intl_designator = entry.get("intl_designator")
                satellite.period_minutes = entry.get("period_minutes")
                satellite.inclination = entry.get("inclination")
                satellite.apogee_km = entry.get("apogee_km")
                satellite.perigee_km = entry.get("perigee_km")
                satellite.eccentricity = entry.get("eccentricity")
                satellite.semi_major_axis_km = entry.get("semi_major_axis_km")
                satellite.mean_motion = entry.get("mean_motion")
                satellite.tle_updated_at = datetime.utcnow()
                satellite.constellation_id = constellation.id

                # Add to history if epoch changed
                if old_epoch != entry.get("epoch"):
                    history = TLEHistory(
                        satellite_id=satellite.id,
                        tle_line1=entry["line1"],
                        tle_line2=entry["line2"],
                        epoch=entry.get("epoch"),
                        semi_major_axis_km=entry.get("semi_major_axis_km"),
                        mean_motion=entry.get("mean_motion"),
                        eccentricity=entry.get("eccentricity"),
                        inclination=entry.get("inclination"),
                        apogee_km=entry.get("apogee_km"),
                        perigee_km=entry.get("perigee_km"),
                    )
                    db.session.add(history)

                updated_count += 1
            else:
                satellite = Satellite(
                    norad_id=entry["norad_id"],
                    name=entry["name"],
                    constellation_id=constellation.id,
                    tle_line1=entry["line1"],
                    tle_line2=entry["line2"],
                    tle_epoch=entry.get("epoch"),
                    intl_designator=entry.get("intl_designator"),
                    period_minutes=entry.get("period_minutes"),
                    inclination=entry.get("inclination"),
                    apogee_km=entry.get("apogee_km"),
                    perigee_km=entry.get("perigee_km"),
                    eccentricity=entry.get("eccentricity"),
                    semi_major_axis_km=entry.get("semi_major_axis_km"),
                    mean_motion=entry.get("mean_motion"),
                    tle_updated_at=datetime.utcnow(),
                )
                db.session.add(satellite)
                new_count += 1

        # Update constellation satellite count
        constellation.satellite_count = Satellite.query.filter_by(
            constellation_id=constellation.id
        ).count()
        constellation.updated_at = datetime.utcnow()

        db.session.commit()

        # Update Redis cache
        self._cache_constellation_tle(constellation_slug)

        print(f"[{source}] Updated {constellation_slug}: {new_count} new, {updated_count} updated")
        return new_count, updated_count

    def _cache_constellation_tle(self, constellation_slug: str):
        """Cache constellation TLE data in Redis for fast access."""
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            return

        satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
        tle_data = [sat.to_tle_dict() for sat in satellites]

        # Use versioned cache key
        cache_key = f"tle:v2:{constellation_slug}"
        try:
            self.redis_client.set(
                cache_key, json.dumps(tle_data), ex=Config.TLE_CACHE_EXPIRY
            )
        except Exception as e:
            print(f"[Cache] Error caching TLE for {constellation_slug}: {e}")

    def get_constellation_tle(self, constellation_slug: str, auto_fetch: bool = True) -> List[Dict]:
        """
        Get TLE data for a constellation, using cache when available.
        If auto_fetch is True and data is missing, automatically fetch from external sources.
        
        Multi-source strategy:
        1. Check Redis cache
        2. Check database
        3. If empty and auto_fetch enabled: fetch from api2 → SpaceTrack → CelesTrak
        """
        # Version the cache key to handle schema changes
        cache_key = f"tle:v2:{constellation_slug}"
        
        # 1. Check cache first
        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                if data:  # Non-empty cache
                    return data
        except Exception as e:
            print(f"[Cache] Redis error: {e}")

        # 2. Check database
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if constellation:
            satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
            if satellites:
                tle_data = [sat.to_tle_dict() for sat in satellites]
                # Update cache
                try:
                    self.redis_client.set(
                        cache_key, json.dumps(tle_data), ex=Config.TLE_CACHE_EXPIRY
                    )
                except Exception:
                    pass
                return tle_data
        
        # 3. Auto-fetch if enabled and data is missing
        if auto_fetch and self.AUTO_FETCH_ENABLED and constellation_slug in self.constellations:
            # Check rate limit (source defaults to spacetrack for this call site)
            if not self._check_rate_limit(constellation_slug):
                print(f"[AutoFetch] Rate limited for {constellation_slug}")
                return []

            print(f"[AutoFetch] No data for {constellation_slug}, fetching...")
            try:
                self._update_rate_limit(constellation_slug)
                new_count, updated_count = self.fetch_and_store_constellation(constellation_slug)

                if new_count > 0 or updated_count > 0:
                    # Re-fetch from database after successful update
                    constellation = Constellation.query.filter_by(slug=constellation_slug).first()
                    if constellation:
                        satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
                        tle_data = [sat.to_tle_dict() for sat in satellites]

                        # Update cache
                        try:
                            self.redis_client.set(
                                cache_key, json.dumps(tle_data), ex=Config.TLE_CACHE_EXPIRY
                            )
                        except Exception:
                            pass

                        return tle_data
            except Exception as e:
                print(f"[AutoFetch] Error fetching {constellation_slug}: {e}")

        return []
    
    def fetch_and_store_constellation(self, constellation_slug: str) -> Tuple[int, int]:
        """
        Fetch constellation data from multiple sources and store in database.
        Uses multi-source strategy: api2 → SpaceTrack → CelesTrak
        
        Returns:
            Tuple of (new_count, updated_count)
        """
        tle_entries = None
        source = "unknown"
        
        # Source 1: Try api2.satellitemap.space proxy first
        api2_data = self.fetch_from_api2_proxy(constellation_slug)
        if api2_data and len(api2_data) > 0:
            # Filter entries that have TLE data
            tle_entries = [e for e in api2_data if e.get('line1') and e.get('line2')]
            if tle_entries:
                source = "API2"
                print(f"[{source}] Got {len(tle_entries)} entries with TLE for {constellation_slug}")
        
        # Source 2: Try Space-Track if api2 failed or returned no TLE
        if not tle_entries:
            tle_text = self.fetch_tle_from_spacetrack(constellation_slug)
            if tle_text:
                tle_entries = self.parse_tle_text(tle_text)
                if tle_entries:
                    source = "SpaceTrack"
                    print(f"[{source}] Parsed {len(tle_entries)} entries for {constellation_slug}")
        
        # Source 3: Fall back to CelesTrak
        if not tle_entries:
            try:
                tle_text = self.fetch_tle_from_celestrak(constellation_slug)
                if tle_text:
                    tle_entries = self.parse_tle_text(tle_text)
                    if tle_entries:
                        source = "CelesTrak"
                        print(f"[{source}] Parsed {len(tle_entries)} entries for {constellation_slug}")
            except Exception as e:
                print(f"[CelesTrak] Error: {e}")
        
        if not tle_entries:
            print(f"[AutoFetch] Failed to fetch data for {constellation_slug} from any source")
            return (0, 0)
        
        # Store in database
        return self._store_tle_entries(constellation_slug, tle_entries, source)
    
    def _store_tle_entries(self, constellation_slug: str, tle_entries: List[Dict], source: str) -> Tuple[int, int]:
        """Store TLE entries in the database."""
        # Get or create constellation
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            if constellation_slug not in self.constellations:
                print(f"[Store] Unknown constellation: {constellation_slug}")
                return (0, 0)
            
            config = self.constellations[constellation_slug]
            constellation = Constellation(
                name=config["name"],
                slug=constellation_slug,
                description=config.get("description", ""),
                celestrak_group=config.get("group", ""),
                color=config.get("color", "#FFFFFF"),
                tle_source_url=f"Source: {source}",
            )
            db.session.add(constellation)
            db.session.flush()
        
        new_count = 0
        updated_count = 0
        
        for entry in tle_entries:
            norad_id = entry.get("norad_id")
            if not norad_id:
                continue
            
            satellite = Satellite.query.filter_by(norad_id=norad_id).first()
            
            if satellite:
                # Update existing satellite
                old_epoch = satellite.tle_epoch
                
                if entry.get("name"):
                    satellite.name = entry["name"]
                if entry.get("line1"):
                    satellite.tle_line1 = entry["line1"]
                if entry.get("line2"):
                    satellite.tle_line2 = entry["line2"]
                if entry.get("epoch"):
                    satellite.tle_epoch = entry["epoch"]
                if entry.get("intl_designator"):
                    satellite.intl_designator = entry["intl_designator"]
                if entry.get("period_minutes"):
                    satellite.period_minutes = entry["period_minutes"]
                if entry.get("inclination"):
                    satellite.inclination = entry["inclination"]
                if entry.get("apogee_km"):
                    satellite.apogee_km = entry["apogee_km"]
                if entry.get("perigee_km"):
                    satellite.perigee_km = entry["perigee_km"]
                if entry.get("eccentricity"):
                    satellite.eccentricity = entry["eccentricity"]
                if entry.get("semi_major_axis_km"):
                    satellite.semi_major_axis_km = entry["semi_major_axis_km"]
                if entry.get("mean_motion"):
                    satellite.mean_motion = entry["mean_motion"]
                
                satellite.tle_updated_at = datetime.utcnow()
                satellite.constellation_id = constellation.id
                
                # Add to history if epoch changed
                if old_epoch != entry.get("epoch") and entry.get("line1") and entry.get("line2"):
                    try:
                        history = TLEHistory(
                            satellite_id=satellite.id,
                            tle_line1=entry["line1"],
                            tle_line2=entry["line2"],
                            epoch=entry.get("epoch"),
                            semi_major_axis_km=entry.get("semi_major_axis_km"),
                            mean_motion=entry.get("mean_motion"),
                            eccentricity=entry.get("eccentricity"),
                            inclination=entry.get("inclination"),
                            apogee_km=entry.get("apogee_km"),
                            perigee_km=entry.get("perigee_km"),
                        )
                        db.session.add(history)
                    except Exception:
                        pass
                
                updated_count += 1
            else:
                # Create new satellite
                satellite = Satellite(
                    norad_id=norad_id,
                    name=entry.get("name", f"Unknown-{norad_id}"),
                    constellation_id=constellation.id,
                    tle_line1=entry.get("line1"),
                    tle_line2=entry.get("line2"),
                    tle_epoch=entry.get("epoch"),
                    intl_designator=entry.get("intl_designator"),
                    period_minutes=entry.get("period_minutes"),
                    inclination=entry.get("inclination"),
                    apogee_km=entry.get("apogee_km"),
                    perigee_km=entry.get("perigee_km"),
                    eccentricity=entry.get("eccentricity"),
                    semi_major_axis_km=entry.get("semi_major_axis_km"),
                    mean_motion=entry.get("mean_motion"),
                    tle_updated_at=datetime.utcnow(),
                )
                db.session.add(satellite)
                new_count += 1
        
        # Update constellation satellite count
        constellation.satellite_count = Satellite.query.filter_by(
            constellation_id=constellation.id
        ).count()
        constellation.updated_at = datetime.utcnow()
        
        try:
            db.session.commit()
            print(f"[{source}] Stored {constellation_slug}: {new_count} new, {updated_count} updated")
        except Exception as e:
            db.session.rollback()
            print(f"[Store] Database error: {e}")
            return (0, 0)
        
        # Update Redis cache
        self._cache_constellation_tle(constellation_slug)
        
        return (new_count, updated_count)

    def get_all_tle(self) -> List[Dict]:
        """Get TLE data for all satellites in the database."""
        satellites = Satellite.query.all()
        return [sat.to_tle_dict() for sat in satellites]

    def update_all_constellations(self) -> Dict[str, Tuple[int, int]]:
        """
        Update TLE data for all configured constellations.
        """
        results = {}
        for slug in self.constellations:
            try:
                results[slug] = self.update_constellation_tle(slug)
            except Exception as e:
                print(f"Error updating {slug}: {e}")
                results[slug] = (0, 0)
        return results


# Singleton instance
tle_service = TLEService()
