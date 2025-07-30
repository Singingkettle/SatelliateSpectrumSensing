# backend/python_backend/services/tle_service.py

import requests
import redis
import json
from datetime import datetime


class TleService:
    """
    Handles the fetching, caching, and periodic updating of TLE data.
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
        Gets TLE data from the Redis cache. If the cache does not exist, it triggers a new download.
        """
        constellation_name = constellation_name.lower()
        redis_key = f"tle:{constellation_name}"
        cached_data = self.redis_client.get(redis_key)
        if cached_data:
            print(f"Found TLE data for {constellation_name} in Redis cache.")
            return json.loads(cached_data)
        else:
            print(f"Cache not found for {constellation_name}, executing initial download...")
            return self.update_tle_data(constellation_name)

    def update_tle_data(self, constellation_name: str) -> list:
        """
        Downloads the latest TLE data from CelesTrak, parses it, and stores it in Redis.
        """
        constellation_name = constellation_name.lower()
        if constellation_name not in self.tle_urls:
            raise ValueError(f"Unsupported constellation: {constellation_name}")

        try:
            response = requests.get(self.tle_urls[constellation_name], timeout=15)
            response.raise_for_status()  # Raise an exception if the request fails

            tle_list = self._parse_tle_text(response.text)

            redis_key = f"tle:{constellation_name}"
            # Cache for 24 hours
            self.redis_client.set(redis_key, json.dumps(tle_list), ex=86400)
            print(
                f"Successfully downloaded and cached {len(tle_list)} TLE entries for {constellation_name}."
            )
            return tle_list
        except requests.RequestException as e:
            print(f"A network error occurred while downloading {constellation_name} TLE data: {e}")
            raise

    def _parse_tle_text(self, tle_text: str) -> list:
        """
        Parses the raw TLE text into a structured list.
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


# Create a singleton instance of TleService
tle_service = TleService()
