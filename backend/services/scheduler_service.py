"""
Background scheduler service for periodic tasks.
Handles automatic TLE updates similar to satellitemap.space
Data source: space-track.org (via CelesTrak mirror) and supplemental sources
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
}


def update_all_tle_job():
    """
    Background job to update TLE data for all constellations.
    Runs every 4 hours to keep data fresh (similar to satellitemap.space).
    """
    # Import here to avoid circular imports
    from services.tle_service import tle_service
    from app import app
    
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"--- [Scheduler] Starting TLE update at {timestamp} ---")
    
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
            print(f"  Total: {total_new} new satellites, {total_updated} updated")
        except Exception as e:
            update_stats['failed_updates'] += 1
            print(f"[Scheduler] Error during TLE update: {e}")
    
    print("--- [Scheduler] TLE update complete ---")


def update_priority_constellations_job():
    """
    More frequent update for priority constellations (Starlink, ISS).
    Runs every 2 hours at :42 (off-peak) to capture newly launched satellites.
    
    IMPORTANT: Uses CelesTrak instead of Space-Track to comply with API limits.
    Space-Track should only be queried once per hour for the same data.
    """
    from services.tle_service import tle_service
    from app import app
    
    priority_slugs = ['starlink', 'stations']  # Most frequently changing
    
    with app.app_context():
        try:
            for slug in priority_slugs:
                try:
                    # Force use of CelesTrak to avoid Space-Track rate limits
                    # Space-Track is only used in the 6-hourly full update
                    new, updated = tle_service.update_constellation_tle(slug, force_celestrak=True)
                    if new > 0:
                        print(f"[Scheduler] {slug}: {new} new satellites detected (via CelesTrak)")
                except Exception as e:
                    print(f"[Scheduler] Error updating {slug}: {e}")
        except Exception as e:
            print(f"[Scheduler] Priority update error: {e}")


def sync_external_satellites_job():
    """
    Sync satellite catalog from external sources to catch newly launched satellites.
    Runs every 6 hours.
    """
    import requests
    from models import db, Constellation, Satellite
    from app import app
    
    external_constellations = ['starlink', 'oneweb']
    
    with app.app_context():
        for slug in external_constellations:
            try:
                # Fetch from api2.satellitemap.space
                url = f"https://api2.satellitemap.space/satellites?constellation={slug}&status=active"
                response = requests.get(url, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success') and data.get('data'):
                        constellation = Constellation.query.filter_by(slug=slug).first()
                        if constellation:
                            new_count = 0
                            for ext_sat in data['data']:
                                norad_id = ext_sat.get('norad_id')
                                if norad_id and not Satellite.query.filter_by(norad_id=norad_id).first():
                                    new_sat = Satellite(
                                        norad_id=norad_id,
                                        name=ext_sat.get('sat_name', f'Unknown-{norad_id}'),
                                        constellation_id=constellation.id,
                                        is_active=ext_sat.get('status') == 'active',
                                    )
                                    db.session.add(new_sat)
                                    new_count += 1
                            if new_count > 0:
                                db.session.commit()
                                print(f"[Scheduler] External sync: {new_count} new {slug} satellites added")
            except Exception as e:
                print(f"[Scheduler] External sync error for {slug}: {e}")


def backfill_history_job():
    """
    Background job to backfill historical TLE data (last 1 year).
    Runs once daily at off-peak time.
    """
    from services.tle_service import tle_service
    from app import app
    
    print("--- [Scheduler] Starting History Backfill ---")
    with app.app_context():
        try:
            # Iterate through all configured constellations
            for slug in tle_service.constellations.keys():
                tle_service.sync_constellation_history(slug, days=365)
        except Exception as e:
            print(f"[Scheduler] History backfill error: {e}")
    print("--- [Scheduler] History Backfill Complete ---")



def get_scheduler_status():
    """Get current scheduler status and statistics."""
    return {
        'running': scheduler.running,
        'last_update': update_stats['last_update'],
        'total_updates': update_stats['total_updates'],
        'failed_updates': update_stats['failed_updates'],
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
    
    IMPORTANT: Space-Track.org API Usage Policy Compliance
    - Do NOT schedule jobs at :00 or :30 (peak times)
    - Schedule at :17 or :42 (off-peak times)
    - Minimum 1 hour between same GP queries
    - Use combined queries where possible
    
    Schedule:
    - Every 6 hours at :17: Full update of all constellations (Space-Track compliant)
    - Every 2 hours at :42: Priority update (Starlink only, uses CelesTrak to avoid Space-Track limits)
    - Every 6 hours at :47: External satellite catalog sync (uses api2.satellitemap.space, not Space-Track)
    
    Args:
        app: Flask application instance
    """
    # Full TLE update every 6 hours at :17 minutes (off-peak time)
    # Space-Track compliant: avoids :00 and :30
    scheduler.add_job(
        update_all_tle_job,
        'cron',
        hour='3,9,15,21',  # Every 6 hours
        minute=17,         # Off-peak time (not :00 or :30)
        timezone='utc',
        id='full_tle_update',
        replace_existing=True
    )
    
    # Priority constellations update every 2 hours at :42 (off-peak)
    # Uses CelesTrak instead of Space-Track to reduce API load
    scheduler.add_job(
        update_priority_constellations_job,
        'cron',
        hour='1,3,5,7,9,11,13,15,17,19,21,23',  # Every 2 hours
        minute=42,                              # Off-peak time
        timezone='utc',
        id='priority_tle_update',
        replace_existing=True
    )
    
    # External satellite sync every 6 hours at :47 (off-peak)
    # Uses api2.satellitemap.space, not Space-Track
    scheduler.add_job(
        sync_external_satellites_job,
        'cron',
        hour='0,6,12,18',  # Every 6 hours
        minute=47,         # Off-peak time
        timezone='utc',
        id='external_sync',
        replace_existing=True
    )
    
    # Daily history backfill at 02:27 UTC (off-peak)
    # Checks for missing history and fills gaps from Space-Track
    scheduler.add_job(
        backfill_history_job,
        'cron',
        hour=2,
        minute=27,
        timezone='utc',
        id='history_backfill',
        replace_existing=True
    )
    
    scheduler.start()
    print(f"[Scheduler] Started with Space-Track compliant schedule:")
    print(f"  - Full update: every 6h at :17 (03:17, 09:17, 15:17, 21:17 UTC)")
    print(f"  - Priority update: every 2h at :42 (uses CelesTrak)")
    print(f"  - External sync: every 6h at :47 (uses api2.satellitemap.space)")
    print(f"  - History backfill: daily at 02:27 UTC (uses Space-Track bulk API)")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[Scheduler] Shutdown complete")


def trigger_manual_update():
    """Trigger an immediate TLE update (useful for API endpoint)."""
    scheduler.add_job(
        update_all_tle_job,
        'date',
        id='manual_update',
        replace_existing=True
    )
