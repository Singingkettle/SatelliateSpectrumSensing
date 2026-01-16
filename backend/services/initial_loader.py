"""
Initial Data Loader Service

Handles first-time data loading when the application starts with an empty database.
Implements staged loading to avoid Space-Track rate limits.

Loading Strategy:
1. Load SATCAT data (all satellites, active + decayed)
2. Load latest GP (TLE) data
3. Backfill historical TLE data (in batches)

Each stage has appropriate delays to comply with Space-Track API limits.
"""

import time
from datetime import datetime
from typing import List, Optional, Dict
from threading import Thread, Event

from models import db, Constellation, Satellite, TLEHistory
from config import Config


class InitialDataLoader:
    """
    Handles first-time data loading for the application.
    
    Features:
    - Staged loading to avoid rate limits
    - Progress tracking
    - Resumable (checks existing data)
    - Background execution option
    """
    
    # Loading delays (seconds) - comply with Space-Track limits
    DELAY_BETWEEN_CONSTELLATIONS = 60      # 1 minute between constellation loads
    DELAY_BETWEEN_STAGES = 30              # 30 seconds between stages
    DELAY_AFTER_SATCAT = 120               # 2 minutes after SATCAT (rate limited)
    DELAY_AFTER_GP = 60                    # 1 minute after GP
    DELAY_AFTER_HISTORY_BATCH = 180        # 3 minutes between history batches
    
    # Priority order for loading
    PRIORITY_CONSTELLATIONS = [
        'starlink',    # Largest, most requested
        'oneweb',      # Second largest LEO
        'gps',         # Navigation
        'stations',    # Space stations (small but important)
        'iridium',     # Communications
        'globalstar',
        'galileo',
        'beidou',
        'glonass',
    ]
    
    def __init__(self):
        self._loading = False
        self._progress = {}
        self._stop_event = Event()
        self._background_thread: Optional[Thread] = None
    
    @property
    def is_loading(self) -> bool:
        """Check if initial loading is in progress."""
        return self._loading
    
    @property
    def progress(self) -> Dict:
        """Get current loading progress."""
        return self._progress.copy()
    
    def stop(self):
        """Stop the loading process."""
        self._stop_event.set()
        if self._background_thread and self._background_thread.is_alive():
            self._background_thread.join(timeout=5)
    
    def needs_initial_load(self) -> bool:
        """
        Check if initial data loading is needed.
        
        Returns:
            True if database is empty or has very few satellites
        """
        total_satellites = Satellite.query.count()
        total_constellations = Constellation.query.count()
        
        # Consider empty if less than 100 satellites or no constellations
        return total_satellites < 100 or total_constellations < 3
    
    def run_initial_load(self, constellation_slugs: List[str] = None,
                         background: bool = False,
                         include_history: bool = True) -> Dict:
        """
        Run initial data loading.
        
        Args:
            constellation_slugs: List of constellations to load (default: priority list)
            background: Run in background thread
            include_history: Also load historical TLE data
        
        Returns:
            Loading status/progress dictionary
        """
        if self._loading:
            return {'status': 'already_running', 'progress': self._progress}
        
        # Determine which constellations to load
        if not constellation_slugs:
            # Use priority list, filtered to configured constellations
            configured = set(Config.CONSTELLATIONS.keys())
            constellation_slugs = [
                slug for slug in self.PRIORITY_CONSTELLATIONS
                if slug in configured
            ]
            # Add any remaining configured constellations
            for slug in configured:
                if slug not in constellation_slugs:
                    constellation_slugs.append(slug)
        
        if background:
            self._background_thread = Thread(
                target=self._load_worker,
                args=(constellation_slugs, include_history),
                daemon=True
            )
            self._background_thread.start()
            return {'status': 'started', 'mode': 'background', 'constellations': constellation_slugs}
        else:
            return self._load_worker(constellation_slugs, include_history)
    
    def _load_worker(self, constellation_slugs: List[str], 
                     include_history: bool) -> Dict:
        """Worker function for loading data."""
        from services.tle_service import tle_service
        
        self._loading = True
        self._stop_event.clear()
        
        self._progress = {
            'status': 'running',
            'started_at': datetime.utcnow().isoformat(),
            'total_constellations': len(constellation_slugs),
            'completed_constellations': 0,
            'current_constellation': None,
            'current_stage': None,
            'results': {},
        }
        
        try:
            for idx, slug in enumerate(constellation_slugs):
                if self._stop_event.is_set():
                    self._progress['status'] = 'stopped'
                    break
                
                self._progress['current_constellation'] = slug
                self._progress['results'][slug] = {
                    'started_at': datetime.utcnow().isoformat(),
                    'stages': {}
                }
                
                print(f"\n[InitialLoader] ===== Loading {slug} ({idx+1}/{len(constellation_slugs)}) =====")
                
                # Stage 1: SATCAT (full catalog)
                self._progress['current_stage'] = 'satcat'
                print(f"[InitialLoader] Stage 1: Loading SATCAT for {slug}...")
                
                try:
                    satcat_result = tle_service.sync_catalog_from_spacetrack(slug)
                    self._progress['results'][slug]['stages']['satcat'] = satcat_result
                    print(f"[InitialLoader] SATCAT: {satcat_result}")
                except Exception as e:
                    self._progress['results'][slug]['stages']['satcat'] = {'error': str(e)}
                    print(f"[InitialLoader] SATCAT error: {e}")
                
                if self._stop_event.is_set():
                    break
                
                time.sleep(self.DELAY_AFTER_SATCAT)
                
                # Stage 2: Latest GP (TLE) data
                self._progress['current_stage'] = 'gp'
                print(f"[InitialLoader] Stage 2: Loading GP data for {slug}...")
                
                try:
                    gp_result = tle_service.update_constellation_tle(slug)
                    self._progress['results'][slug]['stages']['gp'] = {
                        'new': gp_result[0],
                        'updated': gp_result[1]
                    }
                    print(f"[InitialLoader] GP: {gp_result[0]} new, {gp_result[1]} updated")
                except Exception as e:
                    self._progress['results'][slug]['stages']['gp'] = {'error': str(e)}
                    print(f"[InitialLoader] GP error: {e}")
                
                if self._stop_event.is_set():
                    break
                
                time.sleep(self.DELAY_AFTER_GP)
                
                # Stage 3: Historical TLE data (optional, skip for large constellations)
                # NOTE: GP_HISTORY should be downloaded once per satellite lifetime
                # For large constellations (>500 satellites), skip history loading
                # to avoid overwhelming Space-Track API
                if include_history:
                    self._progress['current_stage'] = 'history'
                    
                    try:
                        constellation = Constellation.query.filter_by(slug=slug).first()
                        if constellation:
                            sat_count = Satellite.query.filter_by(
                                constellation_id=constellation.id
                            ).count()
                            
                            # Skip history for large constellations to avoid API rate limits
                            if sat_count > 500:
                                print(f"[InitialLoader] Stage 3: Skipping history for {slug} ({sat_count} satellites - too large for API)")
                                print(f"[InitialLoader] NOTE: For large constellations, download history from Space-Track cloud storage")
                                self._progress['results'][slug]['stages']['history'] = {
                                    'skipped': 'too_many_satellites',
                                    'satellite_count': sat_count,
                                    'message': 'Use Space-Track cloud storage for large constellation history'
                                }
                            elif sat_count > 0:
                                print(f"[InitialLoader] Stage 3: Loading history for {slug}...")
                                history_count = tle_service.sync_constellation_history(slug)
                                self._progress['results'][slug]['stages']['history'] = {
                                    'records_added': history_count
                                }
                                print(f"[InitialLoader] History: {history_count} records")
                            else:
                                self._progress['results'][slug]['stages']['history'] = {
                                    'skipped': 'no_satellites'
                                }
                    except Exception as e:
                        self._progress['results'][slug]['stages']['history'] = {'error': str(e)}
                        print(f"[InitialLoader] History error: {e}")
                
                self._progress['results'][slug]['completed_at'] = datetime.utcnow().isoformat()
                self._progress['completed_constellations'] = idx + 1
                
                # Delay before next constellation
                if idx < len(constellation_slugs) - 1:
                    print(f"[InitialLoader] Waiting {self.DELAY_BETWEEN_CONSTELLATIONS}s before next constellation...")
                    time.sleep(self.DELAY_BETWEEN_CONSTELLATIONS)
            
            self._progress['status'] = 'completed' if not self._stop_event.is_set() else 'stopped'
            self._progress['completed_at'] = datetime.utcnow().isoformat()
            
        except Exception as e:
            self._progress['status'] = 'error'
            self._progress['error'] = str(e)
            print(f"[InitialLoader] Fatal error: {e}")
        
        finally:
            self._loading = False
            self._progress['current_constellation'] = None
            self._progress['current_stage'] = None
        
        return self._progress
    
    def load_single_constellation(self, slug: str, 
                                  include_history: bool = True) -> Dict:
        """
        Load data for a single constellation.
        
        Args:
            slug: Constellation slug
            include_history: Also load historical data
        
        Returns:
            Loading result
        """
        from services.tle_service import tle_service
        
        result = {
            'constellation': slug,
            'started_at': datetime.utcnow().isoformat(),
            'stages': {}
        }
        
        try:
            # SATCAT
            print(f"[InitialLoader] Loading SATCAT for {slug}...")
            result['stages']['satcat'] = tle_service.sync_catalog_from_spacetrack(slug)
            time.sleep(self.DELAY_AFTER_SATCAT)
            
            # GP
            print(f"[InitialLoader] Loading GP for {slug}...")
            gp = tle_service.update_constellation_tle(slug)
            result['stages']['gp'] = {'new': gp[0], 'updated': gp[1]}
            time.sleep(self.DELAY_AFTER_GP)
            
            # History
            if include_history:
                print(f"[InitialLoader] Loading history for {slug}...")
                history_count = tle_service.sync_constellation_history(slug)
                result['stages']['history'] = {'records_added': history_count}
            
            result['status'] = 'completed'
            
        except Exception as e:
            result['status'] = 'error'
            result['error'] = str(e)
        
        result['completed_at'] = datetime.utcnow().isoformat()
        return result
    
    def get_loading_status(self) -> Dict:
        """Get current loading status."""
        if self._loading:
            return {
                'loading': True,
                **self._progress
            }
        else:
            return {
                'loading': False,
                'needs_initial_load': self.needs_initial_load(),
                'satellite_count': Satellite.query.count(),
                'constellation_count': Constellation.query.count(),
                'history_count': TLEHistory.query.count(),
            }


# Singleton instance
initial_loader = InitialDataLoader()
