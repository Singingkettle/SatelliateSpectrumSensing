#!/usr/bin/env python3
"""
Historical TLE Data Importer

This script processes TLE history data downloaded from Space-Track cloud storage:
https://ln5.sync.com/dl/afd354190

The downloaded data structure:
- TLEs.zip (main archive)
  - 2019.zip (or gp_history_2019.json.zip)
  - 2020.zip
  - 2021.zip
  - ...
  - 2025.zip
  
Each yearly zip contains JSON files with GP (General Perturbations) data.
The JSON format matches Space-Track's GP_HISTORY class output.

IMPORTANT:
- This data covers history up to end of 2025
- For 2026 onwards, use the GP_HISTORY API (handled by scheduler)
- Data is imported once and never re-downloaded

Usage:
    cd backend
    python scripts/import_history_from_zip.py [--zip-path PATH] [--years YEARS] [--constellation SLUG]

Examples:
    # Import all data (recommended first run)
    python scripts/import_history_from_zip.py
    
    # Import specific years
    python scripts/import_history_from_zip.py --years 2024,2025
    
    # Import only for specific constellation
    python scripts/import_history_from_zip.py --constellation starlink
    
    # Dry run (parse but don't write)
    python scripts/import_history_from_zip.py --dry-run
"""

import os
import sys
import json
import zipfile
import argparse
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set, Optional

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Default paths
DEFAULT_ZIP_PATH = backend_dir / "data" / "history" / "TLEs.zip"
EXTRACT_TEMP_DIR = backend_dir / "data" / "history" / "temp_extract"


def parse_args():
    parser = argparse.ArgumentParser(description="Import historical TLE data from Space-Track zip files")
    parser.add_argument(
        "--zip-path", 
        type=str, 
        default=str(DEFAULT_ZIP_PATH),
        help="Path to the main TLEs.zip file"
    )
    parser.add_argument(
        "--years", 
        type=str, 
        default=None,
        help="Comma-separated list of years to import (e.g., '2024,2025'). Default: all years"
    )
    parser.add_argument(
        "--constellation", 
        type=str, 
        default=None,
        help="Only import data for specific constellation (e.g., 'starlink')"
    )
    parser.add_argument(
        "--batch-size", 
        type=int, 
        default=10000,
        help="Number of records to commit per batch (default: 10000)"
    )
    parser.add_argument(
        "--skip-existing", 
        action="store_true",
        default=True,
        help="Skip records that already exist in database (default: True)"
    )
    parser.add_argument(
        "--dry-run", 
        action="store_true",
        help="Parse data but don't write to database"
    )
    return parser.parse_args()


class HistoryImporter:
    """Imports historical TLE data from Space-Track zip archives."""
    
    def __init__(self, app, batch_size: int = 10000, skip_existing: bool = True):
        self.app = app
        self.batch_size = batch_size
        self.skip_existing = skip_existing
        
        # Statistics
        self.stats = {
            'files_processed': 0,
            'records_parsed': 0,
            'records_imported': 0,
            'records_skipped': 0,
            'records_failed': 0,
            'satellites_found': set(),
            'constellations_found': set(),
        }
        
        # Cache for satellite lookup
        self._satellite_cache: Dict[int, int] = {}  # norad_id -> satellite.id
        self._constellation_patterns: Dict[str, List[str]] = {}
        
    def _init_caches(self, constellation_filter: Optional[str] = None):
        """Initialize lookup caches from database."""
        from models import Satellite, Constellation
        from config import Config
        
        print("[Importer] Initializing caches...")
        
        # Build satellite cache (norad_id -> db id)
        query = Satellite.query
        if constellation_filter:
            constellation = Constellation.query.filter_by(slug=constellation_filter).first()
            if constellation:
                query = query.filter_by(constellation_id=constellation.id)
        
        for sat in query.all():
            self._satellite_cache[sat.norad_id] = sat.id
        
        print(f"[Importer] Cached {len(self._satellite_cache)} satellites")
        
        # Build constellation name patterns for filtering
        for slug, config in Config.CONSTELLATIONS.items():
            patterns = config.get('name_patterns', [])
            self._constellation_patterns[slug] = [p.upper() for p in patterns]
    
    def _matches_constellation(self, object_name: str, constellation_filter: Optional[str]) -> bool:
        """Check if an object name matches the constellation filter."""
        if not constellation_filter:
            return True
        
        name_upper = object_name.upper()
        patterns = self._constellation_patterns.get(constellation_filter, [])
        
        for pattern in patterns:
            if pattern in name_upper:
                return True
        return False
    
    def _parse_epoch(self, epoch_str: str) -> Optional[datetime]:
        """Parse epoch string from Space-Track format."""
        if not epoch_str:
            return None
        
        formats = [
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S',
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(epoch_str[:26], fmt)
            except (ValueError, IndexError):
                continue
        
        return None
    
    def _get_existing_epochs(self, satellite_id: int) -> Set[datetime]:
        """Get set of existing epoch datetimes for a satellite."""
        from models import TLEHistory
        
        epochs = set()
        records = TLEHistory.query.filter_by(satellite_id=satellite_id).with_entities(TLEHistory.epoch).all()
        for (epoch,) in records:
            if epoch:
                # Truncate to seconds for comparison
                epochs.add(epoch.replace(microsecond=0))
        return epochs
    
    def process_zip(self, zip_path: str, years: Optional[List[int]] = None,
                    constellation_filter: Optional[str] = None, dry_run: bool = False):
        """
        Process the main TLEs.zip archive.
        
        Args:
            zip_path: Path to TLEs.zip
            years: List of years to process (None = all)
            constellation_filter: Only import for specific constellation
            dry_run: Parse but don't write to database
        """
        from models import TLEHistory, db
        
        if not os.path.exists(zip_path):
            print(f"[Importer] ERROR: Zip file not found: {zip_path}")
            return
        
        print(f"[Importer] Processing: {zip_path}")
        print(f"[Importer] File size: {os.path.getsize(zip_path) / (1024**3):.2f} GB")
        
        with self.app.app_context():
            self._init_caches(constellation_filter)
            
            if not self._satellite_cache:
                print("[Importer] WARNING: No satellites found in database!")
                print("[Importer] Run the backend first to populate satellites from Space-Track GP data.")
                return
            
            # Create temp directory for extraction
            temp_dir = Path(EXTRACT_TEMP_DIR)
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            try:
                # Open main zip
                with zipfile.ZipFile(zip_path, 'r') as main_zip:
                    # List contents
                    contents = main_zip.namelist()
                    print(f"[Importer] Archive contains {len(contents)} items")
                    
                    # Find yearly zips
                    yearly_zips = sorted([
                        name for name in contents 
                        if name.endswith('.zip') and any(str(y) in name for y in range(2000, 2030))
                    ])
                    
                    if not yearly_zips:
                        # Maybe it's JSON files directly
                        json_files = [name for name in contents if name.endswith('.json')]
                        if json_files:
                            print(f"[Importer] Found {len(json_files)} JSON files directly in archive")
                            self._process_json_files_from_zip(main_zip, json_files, 
                                                             constellation_filter, dry_run)
                        else:
                            print("[Importer] No yearly zips or JSON files found in archive")
                        return
                    
                    print(f"[Importer] Found {len(yearly_zips)} yearly archives")
                    
                    # Filter by years if specified
                    if years:
                        yearly_zips = [
                            z for z in yearly_zips 
                            if any(str(y) in z for y in years)
                        ]
                        print(f"[Importer] Filtering to {len(yearly_zips)} archives for years: {years}")
                    
                    # Process each yearly zip
                    for idx, yearly_zip_name in enumerate(yearly_zips, 1):
                        year = self._extract_year_from_name(yearly_zip_name)
                        print(f"\n[Importer] === Processing {yearly_zip_name} ({idx}/{len(yearly_zips)}) ===")
                        
                        # Extract yearly zip to temp
                        yearly_zip_path = temp_dir / yearly_zip_name
                        main_zip.extract(yearly_zip_name, temp_dir)
                        
                        # Process the yearly zip
                        self._process_yearly_zip(yearly_zip_path, year, 
                                                constellation_filter, dry_run)
                        
                        # Clean up extracted yearly zip
                        if yearly_zip_path.exists():
                            os.remove(yearly_zip_path)
                        
                        # Print progress
                        print(f"[Importer] Progress: {self.stats['records_imported']:,} imported, "
                              f"{self.stats['records_skipped']:,} skipped")
                
            finally:
                # Clean up temp directory
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)
        
        self._print_summary()
    
    def _extract_year_from_name(self, name: str) -> Optional[int]:
        """Extract year from filename like '2024.zip' or 'TLE_2024.zip'."""
        import re
        match = re.search(r'(20\d{2})', name)
        return int(match.group(1)) if match else None
    
    def _process_yearly_zip(self, zip_path: Path, year: Optional[int],
                           constellation_filter: Optional[str], dry_run: bool):
        """Process a single yearly zip file."""
        if not zip_path.exists():
            print(f"[Importer] WARNING: Yearly zip not found: {zip_path}")
            return
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as yearly_zip:
                contents = yearly_zip.namelist()
                json_files = [f for f in contents if f.endswith('.json')]
                
                if json_files:
                    print(f"[Importer] Found {len(json_files)} JSON files in {year or 'archive'}")
                    self._process_json_files_from_zip(yearly_zip, json_files,
                                                     constellation_filter, dry_run)
                else:
                    # Maybe it's TLE text files
                    tle_files = [f for f in contents if f.endswith('.tle') or f.endswith('.txt')]
                    if tle_files:
                        print(f"[Importer] Found {len(tle_files)} TLE files")
                        self._process_tle_files_from_zip(yearly_zip, tle_files,
                                                        constellation_filter, dry_run)
                    else:
                        print(f"[Importer] No JSON or TLE files found in yearly zip")
                        
        except zipfile.BadZipFile:
            print(f"[Importer] ERROR: Bad zip file: {zip_path}")
    
    def _process_json_files_from_zip(self, zip_file: zipfile.ZipFile, 
                                     json_files: List[str],
                                     constellation_filter: Optional[str],
                                     dry_run: bool):
        """Process JSON files from within a zip archive."""
        from models import TLEHistory, db
        
        pending_records = []
        
        for json_name in json_files:
            try:
                with zip_file.open(json_name) as f:
                    content = f.read().decode('utf-8')
                    data = json.loads(content)
                    
                    # Handle both list and dict formats
                    if isinstance(data, dict):
                        data = [data]
                    
                    self.stats['files_processed'] += 1
                    
                    for record in data:
                        self.stats['records_parsed'] += 1
                        
                        # Extract fields
                        norad_id = record.get('NORAD_CAT_ID')
                        object_name = record.get('OBJECT_NAME', '')
                        
                        if not norad_id:
                            continue
                        
                        norad_id = int(norad_id)
                        
                        # Check constellation filter
                        if constellation_filter and not self._matches_constellation(object_name, constellation_filter):
                            continue
                        
                        # Check if satellite exists in our database
                        satellite_id = self._satellite_cache.get(norad_id)
                        if not satellite_id:
                            continue
                        
                        self.stats['satellites_found'].add(norad_id)
                        
                        # Parse epoch
                        epoch = self._parse_epoch(record.get('EPOCH'))
                        if not epoch:
                            continue
                        
                        # Create history record
                        try:
                            mean_motion = float(record.get('MEAN_MOTION', 0))
                            period_minutes = 1440.0 / mean_motion if mean_motion > 0 else None
                            
                            history_record = {
                                'satellite_id': satellite_id,
                                'norad_id': norad_id,
                                'tle_line1': record.get('TLE_LINE1'),
                                'tle_line2': record.get('TLE_LINE2'),
                                'epoch': epoch,
                                'source': 'SpaceTrack_CloudStorage',
                                'semi_major_axis_km': float(record.get('SEMIMAJOR_AXIS', 0) or 0),
                                'mean_motion': mean_motion,
                                'eccentricity': float(record.get('ECCENTRICITY', 0) or 0),
                                'inclination_deg': float(record.get('INCLINATION', 0) or 0),
                                'period_minutes': period_minutes,
                                'apoapsis_km': float(record.get('APOAPSIS', 0) or 0),
                                'periapsis_km': float(record.get('PERIAPSIS', 0) or 0),
                            }
                            
                            pending_records.append(history_record)
                            
                        except (ValueError, TypeError) as e:
                            self.stats['records_failed'] += 1
                            continue
                        
                        # Batch commit
                        if len(pending_records) >= self.batch_size:
                            self._commit_batch(pending_records, dry_run)
                            pending_records = []
                            
            except Exception as e:
                print(f"[Importer] Error processing {json_name}: {e}")
        
        # Commit remaining records
        if pending_records:
            self._commit_batch(pending_records, dry_run)
    
    def _process_tle_files_from_zip(self, zip_file: zipfile.ZipFile,
                                    tle_files: List[str],
                                    constellation_filter: Optional[str],
                                    dry_run: bool):
        """Process traditional TLE format files from within a zip archive."""
        print("[Importer] TLE text format processing not yet implemented")
        print("[Importer] Space-Track cloud storage typically uses JSON format")
    
    def _commit_batch(self, records: List[Dict], dry_run: bool):
        """Commit a batch of records to database."""
        from models import TLEHistory, db
        
        if dry_run:
            self.stats['records_imported'] += len(records)
            print(f"[Importer] DRY RUN: Would import {len(records)} records")
            return
        
        # Get existing epochs for satellites in this batch
        satellite_ids = set(r['satellite_id'] for r in records)
        existing_epochs: Dict[int, Set[datetime]] = {}
        
        if self.skip_existing:
            for sat_id in satellite_ids:
                existing_epochs[sat_id] = self._get_existing_epochs(sat_id)
        
        # Filter and create records
        new_records = []
        for record in records:
            sat_id = record['satellite_id']
            epoch = record['epoch']
            
            # Check for existing
            if self.skip_existing:
                epoch_truncated = epoch.replace(microsecond=0)
                if epoch_truncated in existing_epochs.get(sat_id, set()):
                    self.stats['records_skipped'] += 1
                    continue
            
            # Create TLEHistory object
            history = TLEHistory(
                satellite_id=record['satellite_id'],
                tle_line1=record['tle_line1'],
                tle_line2=record['tle_line2'],
                epoch=record['epoch'],
                source=record['source'],
                semi_major_axis_km=record['semi_major_axis_km'],
                mean_motion=record['mean_motion'],
                eccentricity=record['eccentricity'],
                inclination_deg=record['inclination_deg'],
                period_minutes=record['period_minutes'],
                apoapsis_km=record['apoapsis_km'],
                periapsis_km=record['periapsis_km'],
            )
            new_records.append(history)
        
        # Bulk insert
        if new_records:
            try:
                db.session.bulk_save_objects(new_records)
                db.session.commit()
                self.stats['records_imported'] += len(new_records)
            except Exception as e:
                db.session.rollback()
                print(f"[Importer] Batch commit error: {e}")
                self.stats['records_failed'] += len(new_records)
    
    def _print_summary(self):
        """Print import summary."""
        print("\n" + "=" * 60)
        print("[Importer] IMPORT SUMMARY")
        print("=" * 60)
        print(f"  Files processed:     {self.stats['files_processed']:,}")
        print(f"  Records parsed:      {self.stats['records_parsed']:,}")
        print(f"  Records imported:    {self.stats['records_imported']:,}")
        print(f"  Records skipped:     {self.stats['records_skipped']:,}")
        print(f"  Records failed:      {self.stats['records_failed']:,}")
        print(f"  Unique satellites:   {len(self.stats['satellites_found']):,}")
        print("=" * 60)


def main():
    args = parse_args()
    
    # Parse years if provided
    years = None
    if args.years:
        years = [int(y.strip()) for y in args.years.split(',')]
    
    print("=" * 60)
    print("Space-Track Historical TLE Data Importer")
    print("=" * 60)
    print(f"  Zip file: {args.zip_path}")
    print(f"  Years: {years or 'all'}")
    print(f"  Constellation: {args.constellation or 'all'}")
    print(f"  Batch size: {args.batch_size}")
    print(f"  Skip existing: {args.skip_existing}")
    print(f"  Dry run: {args.dry_run}")
    print("=" * 60)
    
    # Initialize Flask app
    from app import create_app
    app = create_app()
    
    # Create importer and run
    importer = HistoryImporter(
        app=app,
        batch_size=args.batch_size,
        skip_existing=args.skip_existing
    )
    
    importer.process_zip(
        zip_path=args.zip_path,
        years=years,
        constellation_filter=args.constellation,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
