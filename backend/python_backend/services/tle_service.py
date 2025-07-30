# backend/python_backend/services/tle_service.py

import requests
import redis
import json
from datetime import datetime


class TleService:
    """
    处理TLE数据的获取、缓存和定时更新。
    """

    def __init__(self):
        self.redis_client = redis.Redis(
            host="localhost", port=6379, db=0, decode_responses=True
        )
        self.tle_urls = {
            "starlink": "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
            "oneweb": "https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle",
            "iridium": "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-next&FORMAT=tle",
        }

    def get_tle_data(self, constellation_name: str) -> list:
        """
        从Redis缓存中获取TLE数据。如果缓存不存在，则触发一次新的下载。
        """
        redis_key = f"tle:{constellation_name}"
        cached_data = self.redis_client.get(redis_key)
        if cached_data:
            print(f"从Redis缓存中找到 {constellation_name} 的TLE数据。")
            return json.loads(cached_data)
        else:
            print(f"未找到 {constellation_name} 的缓存数据，正在执行首次下载...")
            return self.update_tle_data(constellation_name)

    def update_tle_data(self, constellation_name: str) -> list:
        """
        从CelesTrak下载最新的TLE数据，解析后存入Redis。
        """
        constellation_name = constellation_name.lower()
        if constellation_name not in self.tle_urls:
            raise ValueError(f"不支持的星座: {constellation_name}")

        try:
            response = requests.get(self.tle_urls[constellation_name], timeout=15)
            response.raise_for_status()  # 如果请求失败则抛出异常

            tle_list = self._parse_tle_text(response.text)

            redis_key = f"tle:{constellation_name}"
            # 缓存24小时
            self.redis_client.set(redis_key, json.dumps(tle_list), ex=86400)
            print(
                f"已成功下载并缓存 {len(tle_list)} 条 {constellation_name} 的TLE数据。"
            )
            return tle_list
        except requests.RequestException as e:
            print(f"下载 {constellation_name} TLE数据时发生网络错误: {e}")
            raise

    def _parse_tle_text(self, tle_text: str) -> list:
        """
        将原始TLE文本解析为结构化的列表。
        """
        lines = tle_text.strip().splitlines()
        tle_list = []
        for i in range(0, len(lines), 3):
            if i + 2 < len(lines):
                tle_entry = {
                    "name": lines[i].strip(),
                    "line1": lines[i + 1].strip(),
                    "line2": lines[i + 2].strip(),
                }
                tle_list.append(tle_entry)
        return tle_list


# 创建TleService的单例
tle_service = TleService()
