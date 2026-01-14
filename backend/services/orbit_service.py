"""
Orbit calculation service using SGP4 propagator.
Provides server-side orbit prediction capabilities.
"""
import math
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from sgp4.api import Satrec, jday
from sgp4.api import WGS72

from models import Satellite, TLEHistory


class OrbitService:
    """
    Service for orbital calculations and predictions.
    Uses SGP4 propagator for accurate orbit propagation.
    """
    
    # Constants
    EARTH_RADIUS_KM = 6378.137
    
    def propagate_satellite(
        self,
        tle_line1: str,
        tle_line2: str,
        time: datetime
    ) -> Optional[Dict]:
        """
        Propagate satellite position at a given time.
        
        Args:
            tle_line1: TLE line 1
            tle_line2: TLE line 2
            time: DateTime for position calculation
            
        Returns:
            Dictionary with position (lat, lon, alt) and velocity, or None on error
        """
        try:
            # Create satellite object from TLE
            satellite = Satrec.twoline2rv(tle_line1, tle_line2)
            
            # Convert datetime to Julian date
            jd, fr = jday(
                time.year, time.month, time.day,
                time.hour, time.minute, time.second + time.microsecond / 1e6
            )
            
            # Propagate
            e, r, v = satellite.sgp4(jd, fr)
            
            if e != 0:
                # Propagation error
                return None
            
            # r is in km (ECI coordinates), v is in km/s
            x, y, z = r
            vx, vy, vz = v
            
            # Convert ECI to geodetic (lat, lon, alt)
            lat, lon, alt = self._eci_to_geodetic(x, y, z, jd + fr)
            
            return {
                'latitude': lat,
                'longitude': lon,
                'altitude_km': alt,
                'velocity_km_s': math.sqrt(vx**2 + vy**2 + vz**2),
                'position_eci': {'x': x, 'y': y, 'z': z},
                'velocity_eci': {'x': vx, 'y': vy, 'z': vz},
                'time': time.isoformat(),
            }
        except Exception as e:
            print(f"Error propagating satellite: {e}")
            return None
    
    def _eci_to_geodetic(
        self,
        x: float,
        y: float,
        z: float,
        jd: float
    ) -> Tuple[float, float, float]:
        """
        Convert ECI coordinates to geodetic (lat, lon, alt).
        
        Args:
            x, y, z: ECI position in km
            jd: Julian date
            
        Returns:
            Tuple of (latitude, longitude, altitude) in degrees and km
        """
        # Calculate GMST (Greenwich Mean Sidereal Time)
        # Simplified calculation for GMST
        T = (jd - 2451545.0) / 36525.0
        gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + \
               0.000387933 * T**2 - T**3 / 38710000.0
        gmst = gmst % 360.0
        gmst_rad = math.radians(gmst)
        
        # Rotate to ECEF
        cos_gmst = math.cos(gmst_rad)
        sin_gmst = math.sin(gmst_rad)
        
        x_ecef = x * cos_gmst + y * sin_gmst
        y_ecef = -x * sin_gmst + y * cos_gmst
        z_ecef = z
        
        # Convert ECEF to geodetic
        lon = math.degrees(math.atan2(y_ecef, x_ecef))
        
        # Iterative calculation for latitude
        r_xy = math.sqrt(x_ecef**2 + y_ecef**2)
        lat = math.degrees(math.atan2(z_ecef, r_xy))
        
        # Calculate altitude
        r = math.sqrt(x_ecef**2 + y_ecef**2 + z_ecef**2)
        alt = r - self.EARTH_RADIUS_KM
        
        return lat, lon, alt
    
    def get_orbit_track(
        self,
        tle_line1: str,
        tle_line2: str,
        start_time: datetime,
        duration_minutes: int = 90,
        step_seconds: int = 60
    ) -> List[Dict]:
        """
        Calculate orbit track over a time period.
        
        Args:
            tle_line1: TLE line 1
            tle_line2: TLE line 2
            start_time: Start time for track
            duration_minutes: Duration of track in minutes
            step_seconds: Time step in seconds
            
        Returns:
            List of position dictionaries
        """
        positions = []
        current_time = start_time
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        while current_time <= end_time:
            pos = self.propagate_satellite(tle_line1, tle_line2, current_time)
            if pos:
                positions.append(pos)
            current_time += timedelta(seconds=step_seconds)
        
        return positions
    
    def predict_passes(
        self,
        tle_line1: str,
        tle_line2: str,
        observer_lat: float,
        observer_lon: float,
        observer_alt: float = 0,
        start_time: datetime = None,
        days: int = 7,
        min_elevation: float = 10.0
    ) -> List[Dict]:
        """
        Predict satellite passes over an observer location.
        
        Args:
            tle_line1: TLE line 1
            tle_line2: TLE line 2
            observer_lat: Observer latitude in degrees
            observer_lon: Observer longitude in degrees
            observer_alt: Observer altitude in meters
            start_time: Start time for prediction
            days: Number of days to predict
            min_elevation: Minimum elevation angle in degrees
            
        Returns:
            List of pass dictionaries with rise, culmination, and set times
        """
        if start_time is None:
            start_time = datetime.utcnow()
        
        passes = []
        current_time = start_time
        end_time = start_time + timedelta(days=days)
        step = timedelta(seconds=60)
        
        in_pass = False
        pass_data = {}
        max_elevation = 0
        
        while current_time <= end_time:
            pos = self.propagate_satellite(tle_line1, tle_line2, current_time)
            
            if pos:
                elevation = self._calculate_elevation(
                    pos['latitude'], pos['longitude'], pos['altitude_km'],
                    observer_lat, observer_lon, observer_alt / 1000
                )
                
                if elevation >= min_elevation:
                    if not in_pass:
                        # Pass start
                        in_pass = True
                        pass_data = {
                            'rise_time': current_time.isoformat(),
                            'rise_azimuth': self._calculate_azimuth(
                                pos['latitude'], pos['longitude'],
                                observer_lat, observer_lon
                            ),
                        }
                        max_elevation = elevation
                    
                    if elevation > max_elevation:
                        max_elevation = elevation
                        pass_data['max_elevation'] = elevation
                        pass_data['max_elevation_time'] = current_time.isoformat()
                
                elif in_pass:
                    # Pass end
                    in_pass = False
                    pass_data['set_time'] = current_time.isoformat()
                    pass_data['set_azimuth'] = self._calculate_azimuth(
                        pos['latitude'], pos['longitude'],
                        observer_lat, observer_lon
                    )
                    passes.append(pass_data)
                    pass_data = {}
                    max_elevation = 0
            
            current_time += step
        
        return passes
    
    def _calculate_elevation(
        self,
        sat_lat: float,
        sat_lon: float,
        sat_alt: float,
        obs_lat: float,
        obs_lon: float,
        obs_alt: float
    ) -> float:
        """
        Calculate elevation angle from observer to satellite.
        Simplified calculation.
        """
        # Convert to radians
        sat_lat_rad = math.radians(sat_lat)
        sat_lon_rad = math.radians(sat_lon)
        obs_lat_rad = math.radians(obs_lat)
        obs_lon_rad = math.radians(obs_lon)
        
        # Angular distance
        d_lon = sat_lon_rad - obs_lon_rad
        cos_angle = (math.sin(obs_lat_rad) * math.sin(sat_lat_rad) +
                     math.cos(obs_lat_rad) * math.cos(sat_lat_rad) * math.cos(d_lon))
        angle = math.acos(max(-1, min(1, cos_angle)))
        
        # Approximate elevation calculation
        earth_radius = self.EARTH_RADIUS_KM
        sat_distance = earth_radius + sat_alt
        obs_distance = earth_radius + obs_alt
        
        # Use law of cosines to find slant range
        slant_range = math.sqrt(
            obs_distance**2 + sat_distance**2 -
            2 * obs_distance * sat_distance * cos_angle
        )
        
        # Calculate elevation angle
        if slant_range > 0:
            sin_elevation = (sat_distance * math.sin(angle)) / slant_range
            elevation = math.degrees(math.asin(max(-1, min(1, sin_elevation))))
            return max(0, 90 - math.degrees(angle) - elevation + 90)
        
        return 0
    
    def _calculate_azimuth(
        self,
        sat_lat: float,
        sat_lon: float,
        obs_lat: float,
        obs_lon: float
    ) -> float:
        """Calculate azimuth from observer to satellite."""
        sat_lat_rad = math.radians(sat_lat)
        sat_lon_rad = math.radians(sat_lon)
        obs_lat_rad = math.radians(obs_lat)
        obs_lon_rad = math.radians(obs_lon)
        
        d_lon = sat_lon_rad - obs_lon_rad
        
        x = math.sin(d_lon) * math.cos(sat_lat_rad)
        y = (math.cos(obs_lat_rad) * math.sin(sat_lat_rad) -
             math.sin(obs_lat_rad) * math.cos(sat_lat_rad) * math.cos(d_lon))
        
        azimuth = math.degrees(math.atan2(x, y))
        return (azimuth + 360) % 360
    
    def get_decay_analysis(self, satellite_id: int, days: int = 90) -> Dict:
        """
        Analyze orbital decay for a satellite using historical TLE data.
        
        Args:
            satellite_id: Database satellite ID
            days: Number of days of history to analyze
            
        Returns:
            Dictionary with decay analysis data
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        history = TLEHistory.query.filter(
            TLEHistory.satellite_id == satellite_id,
            TLEHistory.epoch >= cutoff_date
        ).order_by(TLEHistory.epoch).all()
        
        if len(history) < 2:
            return {'error': 'Insufficient historical data'}
        
        # Extract data points
        epochs = [h.epoch for h in history]
        altitudes = [(h.apogee_km + h.perigee_km) / 2 for h in history if h.apogee_km and h.perigee_km]
        semi_major_axes = [h.semi_major_axis_km for h in history if h.semi_major_axis_km]
        
        # Calculate decay rate (km per day)
        if len(altitudes) >= 2:
            time_span_days = (epochs[-1] - epochs[0]).total_seconds() / 86400
            if time_span_days > 0:
                altitude_change = altitudes[-1] - altitudes[0]
                decay_rate = altitude_change / time_span_days
            else:
                decay_rate = 0
        else:
            decay_rate = 0
        
        return {
            'satellite_id': satellite_id,
            'analysis_period_days': days,
            'data_points': len(history),
            'decay_rate_km_per_day': decay_rate,
            'current_altitude_km': altitudes[-1] if altitudes else None,
            'altitude_history': [
                {'epoch': h.epoch.isoformat(), 'altitude_km': (h.apogee_km + h.perigee_km) / 2}
                for h in history if h.apogee_km and h.perigee_km
            ],
        }


# Singleton instance
orbit_service = OrbitService()
