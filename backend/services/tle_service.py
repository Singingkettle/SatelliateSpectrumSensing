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
import json
import time
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from threading import Lock

from models import db, Constellation, Satellite, TLEHistory, Launch
from config import Config
from sqlalchemy.exc import IntegrityError


from services.spacetrack_service import SpaceTrackService

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
    
    # ===== Space-Track.org API Compliance Settings =====
    # Reference: https://www.space-track.org/documentation
    #
    # RATE LIMITS:
    # - GP (TLEs): 1 query per hour max - add decay_date/null-val/epoch/>now-10 filter
    # - GP_HISTORY: Once per lifetime - store locally, never re-download
    # - SATCAT: 1 query per day after 1700 UTC
    # - General: 30 requests/minute, 300 requests/hour max
    #
    # BEST PRACTICES:
    # - Do NOT schedule scripts at :00 or :30 (peak times)
    # - Use comma-delimited NORAD IDs instead of individual queries
    # - Store all downloaded data locally
    # - Use epoch/>now-10 filter to get only propagable data
    #
    RATE_LIMIT_SECONDS = 3600          # 1 hour between Space-Track GP queries per constellation
    CELESTRAK_RATE_LIMIT = 60          # CelesTrak - 1 minute minimum
    SATCAT_RATE_LIMIT_SECONDS = 86400  # 24 hours between SATCAT queries
    HISTORY_RATE_LIMIT_SECONDS = 604800  # 7 days between history backfills per constellation
    MAX_REQUESTS_PER_MINUTE = 25       # Stay under 30/minute limit
    AUTO_FETCH_ENABLED = True          # Enable auto-fetch on missing data
    
    # History settings
    HISTORY_DAYS_DEFAULT = 365  # Keep 1 year of history by default
    
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
        self.celestrak_url = Config.CELESTRAK_BASE_URL
        self.supplemental_url = getattr(Config, "CELESTRAK_SUPPLEMENTAL_URL", None)
        self.constellations = Config.CONSTELLATIONS
        
        # Space-Track session
        self.spacetrack_url = Config.SPACETRACK_URL
        self.spacetrack_session = requests.Session()
        self._spacetrack_authenticated = False
        
        # Dedicated SpaceTrack Service for advanced history fetching
        self.spacetrack_service = SpaceTrackService()
        
        # Rate limiting
        self._rate_limit_lock = Lock()
        self._last_fetch_time = {}  # {slug: timestamp}

    def startup_check(self):
        """
        Perform startup checks for data integrity.
        1. Count satellites in each constellation.
        2. Log status - scheduler will handle any backfill.
        """
        print("[TLEService] performing startup check...")
        
        # Count satellites per constellation
        for slug in self.constellations.keys():
            constellation = Constellation.query.filter_by(slug=slug).first()
            if constellation:
                count = Satellite.query.filter_by(constellation_id=constellation.id).count()
                if count > 0:
                    print(f"[TLEService] {slug}: {count} satellites in database")
            
        print("[TLEService] Startup check complete. History backfill will run via scheduler.")

    def sync_constellation_history(self, constellation_slug: str, days: int = 365) -> int:
        """
        Check and backfill historical TLE data for a constellation.
        Downloads data from Space-Track for the last N days if missing.
        
        Args:
            constellation_slug: Constellation identifier
            days: Number of days of history to ensure (default 1 year)
            
        Returns:
            Number of new history records added
        """
        if not self._check_rate_limit(constellation_slug, 'spacetrack'):
            print(f"[TLEService] Skipping history sync for {constellation_slug} due to rate limits")
            return 0
            
        print(f"[TLEService] Checking history for {constellation_slug}...")
        
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            return 0
            
        # Get all satellites for this constellation
        satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
        if not satellites:
            return 0
            
        # Find satellites with insufficient history
        # (Simplified check: check if oldest record is older than `now - days`)
        target_start_date = datetime.utcnow() - timedelta(days=days)
        satellites_to_fetch = []
        
        for sat in satellites:
            oldest = TLEHistory.query.filter_by(satellite_id=sat.id)\
                .order_by(TLEHistory.epoch.asc()).first()
                
            # If no history, or oldest history is too recent (e.g. only have data from last week)
            if not oldest or oldest.epoch > target_start_date + timedelta(days=7):
                satellites_to_fetch.append(sat)
        
        if not satellites_to_fetch:
            print(f"[TLEService] History is up to date for {constellation_slug}")
            return 0
            
        print(f"[TLEService] Backfilling history for {len(satellites_to_fetch)} satellites in {constellation_slug}")
        
        # Fetch from Space-Track using bulk API
        norad_ids = [s.norad_id for s in satellites_to_fetch]
        history_data = self.spacetrack_service.get_bulk_history(
            norad_ids, 
            start_date=target_start_date
        )
        
        if not history_data:
            return 0
            
        # Save to DB
        count = self._save_bulk_history_to_db(history_data, constellation)
        
        # Update rate limit only after successful fetch
        self._update_rate_limit(constellation_slug, 'spacetrack')
        
        return count

    def sync_catalog_from_spacetrack(self, constellation_slug: str) -> Dict[str, int]:
        """
        Sync FULL satellite catalog from Space-Track for a constellation.
        This fetches ALL objects (active and decayed) to ensure complete history.
        
        IMPORTANT: Per Space-Track documentation, SATCAT should only be queried
        once per day after 1700 UTC. This method includes rate limiting.
        """
        if constellation_slug not in self.constellations:
            return {'error': 'Unknown constellation'}
        
        # Check rate limit for SATCAT queries (once per day)
        rate_key = f"satcat:{constellation_slug}"
        with self._rate_limit_lock:
            last_time = self._last_fetch_time.get(rate_key, 0)
            if time.time() - last_time < self.SATCAT_RATE_LIMIT_SECONDS:
                remaining_hours = int((self.SATCAT_RATE_LIMIT_SECONDS - (time.time() - last_time)) / 3600)
                print(f"[TLEService] SATCAT rate limited for {constellation_slug}, {remaining_hours}h remaining")
                return {'error': f'SATCAT rate limited, try again in {remaining_hours}h', 'rate_limited': True}
            
        config = self.constellations[constellation_slug]
        query = config.get('spacetrack_query')
        if not query:
            return {'error': 'No Space-Track query configured'}
            
        print(f"[TLEService] Syncing full catalog for {constellation_slug} using query: {query}")
        print(f"[TLEService] NOTE: SATCAT query should only run once/day per Space-Track policy")
        
        # Query Space-Track
        satcat_data = self.spacetrack_service.query_satcat(query)
        if not satcat_data:
            print(f"[TLEService] No catalog data returned for {constellation_slug}")
            return {'count': 0, 'new': 0, 'updated': 0}
        
        # Update rate limit timestamp
        with self._rate_limit_lock:
            self._last_fetch_time[rate_key] = time.time()
            
        print(f"[TLEService] Processing {len(satcat_data)} catalog records for {constellation_slug}")
        
        # Get Constellation ID
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            # Should have been created by now, but just in case
            return {'error': 'Constellation not found in DB'}

        # Process
        count_new = 0
        count_updated = 0
        count_launches = 0
        
        try:
            # Filter valid items first
            valid_items = [i for i in satcat_data if i.get('NORAD_CAT_ID')]

            # Preload existing satellites for this constellation to minimize queries
            # We also check global NORAD IDs to avoid dupes if they were unassigned
            existing_sats = Satellite.query.filter(
                (Satellite.constellation_id == constellation.id) | 
                (Satellite.norad_id.in_([int(i['NORAD_CAT_ID']) for i in valid_items]))
            ).all()
            sat_map = {s.norad_id: s for s in existing_sats}
            
            # Preload Launches
            cospars = {
                item.get('INTLDES', '')[:8]
                for item in valid_items
                if item.get('INTLDES')
            }
            existing_launches = Launch.query.filter(Launch.cospar_id.in_(list(cospars))).all() if cospars else []
            launch_map = {l.cospar_id: l for l in existing_launches}
            
            for item in valid_items:
                norad_id = int(item['NORAD_CAT_ID'])
                satellite = sat_map.get(norad_id)
                
                # Create Satellite if missing
                if not satellite:
                    satellite = Satellite(
                        norad_id=norad_id,
                        name=item.get('SATNAME', f"Unknown-{norad_id}"),
                        constellation_id=constellation.id,
                        is_active=item.get('DECAY') is None
                    )
                    db.session.add(satellite)
                    sat_map[norad_id] = satellite # Add to map for subsequent updates
                    count_new += 1
                else:
                    # Ensure constellation link
                    if satellite.constellation_id != constellation.id:
                        satellite.constellation_id = constellation.id
                        count_updated += 1
                
                # Update Satellite Metadata
                if item.get('SATNAME'):
                    satellite.name = item['SATNAME']
                if item.get('INTLDES'):
                    satellite.intl_designator = item['INTLDES']
                if item.get('LAUNCH'):
                    satellite.launch_date = datetime.strptime(item['LAUNCH'], '%Y-%m-%d').date()
                if item.get('DECAY'):
                    satellite.decay_date = datetime.strptime(item['DECAY'], '%Y-%m-%d').date()
                    satellite.is_active = False
                if item.get('COUNTRY'):
                    satellite.country_code = item['COUNTRY']
                if item.get('RCS'): # Radar Cross Section
                    satellite.rcs_size = item['RCS']
                if item.get('OBJECT_TYPE'):
                    satellite.object_type = item['OBJECT_TYPE']

                # Handle Launch Link
                intldes = item.get('INTLDES', '')
                launch_cospar = intldes[:8] if len(intldes) >= 8 else intldes
                
                if launch_cospar:
                    launch = launch_map.get(launch_cospar)
                    if not launch:
                        try:
                            with db.session.begin_nested():
                                launch = Launch(
                                    cospar_id=launch_cospar,
                                    mission_name=item.get('SATNAME'),
                                    launch_date=satellite.launch_date and datetime.combine(satellite.launch_date, datetime.min.time()),
                                    launch_site=item.get('SITE'),
                                )
                                db.session.add(launch)
                                db.session.flush()
                                count_launches += 1
                            launch_map[launch_cospar] = launch
                        except IntegrityError:
                            db.session.rollback()
                            launch = Launch.query.filter_by(cospar_id=launch_cospar).first()
                            if launch:
                                launch_map[launch_cospar] = launch
                    
                    if launch:
                        satellite.launch_id = launch.id

            db.session.commit()
            print(f"[TLEService] Catalog sync for {constellation_slug}: {count_new} new, {count_updated} updated, {count_launches} launches")
            return {'count': len(satcat_data), 'new': count_new, 'updated': count_updated, 'launches': count_launches}
            
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] Catalog sync error: {e}")
            return {'error': str(e)}

    def sync_satellite_history(self, norad_id: int, days: int = 365) -> int:
        """
        Backfill history for a specific satellite.
        Creates the satellite if it doesn't exist.
        """
        satellite = Satellite.query.filter_by(norad_id=norad_id).first()
        
        # If missing, try to create it from Space-Track latest TLE
        if not satellite:
            print(f"[TLEService] Satellite {norad_id} not found, fetching metadata...")
            latest_tle_list = self.spacetrack_service.get_latest_tle_by_norad([norad_id])
            if not latest_tle_list:
                print(f"[TLEService] Could not find satellite {norad_id} in Space-Track")
                return 0
            
            latest_tle = latest_tle_list[0]
            satellite = Satellite(
                norad_id=norad_id,
                name=latest_tle.get('OBJECT_NAME', f'Unknown-{norad_id}'),
                tle_line1=latest_tle.get('TLE_LINE1'),
                tle_line2=latest_tle.get('TLE_LINE2'),
                intl_designator=latest_tle.get('INTLDES'),
                is_active=True
            )
            # Try to parse epoch
            try:
                if latest_tle.get('EPOCH'):
                    satellite.tle_epoch = datetime.strptime(latest_tle['EPOCH'], '%Y-%m-%dT%H:%M:%S.%f') if '.' in latest_tle['EPOCH'] else datetime.strptime(latest_tle['EPOCH'], '%Y-%m-%dT%H:%M:%S')
            except:
                pass
                
            db.session.add(satellite)
            db.session.commit()
            
        # Fetch history
        print(f"[TLEService] Fetching history for satellite {norad_id} ({days} days)...")
        target_start_date = datetime.utcnow() - timedelta(days=days)
        history_data = self.spacetrack_service.get_bulk_history([norad_id], start_date=target_start_date)
        
        if not history_data:
            return 0
            
        # Save history
        count = 0
        try:
            for item in history_data:
                # Parse epoch
                try:
                    epoch_str = item.get('EPOCH')
                    epoch = datetime.strptime(epoch_str, '%Y-%m-%dT%H:%M:%S.%f') if '.' in epoch_str else datetime.strptime(epoch_str, '%Y-%m-%dT%H:%M:%S')
                except:
                    continue
                    
                # Check duplicates
                exists = TLEHistory.query.filter_by(
                    satellite_id=satellite.id, 
                    epoch=epoch
                ).first()
                
                if not exists:
                    history = TLEHistory(
                        satellite_id=satellite.id,
                        tle_line1=item.get('TLE_LINE1'),
                        tle_line2=item.get('TLE_LINE2'),
                        epoch=epoch,
                        source='SpaceTrack_Manual',
                        mean_motion=float(item.get('MEAN_MOTION', 0)),
                        eccentricity=float(item.get('ECCENTRICITY', 0)),
                        inclination=float(item.get('INCLINATION', 0)),
                        semi_major_axis_km=float(item.get('SEMIMAJOR_AXIS', 0)),
                        apogee_km=float(item.get('APOAPSIS', 0)),
                        perigee_km=float(item.get('PERIAPSIS', 0))
                    )
                    db.session.add(history)
                    count += 1
            
            db.session.commit()
            print(f"[TLEService] Saved {count} history records for satellite {norad_id}")
            return count
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] Error saving satellite history: {e}")
            return 0

    def update_satcat_data(self, constellation_slug: str) -> Dict[str, int]:
        """
        Fetch and update SATCAT data (launch info, decay date) for a constellation.
        This enriches the satellite data with launch details.
        """
        print(f"[TLEService] Updating SATCAT data for {constellation_slug}...")
        
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            return {'updated': 0, 'launches': 0}
            
        satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
        if not satellites:
            return {'updated': 0, 'launches': 0}
            
        # Get list of NORAD IDs
        norad_ids = [s.norad_id for s in satellites]
        
        # Fetch SATCAT data from Space-Track service
        satcat_data = self.spacetrack_service.get_satcat_data(norad_ids)
        
        if not satcat_data:
            print(f"[TLEService] No SATCAT data returned for {constellation_slug}")
            return {'updated': 0, 'launches': 0}
            
        print(f"[TLEService] Processing {len(satcat_data)} SATCAT records for {constellation_slug}")
        
        # Process and update
        count_updated = 0
        count_launches = 0
        
        try:
            # Map NORAD ID to Satellite object for quick lookup
            sat_map = {s.norad_id: s for s in satellites}
            # Preload existing launches to avoid duplicate inserts
            cospars = {
                item.get('INTLDES', '')[:8]
                for item in satcat_data
                if item.get('INTLDES')
            }
            existing_launches = Launch.query.filter(Launch.cospar_id.in_(list(cospars))).all() if cospars else []
            launch_map = {l.cospar_id: l for l in existing_launches}
            
            for item in satcat_data:
                norad_id = int(item.get('NORAD_CAT_ID'))
                satellite = sat_map.get(norad_id)
                
                if not satellite:
                    continue
                    
                # Handle Launch Info
                intldes = item.get('INTLDES', '') # e.g., 2024-012A
                
                # Launch ID is usually the first part of INTLDES (YYYY-NNN)
                # But sometimes it varies. Let's use the full INTLDES as COSPAR for the satellite, 
                # but group launches by the base ID (without piece code).
                launch_cospar = intldes[:8] if len(intldes) >= 8 else intldes # 2024-012
                
                if launch_cospar:
                    # Find or create Launch
                    launch = launch_map.get(launch_cospar)
                    if not launch:
                        try:
                            with db.session.begin_nested():
                                launch = Launch(
                                    cospar_id=launch_cospar,
                                    mission_name=item.get('SATNAME'), # Fallback mission name from first sat
                                    launch_date=datetime.strptime(item.get('LAUNCH'), '%Y-%m-%d') if item.get('LAUNCH') else None,
                                    launch_site=item.get('SITE'),
                                    # We might need better source for rocket type/mission name
                                )
                                db.session.add(launch)
                                db.session.flush() # Get ID
                                count_launches += 1
                            launch_map[launch_cospar] = launch
                        except IntegrityError:
                            db.session.rollback()
                            launch = Launch.query.filter_by(cospar_id=launch_cospar).first()
                            if launch:
                                launch_map[launch_cospar] = launch
                    
                    satellite.launch_id = launch.id
                
                # Update Satellite fields
                if item.get('LAUNCH'):
                    satellite.launch_date = datetime.strptime(item.get('LAUNCH'), '%Y-%m-%d').date()
                
                if item.get('DECAY'):
                    satellite.decay_date = datetime.strptime(item.get('DECAY'), '%Y-%m-%d').date()
                    satellite.is_active = False # Decayed means inactive
                
                if item.get('SITE'):
                    satellite.country_code = item.get('COUNTRY')
                
                count_updated += 1
                
            db.session.commit()
            print(f"[TLEService] Updated SATCAT for {count_updated} satellites, created {count_launches} launches")
            return {'updated': count_updated, 'launches': count_launches}
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] Error updating SATCAT: {e}")
            return {'updated': 0, 'launches': 0}

    def _save_bulk_history_to_db(self, tle_list: List[Dict], constellation: Constellation) -> int:
        """
        Save a bulk list of TLEs (from Space-Track GP format) to TLEHistory.
        """
        count = 0
        try:
            # Pre-fetch satellite map for faster lookups {norad_id: satellite_obj}
            satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
            sat_map = {s.norad_id: s for s in satellites}
            
            for item in tle_list:
                if not item.get('NORAD_CAT_ID'):
                    continue

                norad_id = int(item.get('NORAD_CAT_ID'))
                satellite = sat_map.get(norad_id)
                
                if not satellite:
                    continue
                    
                epoch = datetime.strptime(item.get('EPOCH'), '%Y-%m-%dT%H:%M:%S.%f') if '.' in item.get('EPOCH') else datetime.strptime(item.get('EPOCH'), '%Y-%m-%dT%H:%M:%S')
                
                # Check if this specific TLE already exists to avoid dupes
                exists = TLEHistory.query.filter_by(
                    satellite_id=satellite.id, 
                    epoch=epoch
                ).first()
                
                if not exists:
                    history = TLEHistory(
                        satellite_id=satellite.id,
                        tle_line1=item.get('TLE_LINE1'),
                        tle_line2=item.get('TLE_LINE2'),
                        epoch=epoch,
                        source='SpaceTrack_Backfill',
                        # Optional params
                        mean_motion=float(item.get('MEAN_MOTION', 0)),
                        eccentricity=float(item.get('ECCENTRICITY', 0)),
                        inclination=float(item.get('INCLINATION', 0)),
                        semi_major_axis_km=float(item.get('SEMIMAJOR_AXIS', 0)),
                        apogee_km=float(item.get('APOAPSIS', 0)),
                        perigee_km=float(item.get('PERIAPSIS', 0))
                    )
                    db.session.add(history)
                    count += 1
            
            db.session.commit()
            print(f"[TLEService] Saved {count} historical records")
            return count
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] Error saving bulk history: {e}")
            return 0

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
                        source=source,
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
        
        # Trigger SATCAT update to enrich data (Launch info, decay)
        # We do this after TLE update
        if new_count > 0 or updated_count > 0:
            try:
                self.update_satcat_data(constellation_slug)
            except Exception as e:
                print(f"[TLEService] Failed to trigger SATCAT update: {e}")
                
        return new_count, updated_count

    def _cache_constellation_tle(self, constellation_slug: str):
        """No-op: caching removed. Data is served directly from SQLite."""
        pass

    def get_constellation_tle(self, constellation_slug: str, auto_fetch: bool = True) -> List[Dict]:
        """
        Get TLE data for a constellation from SQLite database.
        If auto_fetch is True and data is missing, automatically fetch from external sources.
        
        Multi-source strategy:
        1. Check database
        2. If empty and auto_fetch enabled: fetch from api2 → SpaceTrack → CelesTrak
        """
        # 1. Check database first
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if constellation:
            satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
            if satellites:
                return [sat.to_tle_dict() for sat in satellites]
        
        # 2. Auto-fetch if enabled and data is missing
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
                        return [sat.to_tle_dict() for sat in satellites]
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
