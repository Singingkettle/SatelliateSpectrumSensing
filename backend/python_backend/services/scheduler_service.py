# backend/python_backend/services/scheduler_service.py

from apscheduler.schedulers.background import BackgroundScheduler
from .tle_service import tle_service

def update_all_tle_data_job():
    """
    这是一个后台作业，用于更新所有支持星座的TLE数据。
    """
    print("--- [后台任务]: 开始执行每日TLE数据更新 --- ")
    constellations_to_update = ['starlink', 'oneweb', 'iridium']
    for name in constellations_to_update:
        try:
            tle_service.update_tle_data(name)
        except Exception as e:
            print(f"[后台任务] 更新 {name} TLE数据时发生错误: {e}")
    print("--- [后台任务]: 每日TLE数据更新完成 --- ")

def initialize_scheduler():
    """
    初始化并启动后台调度器。
    """
    scheduler = BackgroundScheduler(daemon=True)
    # 添加作业，设置为每天在国际标准时间(UTC)的 01:00 执行
    scheduler.add_job(update_all_tle_data_job, 'cron', hour=1, minute=0, timezone='utc')
    scheduler.start()
    print("后台TLE更新调度器已启动，任务将在每日 01:00 UTC 执行。")
