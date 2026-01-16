"""
TLE (Two-Line Element) Data Service

Handles fetching, parsing, and storing satellite TLE data.
Uses Space-Track.org as the ONLY data source.

Features:
- Constellation TLE updates
- Historical TLE data backfill
- SATCAT metadata synchronization
- Orbital parameter calculations
"""

import math
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from threading import Lock

from models import db, Constellation, Satellite, TLEHistory, Launch
from config import Config
from sqlalchemy.exc import IntegrityError

from services.spacetrack_service import spacetrack_service


class TLEService:
    """
    Service for managing TLE data from Space-Track.org (exclusive source).
    
    Responsibilities:
    - Fetch and update TLE data for constellations
    - Sync SATCAT metadata (launch dates, decay dates, etc.)
    - Backfill historical TLE data
    - Parse TLE text and calculate orbital parameters
    """

    # Earth constants for orbital calculations
    EARTH_RADIUS_KM = 6378.137
    EARTH_MU = 398600.4418  # km^3/s^2
    
    # Rate limiting (managed by SpaceTrackService, but we track per-constellation)
    RATE_LIMIT_SECONDS = 3600          # 1 hour between same GP queries
    SATCAT_RATE_LIMIT_SECONDS = 86400  # 24 hours between SATCAT queries
    HISTORY_RATE_LIMIT_SECONDS = 604800  # 7 days between history backfills
    
    # History settings
    HISTORY_DAYS_DEFAULT = Config.HISTORY_DAYS_DEFAULT
    HISTORY_BATCH_SIZE = Config.HISTORY_BATCH_SIZE

    def __init__(self):
        self.constellations = Config.CONSTELLATIONS
        self._rate_limit_lock = Lock()
        self._last_fetch_time = {}  # {key: timestamp}

    # ==================== Rate Limiting ====================
    
    def _check_rate_limit(self, key: str, limit_seconds: int) -> bool:
        """Check if we can make another API call."""
        with self._rate_limit_lock:
            last_time = self._last_fetch_time.get(key, 0)
            current_time = time.time()
            
            if current_time - last_time < limit_seconds:
                remaining = int(limit_seconds - (current_time - last_time))
                print(f"[TLEService] Rate limited for {key}: {remaining}s remaining", flush=True)
                return False
            return True
    
    def _update_rate_limit(self, key: str):
        """Update the last fetch time for rate limiting."""
        with self._rate_limit_lock:
            self._last_fetch_time[key] = time.time()

    # ==================== Constellation Management ====================

    def get_or_create_constellation(self, slug: str) -> Optional[Constellation]:
        """Get or create a constellation record."""
        if slug not in self.constellations:
            return None
        
        constellation = Constellation.query.filter_by(slug=slug).first()
        
        if not constellation:
            config = self.constellations[slug]
            constellation = Constellation(
                name=config["name"],
                slug=slug,
                description=config.get("description", ""),
                celestrak_group=config.get("group", ""),
                color=config.get("color", "#FFFFFF"),
                tle_source_url=f"{Config.SPACETRACK_URL}/basicspacedata/query/class/gp/",
            )
            db.session.add(constellation)
            db.session.flush()
        
        return constellation

    # ==================== TLE Fetching & Updating ====================

    def update_constellation_tle(self, constellation_slug: str) -> Tuple[int, int]:
        """
        Update TLE data for a constellation from Space-Track.
        
        Args:
            constellation_slug: Constellation identifier
        
        Returns:
            Tuple of (new_count, updated_count)
        """
        if constellation_slug not in self.constellations:
            raise ValueError(f"Unknown constellation: {constellation_slug}")
        
        # Check rate limit
        rate_key = f"gp:{constellation_slug}"
        if not self._check_rate_limit(rate_key, self.RATE_LIMIT_SECONDS):
            print(f"[TLEService] Skipping {constellation_slug} due to rate limit", flush=True)
            return (0, 0)
        
        config = self.constellations[constellation_slug]
        query = config.get('spacetrack_query')
        
        if not query:
            print(f"[TLEService] No Space-Track query configured for {constellation_slug}", flush=True)
            return (0, 0)
        
        print(f"[TLEService] Updating TLE for {constellation_slug}...", flush=True)
        
        # Fetch GP data from Space-Track
        try:
            gp_data = spacetrack_service.get_gp_data(query, constellation_slug)
        except Exception as e:
            print(f"[TLEService] Error fetching GP data: {e}", flush=True)
            return (0, 0)
        
        if not gp_data:
            print(f"[TLEService] No GP data returned for {constellation_slug}", flush=True)
            return (0, 0)
        
        # Update rate limit after successful fetch
        self._update_rate_limit(rate_key)
        
        # Get or create constellation
        constellation = self.get_or_create_constellation(constellation_slug)
        if not constellation:
            return (0, 0)
        
        # Process and store data
        new_count, updated_count = self._store_gp_data(gp_data, constellation)
        
        # Update constellation satellite count
        constellation.satellite_count = Satellite.query.filter_by(
            constellation_id=constellation.id
        ).count()
        constellation.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        print(f"[TLEService] {constellation_slug}: {new_count} new, {updated_count} updated")
        return (new_count, updated_count)

    def _store_gp_data(self, gp_data: List[Dict], constellation: Constellation) -> Tuple[int, int]:
        """
        Store GP data in the database.
        
        Args:
            gp_data: List of GP records from Space-Track
            constellation: Constellation object
        
        Returns:
            Tuple of (new_count, updated_count)
        """
        new_count = 0
        updated_count = 0
        
        for record in gp_data:
            norad_id = record.get('NORAD_CAT_ID')
            if not norad_id:
                continue
            
            norad_id = int(norad_id)
            
            # Parse epoch
            epoch = self._parse_epoch(record.get('EPOCH'))
            
            # Calculate period from mean motion
            mean_motion = float(record.get('MEAN_MOTION', 0))
            period_minutes = 1440.0 / mean_motion if mean_motion > 0 else None
            
            # Get existing satellite or create new
            satellite = Satellite.query.filter_by(norad_id=norad_id).first()
            
            if satellite:
                old_epoch = satellite.tle_epoch
                
                # Update satellite
                satellite.name = record.get('OBJECT_NAME', satellite.name)
                satellite.tle_line1 = record.get('TLE_LINE1')
                satellite.tle_line2 = record.get('TLE_LINE2')
                satellite.tle_epoch = epoch
                satellite.intl_designator = record.get('INTLDES')
                satellite.period_minutes = period_minutes
                satellite.inclination = float(record.get('INCLINATION', 0))
                satellite.apogee_km = float(record.get('APOAPSIS', 0))
                satellite.perigee_km = float(record.get('PERIAPSIS', 0))
                satellite.eccentricity = float(record.get('ECCENTRICITY', 0))
                satellite.semi_major_axis_km = float(record.get('SEMIMAJOR_AXIS', 0))
                satellite.mean_motion = mean_motion
                satellite.tle_updated_at = datetime.utcnow()
                satellite.constellation_id = constellation.id
                
                # Add to history if epoch changed
                if old_epoch != epoch and record.get('TLE_LINE1') and record.get('TLE_LINE2'):
                    self._add_to_history(satellite, record, epoch, 'SpaceTrack_Update')
                
                updated_count += 1
            else:
                # Create new satellite
                satellite = Satellite(
                    norad_id=norad_id,
                    name=record.get('OBJECT_NAME', f"Unknown-{norad_id}"),
                    constellation_id=constellation.id,
                    tle_line1=record.get('TLE_LINE1'),
                    tle_line2=record.get('TLE_LINE2'),
                    tle_epoch=epoch,
                    intl_designator=record.get('INTLDES'),
                    period_minutes=period_minutes,
                    inclination=float(record.get('INCLINATION', 0)),
                    apogee_km=float(record.get('APOAPSIS', 0)),
                    perigee_km=float(record.get('PERIAPSIS', 0)),
                    eccentricity=float(record.get('ECCENTRICITY', 0)),
                    semi_major_axis_km=float(record.get('SEMIMAJOR_AXIS', 0)),
                    mean_motion=mean_motion,
                    tle_updated_at=datetime.utcnow(),
                )
                db.session.add(satellite)
                new_count += 1
        
        return (new_count, updated_count)

    def _add_to_history(self, satellite: Satellite, record: Dict, epoch: datetime, source: str):
        """Add a TLE record to history."""
        try:
            mean_motion = float(record.get('MEAN_MOTION', 0))
            period_minutes = 1440.0 / mean_motion if mean_motion > 0 else None
            
            history = TLEHistory(
                satellite_id=satellite.id,
                tle_line1=record.get('TLE_LINE1'),
                tle_line2=record.get('TLE_LINE2'),
                epoch=epoch,
                source=source,
                semi_major_axis_km=float(record.get('SEMIMAJOR_AXIS', 0)),
                mean_motion=mean_motion,
                eccentricity=float(record.get('ECCENTRICITY', 0)),
                inclination=float(record.get('INCLINATION', 0)),
                apogee_km=float(record.get('APOAPSIS', 0)),
                perigee_km=float(record.get('PERIAPSIS', 0)),
                period_minutes=period_minutes,
                bstar=float(record.get('BSTAR', 0)),
                mean_anomaly=float(record.get('MEAN_ANOMALY', 0)),
                raan=float(record.get('RA_OF_ASC_NODE', 0)),
                arg_of_perigee=float(record.get('ARG_OF_PERICENTER', 0)),
            )
            db.session.add(history)
        except Exception as e:
            print(f"[TLEService] Error adding to history: {e}")

    # ==================== SATCAT Sync ====================

    def sync_catalog_from_spacetrack(self, constellation_slug: str) -> Dict[str, int]:
        """
        Sync FULL satellite catalog from Space-Track for a constellation.
        Fetches ALL objects (active and decayed) for complete history.
        
        Args:
            constellation_slug: Constellation identifier
        
        Returns:
            Dict with sync statistics
        """
        if constellation_slug not in self.constellations:
            return {'error': 'Unknown constellation'}
        
        # Check rate limit
        rate_key = f"satcat:{constellation_slug}"
        if not self._check_rate_limit(rate_key, self.SATCAT_RATE_LIMIT_SECONDS):
            remaining_hours = int((self.SATCAT_RATE_LIMIT_SECONDS - 
                (time.time() - self._last_fetch_time.get(rate_key, 0))) / 3600)
            return {'error': f'SATCAT rate limited, try in {remaining_hours}h', 'rate_limited': True}
        
        config = self.constellations[constellation_slug]
        query = config.get('spacetrack_query')
        
        if not query:
            return {'error': 'No Space-Track query configured'}
        
        print(f"[TLEService] Syncing SATCAT for {constellation_slug}...")
        
        # Query Space-Track SATCAT
        satcat_data = spacetrack_service.query_satcat(query, constellation_slug)
        
        if not satcat_data:
            return {'count': 0, 'new': 0, 'updated': 0}
        
        # Update rate limit
        self._update_rate_limit(rate_key)
        
        # Get or create constellation
        constellation = self.get_or_create_constellation(constellation_slug)
        if not constellation:
            return {'error': 'Failed to create constellation'}
        
        # Process SATCAT data
        return self._process_satcat_data(satcat_data, constellation)

    def _process_satcat_data(self, satcat_data: List[Dict], 
                            constellation: Constellation) -> Dict[str, int]:
        """Process and store SATCAT data."""
        count_new = 0
        count_updated = 0
        count_launches = 0
        
        try:
            # Filter valid items
            valid_items = [i for i in satcat_data if i.get('NORAD_CAT_ID')]
            
            # Preload existing satellites
            norad_ids = [int(i['NORAD_CAT_ID']) for i in valid_items]
            existing_sats = Satellite.query.filter(
                Satellite.norad_id.in_(norad_ids)
            ).all()
            sat_map = {s.norad_id: s for s in existing_sats}
            
            # Preload launches
            cospars = {
                item.get('INTLDES', '')[:8]
                for item in valid_items
                if item.get('INTLDES')
            }
            existing_launches = Launch.query.filter(
                Launch.cospar_id.in_(list(cospars))
            ).all() if cospars else []
            launch_map = {l.cospar_id: l for l in existing_launches}
            
            for item in valid_items:
                norad_id = int(item['NORAD_CAT_ID'])
                satellite = sat_map.get(norad_id)
                
                # Create satellite if missing
                if not satellite:
                    satellite = Satellite(
                        norad_id=norad_id,
                        name=item.get('SATNAME', f"Unknown-{norad_id}"),
                        constellation_id=constellation.id,
                        is_active=item.get('DECAY') is None
                    )
                    db.session.add(satellite)
                    sat_map[norad_id] = satellite
                    count_new += 1
                else:
                    # Ensure constellation link
                    if satellite.constellation_id != constellation.id:
                        satellite.constellation_id = constellation.id
                        count_updated += 1
                
                # Update metadata
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
                if item.get('RCS'):
                    satellite.rcs_size = item['RCS']
                if item.get('OBJECT_TYPE'):
                    satellite.object_type = item['OBJECT_TYPE']
                
                # Handle launch link
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
                                    launch_date=datetime.combine(
                                        satellite.launch_date, datetime.min.time()
                                    ) if satellite.launch_date else None,
                                    launch_site=item.get('SITE'),
                                    data_source='SpaceTrack_SATCAT',
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
            
            print(f"[TLEService] SATCAT sync: {count_new} new, {count_updated} updated, {count_launches} launches")
            return {'count': len(satcat_data), 'new': count_new, 'updated': count_updated, 'launches': count_launches}
            
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] SATCAT sync error: {e}")
            return {'error': str(e)}

    # ==================== History Backfill ====================

    def sync_constellation_history(self, constellation_slug: str, days: int = None) -> int:
        """
        Backfill historical TLE data for a constellation.
        
        Args:
            constellation_slug: Constellation identifier
            days: Number of days of history (default: config value)
        
        Returns:
            Number of new history records added
        """
        days = days or self.HISTORY_DAYS_DEFAULT
        
        # Check rate limit
        rate_key = f"history:{constellation_slug}"
        if not self._check_rate_limit(rate_key, self.HISTORY_RATE_LIMIT_SECONDS):
            print(f"[TLEService] Skipping history backfill for {constellation_slug} due to rate limit")
            return 0
        
        print(f"[TLEService] Backfilling history for {constellation_slug} ({days} days)...")
        
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        if not constellation:
            return 0
        
        # Get all satellites
        satellites = Satellite.query.filter_by(constellation_id=constellation.id).all()
        if not satellites:
            return 0
        
        # Find satellites needing history
        target_start = datetime.utcnow() - timedelta(days=days)
        satellites_to_fetch = []
        
        for sat in satellites:
            oldest = TLEHistory.query.filter_by(satellite_id=sat.id)\
                .order_by(TLEHistory.epoch.asc()).first()
            
            if not oldest or oldest.epoch > target_start + timedelta(days=7):
                satellites_to_fetch.append(sat)
        
        if not satellites_to_fetch:
            print(f"[TLEService] History up to date for {constellation_slug}")
            return 0
        
        print(f"[TLEService] Backfilling {len(satellites_to_fetch)} satellites...")
        
        # Fetch history in batches
        norad_ids = [s.norad_id for s in satellites_to_fetch]
        history_data = spacetrack_service.get_gp_history(
            norad_ids, 
            start_date=target_start,
            constellation=constellation_slug
        )
        
        if not history_data:
            return 0
        
        # Update rate limit
        self._update_rate_limit(rate_key)
        
        # Save to database
        count = self._save_history_data(history_data, satellites_to_fetch)
        
        return count

    def _save_history_data(self, history_data: List[Dict], 
                           satellites: List[Satellite]) -> int:
        """Save historical TLE data to database."""
        count = 0
        sat_map = {s.norad_id: s for s in satellites}
        
        try:
            for record in history_data:
                norad_id = record.get('NORAD_CAT_ID')
                if not norad_id:
                    continue
                
                norad_id = int(norad_id)
                satellite = sat_map.get(norad_id)
                if not satellite:
                    continue
                
                epoch = self._parse_epoch(record.get('EPOCH'))
                if not epoch:
                    continue
                
                # Check for duplicates
                exists = TLEHistory.query.filter_by(
                    satellite_id=satellite.id,
                    epoch=epoch
                ).first()
                
                if not exists:
                    mean_motion = float(record.get('MEAN_MOTION', 0))
                    period_minutes = 1440.0 / mean_motion if mean_motion > 0 else None
                    
                    history = TLEHistory(
                        satellite_id=satellite.id,
                        tle_line1=record.get('TLE_LINE1'),
                        tle_line2=record.get('TLE_LINE2'),
                        epoch=epoch,
                        source='SpaceTrack_Backfill',
                        semi_major_axis_km=float(record.get('SEMIMAJOR_AXIS', 0)),
                        mean_motion=mean_motion,
                        eccentricity=float(record.get('ECCENTRICITY', 0)),
                        inclination=float(record.get('INCLINATION', 0)),
                        apogee_km=float(record.get('APOAPSIS', 0)),
                        perigee_km=float(record.get('PERIAPSIS', 0)),
                        period_minutes=period_minutes,
                        bstar=float(record.get('BSTAR', 0)),
                        mean_anomaly=float(record.get('MEAN_ANOMALY', 0)),
                        raan=float(record.get('RA_OF_ASC_NODE', 0)),
                        arg_of_perigee=float(record.get('ARG_OF_PERICENTER', 0)),
                    )
                    db.session.add(history)
                    count += 1
            
            db.session.commit()
            print(f"[TLEService] Saved {count} history records")
            
        except Exception as e:
            db.session.rollback()
            print(f"[TLEService] Error saving history: {e}")
        
        return count

    def sync_satellite_history(self, norad_id: int, days: int = None) -> int:
        """Backfill history for a specific satellite."""
        days = days or self.HISTORY_DAYS_DEFAULT
        
        satellite = Satellite.query.filter_by(norad_id=norad_id).first()
        
        # Create satellite if not exists
        if not satellite:
            print(f"[TLEService] Satellite {norad_id} not found, fetching metadata...")
            latest_tle = spacetrack_service.get_latest_tle_by_norad([norad_id])
            if not latest_tle:
                return 0
            
            record = latest_tle[0]
            satellite = Satellite(
                norad_id=norad_id,
                name=record.get('OBJECT_NAME', f'Unknown-{norad_id}'),
                tle_line1=record.get('TLE_LINE1'),
                tle_line2=record.get('TLE_LINE2'),
                tle_epoch=self._parse_epoch(record.get('EPOCH')),
                intl_designator=record.get('INTLDES'),
                is_active=True
            )
            db.session.add(satellite)
            db.session.commit()
        
        # Fetch history
        target_start = datetime.utcnow() - timedelta(days=days)
        history_data = spacetrack_service.get_gp_history([norad_id], target_start)
        
        if not history_data:
            return 0
        
        return self._save_history_data(history_data, [satellite])

    # ==================== Data Access ====================

    def get_constellation_tle(self, constellation_slug: str, 
                              auto_fetch: bool = True) -> List[Dict]:
        """
        Get TLE data for a constellation.
        
        Args:
            constellation_slug: Constellation identifier
            auto_fetch: If True, fetch from Space-Track if data is missing
        
        Returns:
            List of satellite TLE dictionaries
        """
        constellation = Constellation.query.filter_by(slug=constellation_slug).first()
        
        if constellation:
            satellites = Satellite.query.filter_by(
                constellation_id=constellation.id
            ).all()
            if satellites:
                return [sat.to_tle_dict() for sat in satellites]
        
        # Auto-fetch if enabled and data missing
        if auto_fetch and constellation_slug in self.constellations:
            print(f"[TLEService] Auto-fetching {constellation_slug}...")
            try:
                self.update_constellation_tle(constellation_slug)
                
                constellation = Constellation.query.filter_by(slug=constellation_slug).first()
                if constellation:
                    satellites = Satellite.query.filter_by(
                        constellation_id=constellation.id
                    ).all()
                    return [sat.to_tle_dict() for sat in satellites]
            except Exception as e:
                print(f"[TLEService] Auto-fetch error: {e}")
        
        return []

    def get_all_tle(self) -> List[Dict]:
        """Get TLE data for all satellites."""
        satellites = Satellite.query.all()
        return [sat.to_tle_dict() for sat in satellites]

    def update_all_constellations(self) -> Dict[str, Tuple[int, int]]:
        """Update TLE data for all configured constellations."""
        results = {}
        
        for slug in self.constellations:
            try:
                results[slug] = self.update_constellation_tle(slug)
            except Exception as e:
                print(f"[TLEService] Error updating {slug}: {e}")
                results[slug] = (0, 0)
        
        return results

    # ==================== TLE Parsing Utilities ====================

    def _parse_epoch(self, epoch_str: str) -> Optional[datetime]:
        """Parse epoch from Space-Track format."""
        if not epoch_str:
            return None
        
        try:
            if '.' in epoch_str:
                return datetime.strptime(epoch_str, '%Y-%m-%dT%H:%M:%S.%f')
            else:
                return datetime.strptime(epoch_str, '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return None

    def parse_tle_epoch(self, line1: str) -> Optional[datetime]:
        """Parse epoch from TLE line 1 format."""
        try:
            epoch_str = line1[18:32].strip()
            year_2digit = int(epoch_str[:2])
            day_fraction = float(epoch_str[2:])
            
            year = 2000 + year_2digit if year_2digit < 57 else 1900 + year_2digit
            
            return datetime(year, 1, 1) + timedelta(days=day_fraction - 1)
        except (ValueError, IndexError):
            return None

    def parse_tle_text(self, tle_text: str) -> List[Dict]:
        """Parse raw TLE text into structured list."""
        lines = [line.strip() for line in tle_text.strip().split("\n") if line.strip()]
        tle_dict = {}
        
        i = 0
        while i < len(lines) - 2:
            if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
                name = lines[i].strip()
                line1 = lines[i + 1].strip()
                line2 = lines[i + 2].strip()
                
                norad_id = self._parse_norad_id(line1)
                epoch = self.parse_tle_epoch(line1)
                orbital_params = self._calculate_orbital_params(line2)
                
                if norad_id:
                    entry = {
                        "name": name,
                        "line1": line1,
                        "line2": line2,
                        "norad_id": norad_id,
                        "intl_designator": self._parse_intl_designator(line1),
                        "epoch": epoch,
                        **orbital_params,
                    }
                    
                    # Keep entry with most recent epoch
                    if norad_id not in tle_dict or (epoch and entry.get("epoch", datetime.min) > tle_dict[norad_id].get("epoch", datetime.min)):
                        tle_dict[norad_id] = entry
                
                i += 3
            else:
                i += 1
        
        return list(tle_dict.values())

    def _parse_norad_id(self, line1: str) -> Optional[int]:
        """Extract NORAD ID from TLE line 1."""
        try:
            return int(line1[2:7].strip())
        except (ValueError, IndexError):
            return None

    def _parse_intl_designator(self, line1: str) -> Optional[str]:
        """Extract international designator from TLE line 1."""
        try:
            return line1[9:17].strip()
        except IndexError:
            return None

    def _calculate_orbital_params(self, line2: str) -> Dict:
        """Calculate orbital parameters from TLE line 2."""
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
        except (ValueError, IndexError):
            return {}

    # ==================== Startup ====================

    def startup_check(self):
        """Perform startup integrity check."""
        print("[TLEService] Performing startup check...")
        
        for slug in self.constellations.keys():
            constellation = Constellation.query.filter_by(slug=slug).first()
            if constellation:
                count = Satellite.query.filter_by(constellation_id=constellation.id).count()
                if count > 0:
                    print(f"[TLEService] {slug}: {count} satellites")
        
        print("[TLEService] Startup check complete")


# Singleton instance
tle_service = TLEService()
