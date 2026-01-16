"""
Background Scheduler Service

Handles periodic tasks for:
- TLE data updates from Space-Track.org
- SATCAT metadata synchronization
- Historical data backfill
- Data integrity checks

IMPORTANT: Space-Track.org API Compliance
- Do NOT schedule at :00 or :30 (peak times)
- Schedule at :17 or :47 (off-peak times)
- GP queries: 1 per hour per constellation
- SATCAT queries: 1 per day after 1700 UTC
"""

from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from config import Config


scheduler = BackgroundScheduler(daemon=True)

# Track update statistics
update_stats = {
    'last_update': None,
    'total_updates': 0,
    'failed_updates': 0,
    'last_satcat_sync': None,
    'last_history_backfill': None,
}


def update_gp_data_job():
    """
    Background job to update GP (TLE) data for all constellations.
    Runs every 6 hours at off-peak times.
    
    Space-Track compliant: Uses account pool rotation and rate limiting.
    """
    from services.tle_service import tle_service
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"\n--- [Scheduler] GP Update Job at {timestamp} ---")
    
    with app.app_context():
        try:
            results = tle_service.update_all_constellations()
            
            total_new = 0
            total_updated = 0
            
            for slug, (new, updated) in results.items():
                total_new += new
                total_updated += updated
                if new > 0 or updated > 0:
                    print(f"  {slug}: {new} new, {updated} updated")
            
            update_stats['last_update'] = timestamp
            update_stats['total_updates'] += 1
            
            print(f"  Total: {total_new} new, {total_updated} updated")
            
        except Exception as e:
            update_stats['failed_updates'] += 1
            print(f"[Scheduler] GP update error: {e}")
    
    print("--- [Scheduler] GP Update Job Complete ---\n")


def sync_satcat_job():
    """
    Background job to sync SATCAT data for all constellations.
    Runs daily at 17:27 UTC (after Space-Track's 1700 UTC update).
    
    SATCAT provides launch dates, decay dates, and satellite metadata.
    """
    from services.tle_service import tle_service
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"\n--- [Scheduler] SATCAT Sync Job at {timestamp} ---")
    
    # Priority constellations for SATCAT sync
    priority_slugs = ['starlink', 'oneweb', 'gps', 'iridium', 'globalstar']
    
    with app.app_context():
        try:
            for slug in priority_slugs:
                if slug in Config.CONSTELLATIONS:
                    try:
                        result = tle_service.sync_catalog_from_spacetrack(slug)
                        print(f"  {slug}: {result}")
                    except Exception as e:
                        print(f"  {slug}: error - {e}")
            
            update_stats['last_satcat_sync'] = timestamp
            
        except Exception as e:
            print(f"[Scheduler] SATCAT sync error: {e}")
    
    print("--- [Scheduler] SATCAT Sync Job Complete ---\n")


def backfill_history_job():
    """
    Background job to backfill historical TLE data.
    Runs daily at off-peak time (03:47 UTC).
    
    Checks for gaps in history and fills them from Space-Track GP_HISTORY.
    """
    from services.tle_service import tle_service
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"\n--- [Scheduler] History Backfill Job at {timestamp} ---")
    
    with app.app_context():
        try:
            # Focus on main constellations
            priority_slugs = ['starlink', 'oneweb', 'gps', 'stations']
            
            for slug in priority_slugs:
                if slug in tle_service.constellations:
                    try:
                        count = tle_service.sync_constellation_history(slug)
                        if count > 0:
                            print(f"  {slug}: {count} history records added")
                    except Exception as e:
                        print(f"  {slug}: history error - {e}")
            
            update_stats['last_history_backfill'] = timestamp
            
        except Exception as e:
            print(f"[Scheduler] History backfill error: {e}")
    
    print("--- [Scheduler] History Backfill Job Complete ---\n")


def update_launch_data_job():
    """
    Background job to update and enrich launch data.
    Uses Launch Library 2 API to add rocket type, mission details, etc.
    """
    from services.launch_service import launch_service
    from models import Launch, Constellation
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"\n--- [Scheduler] Launch Data Update at {timestamp} ---")
    
    with app.app_context():
        try:
            # Find launches missing rocket type
            launches = Launch.query.filter(
                Launch.rocket_type.is_(None),
                Launch.launch_date.isnot(None)
            ).limit(10).all()
            
            for launch in launches:
                try:
                    result = launch_service.enrich_launch_from_ll2(launch.cospar_id)
                    if result:
                        print(f"  Enriched: {launch.cospar_id}")
                except Exception as e:
                    print(f"  {launch.cospar_id}: error - {e}")
                
        except Exception as e:
            print(f"[Scheduler] Launch update error: {e}")
    
    print("--- [Scheduler] Launch Data Update Complete ---\n")


def sync_ground_stations_job():
    """
    Background job to sync ground station data.
    Uses community data sources since Space-Track doesn't provide this.
    """
    from services.ground_station_service import ground_station_service
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"\n--- [Scheduler] Ground Station Sync at {timestamp} ---")
    
    with app.app_context():
        try:
            for slug in ['starlink', 'oneweb']:
                result = ground_station_service.sync_stations(slug)
                print(f"  {slug}: {result}")
                
        except Exception as e:
            print(f"[Scheduler] Ground station sync error: {e}")
    
    print("--- [Scheduler] Ground Station Sync Complete ---\n")


def check_account_pool_health():
    """
    Background job to monitor Space-Track account pool health.
    Logs warnings if accounts are suspended or rate limited.
    """
    from services.account_pool import get_account_pool
    
    try:
        pool = get_account_pool()
        status = pool.get_pool_status()
        
        active = status['active_accounts']
        total = status['total_accounts']
        
        if active < total / 2:
            print(f"[Scheduler] WARNING: Only {active}/{total} accounts available!")
        
        if status['suspended_accounts'] > 0:
            print(f"[Scheduler] WARNING: {status['suspended_accounts']} accounts suspended!")
            
    except Exception as e:
        print(f"[Scheduler] Account pool check error: {e}")


def get_scheduler_status():
    """Get current scheduler status and statistics."""
    return {
        'running': scheduler.running,
        'last_update': update_stats['last_update'],
        'total_updates': update_stats['total_updates'],
        'failed_updates': update_stats['failed_updates'],
        'last_satcat_sync': update_stats['last_satcat_sync'],
        'last_history_backfill': update_stats['last_history_backfill'],
        'jobs': [
            {
                'id': job.id,
                'next_run': str(job.next_run_time) if job.next_run_time else None,
                'trigger': str(job.trigger)
            }
            for job in scheduler.get_jobs()
        ]
    }


def initialize_scheduler(app):
    """
    Initialize and start the background scheduler.
    
    Schedule (all times UTC, avoiding :00 and :30 peaks):
    - GP Update: Every 6 hours at :17 (02:17, 08:17, 14:17, 20:17)
    - SATCAT Sync: Daily at 17:27 (after Space-Track's 1700 update)
    - History Backfill: Daily at 03:47
    - Launch Data: Every 12 hours at :17
    - Ground Stations: Weekly at Sunday 12:47
    - Account Health: Every hour at :47
    """
    
    # GP data update - every 6 hours at :17
    scheduler.add_job(
        update_gp_data_job,
        'cron',
        hour='2,8,14,20',
        minute=17,
        timezone='utc',
        id='gp_update',
        replace_existing=True
    )
    
    # SATCAT sync - daily at 17:27 UTC
    scheduler.add_job(
        sync_satcat_job,
        'cron',
        hour=17,
        minute=27,
        timezone='utc',
        id='satcat_sync',
        replace_existing=True
    )
    
    # History backfill - daily at 03:47 UTC
    scheduler.add_job(
        backfill_history_job,
        'cron',
        hour=3,
        minute=47,
        timezone='utc',
        id='history_backfill',
        replace_existing=True
    )
    
    # Launch data enrichment - every 12 hours at :17
    scheduler.add_job(
        update_launch_data_job,
        'cron',
        hour='6,18',
        minute=17,
        timezone='utc',
        id='launch_update',
        replace_existing=True
    )
    
    # Ground station sync - weekly on Sunday at 12:47
    scheduler.add_job(
        sync_ground_stations_job,
        'cron',
        day_of_week='sun',
        hour=12,
        minute=47,
        timezone='utc',
        id='ground_station_sync',
        replace_existing=True
    )
    
    # Account pool health check - every hour at :47
    scheduler.add_job(
        check_account_pool_health,
        'cron',
        minute=47,
        timezone='utc',
        id='account_health_check',
        replace_existing=True
    )
    
    scheduler.start()
    
    print(f"[Scheduler] Started with Space-Track compliant schedule:")
    print(f"  - GP Update: every 6h at :17 UTC")
    print(f"  - SATCAT Sync: daily at 17:27 UTC")
    print(f"  - History Backfill: daily at 03:47 UTC")
    print(f"  - Launch Enrichment: every 12h at :17 UTC")
    print(f"  - Ground Stations: weekly Sunday 12:47 UTC")
    print(f"  - Account Health: every hour at :47 UTC")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[Scheduler] Shutdown complete")


def trigger_manual_update():
    """Trigger an immediate GP update (for API endpoint)."""
    scheduler.add_job(
        update_gp_data_job,
        'date',
        id='manual_gp_update',
        replace_existing=True
    )


def trigger_satcat_sync():
    """Trigger an immediate SATCAT sync."""
    scheduler.add_job(
        sync_satcat_job,
        'date',
        id='manual_satcat_sync',
        replace_existing=True
    )


def trigger_history_backfill():
    """Trigger an immediate history backfill."""
    scheduler.add_job(
        backfill_history_job,
        'date',
        id='manual_history_backfill',
        replace_existing=True
    )
