from typing import Dict, List, Any
from datetime import datetime, timedelta
import math
from sqlalchemy import func

from models import db, Satellite, Constellation, TLEHistory, Launch

class StatisticsService:
    EARTH_RADIUS_KM = 6378.137

    def get_constellation_summary(self, slug: str) -> Dict[str, Any]:
        """Basic summary stats for a constellation."""
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return None
            
        total = Satellite.query.filter_by(constellation_id=constellation.id).count()
        active = Satellite.query.filter_by(constellation_id=constellation.id, is_active=True).count()
        
        return {
            'name': constellation.name,
            'total_count': total,
            'active_count': active,
            'updated_at': constellation.updated_at.isoformat() if constellation.updated_at else None
        }

    def _get_first_epoch_map(self, constellation_id: int) -> Dict[int, datetime]:
        """Return earliest TLE epoch per satellite for a constellation."""
        rows = db.session.query(
            TLEHistory.satellite_id,
            func.min(TLEHistory.epoch)
        ).join(Satellite, Satellite.id == TLEHistory.satellite_id)\
         .filter(Satellite.constellation_id == constellation_id)\
         .group_by(TLEHistory.satellite_id).all()
        return {sat_id: epoch for sat_id, epoch in rows if epoch}

    def _estimate_launch_date(self, satellite: Satellite, first_epoch_map: Dict[int, datetime]) -> datetime:
        """Best-effort launch date estimation when SATCAT data is missing."""
        if satellite.launch_date:
            return datetime.combine(satellite.launch_date, datetime.min.time())
        
        # Parse international designator (format: YYNNN or YYYYNNN)
        # e.g., "19074B" -> 2019, launch 074
        if satellite.intl_designator:
            try:
                intl = satellite.intl_designator.strip()
                if len(intl) >= 5:
                    year_part = intl[:2]
                    year = int(year_part)
                    # Convert 2-digit year to 4-digit
                    if year >= 57:  # Sputnik launched 1957
                        year += 1900
                    else:
                        year += 2000
                    
                    # Try to extract launch number for rough month estimation
                    launch_num_str = ''.join(c for c in intl[2:5] if c.isdigit())
                    if launch_num_str:
                        launch_num = int(launch_num_str)
                        # Estimate month based on launch number (rough: assume ~30 launches/month globally)
                        estimated_month = min(12, max(1, (launch_num // 8) + 1))
                        return datetime(year, estimated_month, 15)
                    
                    return datetime(year, 1, 1)
            except (ValueError, TypeError, IndexError):
                pass
        
        if satellite.id in first_epoch_map:
            return first_epoch_map[satellite.id]
        if satellite.tle_epoch:
            return satellite.tle_epoch
        
        return None

    def get_orbital_decay(self, norad_id: int) -> List[Dict]:
        """
        Get altitude history for a satellite (Orbital Decay).
        """
        sat = Satellite.query.filter_by(norad_id=norad_id).first()
        if not sat:
            return []
            
        # Query TLEHistory for this satellite
        history = TLEHistory.query.filter_by(satellite_id=sat.id)\
            .order_by(TLEHistory.epoch.asc()).all()
            
        data = []
        for h in history:
            # Calculate mean altitude
            # Altitude = Semi-major axis - Earth Radius
            alt = h.semi_major_axis_km - self.EARTH_RADIUS_KM if h.semi_major_axis_km else 0
            
            # Filter valid altitudes (LEO usually > 150km, GEO ~36000km)
            if alt > 100:
                data.append({
                    'date': h.epoch.isoformat(),
                    'altitude_km': round(alt, 2),
                    'perigee_km': round(h.perigee_km, 2) if h.perigee_km else 0,
                    'apogee_km': round(h.apogee_km, 2) if h.apogee_km else 0,
                    'inclination_deg': round(h.inclination, 4) if h.inclination else 0
                })
        
        # If no history, add current state if available
        if not data and sat.semi_major_axis_km:
             alt = sat.semi_major_axis_km - self.EARTH_RADIUS_KM
             if alt > 100:
                 data.append({
                    'date': sat.tle_epoch.isoformat() if sat.tle_epoch else datetime.utcnow().isoformat(),
                    'altitude_km': round(alt, 2),
                    'perigee_km': round(sat.perigee_km, 2) if sat.perigee_km else 0,
                    'apogee_km': round(sat.apogee_km, 2) if sat.apogee_km else 0,
                    'inclination_deg': round(sat.inclination, 4) if sat.inclination else 0
                 })
                 
        return data

    def get_altitude_distribution(self, slug: str) -> List[Dict]:
        """
        Get distribution of satellite altitudes for a constellation.
        Returns histogram data.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
            
        # Get latest TLE for all satellites
        sats = Satellite.query.filter_by(constellation_id=constellation.id).all()
        altitudes = []
        
        for s in sats:
            if s.semi_major_axis_km:
                alt = s.semi_major_axis_km - self.EARTH_RADIUS_KM
                if 100 < alt < 100000:  # Filter meaningful ranges
                    altitudes.append(alt)
        
        if not altitudes:
            return []
            
        # Calculate histogram manually
        min_alt = min(altitudes)
        max_alt = max(altitudes)
        
        # Determine appropriate bin size (e.g., 20 bins)
        num_bins = 20
        if max_alt == min_alt:
            bin_width = 10
            max_alt += 10
        else:
            bin_width = (max_alt - min_alt) / num_bins
            
        bins = [0] * num_bins
        bin_edges = [min_alt + i * bin_width for i in range(num_bins + 1)]
        
        for alt in altitudes:
            index = int((alt - min_alt) / bin_width)
            if index >= num_bins:
                index = num_bins - 1
            bins[index] += 1
            
        result = []
        for i in range(num_bins):
            if bins[i] > 0:  # Only return populated bins to save space
                result.append({
                    'bin_start_km': round(bin_edges[i], 1),
                    'bin_end_km': round(bin_edges[i+1], 1),
                    'count': bins[i]
                })
            
        return result

    def get_inclination_distribution(self, slug: str) -> List[Dict]:
        """Get inclination distribution."""
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
            
        sats = Satellite.query.filter_by(constellation_id=constellation.id).all()
        inclinations = [s.inclination for s in sats if s.inclination is not None]
        
        if not inclinations:
            return []
            
        # Group by integer degree (simple histogram)
        dist = {}
        for inc in inclinations:
            key = round(inc, 1)  # Round to 1 decimal place
            dist[key] = dist.get(key, 0) + 1
            
        # Convert to list sorted by inclination
        result = [{'inclination': k, 'count': v} for k, v in sorted(dist.items())]
        return result

    def get_launch_history(self, slug: str, use_estimate: bool = False) -> List[Dict]:
        """
        Get launch history for a constellation.
        Returns list of launches with aggregated satellite stats.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
            
        # We need launches that contain satellites from this constellation
        launches = db.session.query(Launch, func.count(Satellite.id))\
            .join(Satellite)\
            .filter(Satellite.constellation_id == constellation.id)\
            .group_by(Launch.id)\
            .order_by(Launch.launch_date.desc())\
            .all()
            
        result = []
        for launch, count in launches:
            sats = Satellite.query.filter_by(launch_id=launch.id, constellation_id=constellation.id).all()
            
            inclinations = [s.inclination for s in sats if s.inclination]
            avg_incl = sum(inclinations)/len(inclinations) if inclinations else 0
            
            alts = [s.semi_major_axis_km - self.EARTH_RADIUS_KM for s in sats if s.semi_major_axis_km]
            avg_alt = sum(alts)/len(alts) if alts else 0
            
            active_count = sum(1 for s in sats if s.is_active)
            
            result.append({
                'launch_id': launch.id,
                'cospar_id': launch.cospar_id,
                'mission': launch.mission_name or launch.cospar_id,
                'date': launch.launch_date.isoformat() if launch.launch_date else None,
                'site': launch.launch_site,
                'rocket': launch.rocket_type or 'Unknown',
                'status': 'success' if launch.launch_success else 'failure',
                'count': count,
                'active_count': active_count,
                'avg_altitude_km': round(avg_alt, 1),
                'avg_inclination_deg': round(avg_incl, 1)
            })

        if result or not use_estimate:
            return result

        # Fallback: build synthetic launch groups from satellites if Launch table is empty
        sats = Satellite.query.filter_by(constellation_id=constellation.id).all()
        if not sats:
            return []

        first_epoch_map = self._get_first_epoch_map(constellation.id)
        grouped = {}
        for s in sats:
            launch_key = None
            if s.intl_designator and len(s.intl_designator) >= 8:
                launch_key = s.intl_designator[:8]
            else:
                est_date = self._estimate_launch_date(s, first_epoch_map)
                launch_key = est_date.strftime('%Y') if est_date else 'Unknown'

            grouped.setdefault(launch_key, []).append(s)

        fallback = []
        for key, group in grouped.items():
            inclinations = [s.inclination for s in group if s.inclination]
            avg_incl = sum(inclinations) / len(inclinations) if inclinations else 0
            alts = [s.semi_major_axis_km - self.EARTH_RADIUS_KM for s in group if s.semi_major_axis_km]
            avg_alt = sum(alts) / len(alts) if alts else 0
            active_count = sum(1 for s in group if s.is_active)

            # Use estimated date if possible
            est_date = None
            if key != 'Unknown' and '-' in key:
                try:
                    year = int(key[:4])
                    est_date = datetime(year, 1, 1)
                except ValueError:
                    est_date = None
            if not est_date:
                # Use earliest epoch in group
                epochs = [self._estimate_launch_date(s, first_epoch_map) for s in group]
                epochs = [e for e in epochs if e]
                est_date = min(epochs) if epochs else None

            fallback.append({
                'launch_id': None,
                'cospar_id': key if key != 'Unknown' else None,
                'mission': key if key != 'Unknown' else 'Unknown',
                'date': est_date.isoformat() if est_date else None,
                'site': 'Unknown',
                'rocket': 'Unknown',
                'status': 'success',
                'count': len(group),
                'active_count': active_count,
                'avg_altitude_km': round(avg_alt, 1),
                'avg_inclination_deg': round(avg_incl, 1)
            })

        # Sort newest first
        fallback.sort(key=lambda r: r['date'] or '', reverse=True)
        return fallback

    def get_constellation_growth(self, slug: str, use_estimate: bool = False) -> List[Dict]:
        """
        Get historical satellite counts over time.
        Returns: date, active (in orbit), total (launched), decayed
        
        Always uses estimation from intl_designator when launch_date is missing,
        since Space-Track SATCAT data may not be fully synced.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
            
        sats = Satellite.query.filter_by(constellation_id=constellation.id).all()
        
        # Build events: (date, event_type)
        # event_type: 'launch' or 'decay'
        events = []
        first_epoch_map = self._get_first_epoch_map(constellation.id) if sats else {}
        
        for s in sats:
            # Try real launch_date first, then estimate from intl_designator
            launch_dt = None
            if s.launch_date:
                launch_dt = s.launch_date
            else:
                est = self._estimate_launch_date(s, first_epoch_map)
                if est:
                    launch_dt = est.date()
            
            if launch_dt:
                events.append((launch_dt, 'launch'))
            
            if s.decay_date:
                events.append((s.decay_date, 'decay'))

        # Sort by date
        events.sort(key=lambda x: x[0])
        
        data = []
        total_launched = 0
        total_decayed = 0
        current_date = None
        
        for date, event_type in events:
            date_str = date.isoformat()
            
            # Save previous day's data before changing date
            if date_str != current_date:
                if current_date is not None:
                    data.append({
                        'date': current_date,
                        'total': total_launched,
                        'decayed': total_decayed,
                        'active': total_launched - total_decayed
                    })
                current_date = date_str
            
            # Update counters
            if event_type == 'launch':
                total_launched += 1
            elif event_type == 'decay':
                total_decayed += 1
            
        # Add final entry
        if current_date:
            data.append({
                'date': current_date,
                'total': total_launched,
                'decayed': total_decayed,
                'active': total_launched - total_decayed
            })
            
        # Add today's snapshot
        today = datetime.utcnow().date().isoformat()
        if not data or data[-1]['date'] != today:
            data.append({
                'date': today,
                'total': total_launched,
                'decayed': total_decayed,
                'active': total_launched - total_decayed
            })
            
        return data

    def get_decay_history(self, slug: str) -> List[Dict]:
        """
        Get list of decayed satellites.
        """
        constellation = Constellation.query.filter_by(slug=slug).first()
        if not constellation:
            return []
            
        decayed_sats = Satellite.query.filter(
            Satellite.constellation_id == constellation.id,
            Satellite.decay_date.isnot(None)
        ).order_by(Satellite.decay_date.desc()).all()
        
        return [{
            'norad_id': s.norad_id,
            'name': s.name,
            'intl_designator': s.intl_designator,
            'decay_date': s.decay_date.isoformat(),
            'launch_date': s.launch_date.isoformat() if s.launch_date else None,
            'reason': 'decayed'
        } for s in decayed_sats]

statistics_service = StatisticsService()
