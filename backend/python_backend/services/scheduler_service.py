# backend/python_backend/services/scheduler_service.py

from apscheduler.schedulers.background import BackgroundScheduler
from .tle_service import tle_service

def update_all_tle_data_job():
    """
    This is a background job to update TLE data for all supported constellations.
    """
    print("--- [Background Job]: Starting daily TLE data update ---")
    constellations_to_update = ['starlink', 'oneweb', 'iridium']
    for name in constellations_to_update:
        try:
            tle_service.update_tle_data(name)
        except Exception as e:
            print(f"[Background Job] An error occurred while updating {name} TLE data: {e}")
    print("--- [Background Job]: Daily TLE data update finished ---")

def initialize_scheduler():
    """
    Initializes and starts the background scheduler.
    """
    scheduler = BackgroundScheduler(daemon=True)
    # Add the job, set to run daily at 01:00 UTC
    scheduler.add_job(update_all_tle_data_job, 'cron', hour=1, minute=0, timezone='utc')
    scheduler.start()
    print("Background TLE update scheduler has been started, the job will run daily at 01:00 UTC.")
