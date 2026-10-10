"""Adapter converting Strava API activity streams to standardized TrackPoint and FitSummary models.

Matches the exact interface and schema produced by FitParser, enabling seamless
plug-and-play downstream simulation, Chung analysis, and multi-activity parameter calibration.
"""

from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from app.schemas.fit import FitSummary, GeoBoundingBox, TrackPoint
from app.services.fit_parser import calculate_bearing, calculate_normalized_power


class StravaAdapter:
    """Transforms raw Strava streams JSON into 1 Hz resampled TrackPoint series and FitSummary."""

    @staticmethod
    def streams_to_track_points(
        streams: Union[Dict[str, Any], List[Dict[str, Any]]],
        start_time_iso: Optional[str] = None,
        default_power: float = 0.0,
    ) -> Tuple[List[TrackPoint], FitSummary]:
        """Convert Strava streams payload to List[TrackPoint] and FitSummary.

        Calculates ground speed from raw distance differences rather than
        relying on Strava's pre-smoothed velocity_smooth, per calibration requirements.
        """
        # 1. Normalize streams format to dict keyed by type name
        streams_by_type: Dict[str, List[Any]] = {}
        if isinstance(streams, list):
            for item in streams:
                if isinstance(item, dict) and "type" in item and "data" in item:
                    streams_by_type[item["type"]] = item["data"]
        elif isinstance(streams, dict):
            for k, v in streams.items():
                if isinstance(v, dict) and "data" in v:
                    streams_by_type[k] = v["data"]
                elif isinstance(v, list):
                    streams_by_type[k] = v

        time_data = streams_by_type.get("time")
        if not time_data:
            raise ValueError("Brak wymaganego strumienia 'time' w odpowiedzi ze Stravy.")

        n_pts = len(time_data)
        if n_pts < 2:
            raise ValueError("Strumień aktywności zawiera zbyt mało punktów (<2).")

        # Parse start datetime
        if start_time_iso:
            try:
                base_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
                if base_dt.tzinfo is None:
                    base_dt = base_dt.replace(tzinfo=timezone.utc)
            except Exception:
                base_dt = datetime.now(timezone.utc)
        else:
            base_dt = datetime.now(timezone.utc)

        # Extract available stream lists
        dist_data = streams_by_type.get("distance", [0.0] * n_pts)
        latlng_data = streams_by_type.get("latlng", [])
        alt_data = streams_by_type.get("altitude", [100.0] * n_pts)
        vel_data = streams_by_type.get("velocity_smooth", [0.0] * n_pts)
        watts_data = streams_by_type.get("watts", [default_power] * n_pts)
        cadence_data = streams_by_type.get("cadence")
        hr_data = streams_by_type.get("heartrate")
        temp_data = streams_by_type.get("temp")

        # Fallback dummy coordinates if latlng missing (e.g. indoor trainer activity)
        has_gps = bool(latlng_data and len(latlng_data) == n_pts and len(latlng_data[0]) >= 2)

        # 2. Compute point-by-point speed from distance differences
        # User requirement: velocity_smooth jest już wygładzone, więc liczymy prędkość z distance.
        calc_speed = np.zeros(n_pts, dtype=np.float64)
        for i in range(1, n_pts):
            dt = float(time_data[i] - time_data[i - 1])
            dd = float(dist_data[i] - dist_data[i - 1]) if i < len(dist_data) else 0.0
            if dt > 1e-3 and dd >= 0.0:
                calc_speed[i] = min(35.0, dd / dt)
            else:
                # Fallback to velocity_smooth if dt=0 or distance non-increasing
                calc_speed[i] = float(vel_data[i]) if i < len(vel_data) else 0.0
        calc_speed[0] = calc_speed[1] if n_pts > 1 else 0.0

        # 3. Compute bearing from consecutive GPS points
        bearings = np.zeros(n_pts, dtype=np.float64)
        last_bearing = 0.0
        if has_gps:
            for i in range(1, n_pts):
                p_prev = latlng_data[i - 1]
                p_curr = latlng_data[i]
                if p_prev and p_curr and (p_prev[0] != p_curr[0] or p_prev[1] != p_curr[1]):
                    last_bearing = calculate_bearing(p_prev[0], p_prev[1], p_curr[0], p_curr[1])
                bearings[i] = last_bearing
            bearings[0] = bearings[1] if n_pts > 1 else 0.0

        # 4. Resample to uniform 1 Hz time series
        total_duration_s = int(time_data[-1] - time_data[0])
        total_distance_m = float(dist_data[-1] - dist_data[0]) if dist_data else 0.0

        raw_time = np.array(time_data, dtype=np.float64)
        target_t = np.arange(int(raw_time[0]), int(raw_time[-1]) + 1, dtype=np.float64)

        interp_dist = np.interp(target_t, raw_time, np.array(dist_data, dtype=np.float64))
        interp_speed = np.interp(target_t, raw_time, calc_speed)
        interp_alt = np.interp(target_t, raw_time, np.array(alt_data, dtype=np.float64))
        interp_watts = np.interp(target_t, raw_time, np.array(watts_data, dtype=np.float64))

        if has_gps:
            raw_lats = np.array([p[0] for p in latlng_data], dtype=np.float64)
            raw_lons = np.array([p[1] for p in latlng_data], dtype=np.float64)
            interp_lat = np.interp(target_t, raw_time, raw_lats)
            interp_lon = np.interp(target_t, raw_time, raw_lons)
            # Circular interpolation of bearing
            rad_bear = np.radians(bearings)
            bx = np.interp(target_t, raw_time, np.cos(rad_bear))
            by = np.interp(target_t, raw_time, np.sin(rad_bear))
            interp_bearing = (np.degrees(np.arctan2(by, bx)) + 360.0) % 360.0
        else:
            interp_lat = np.full_like(target_t, 52.2297)
            interp_lon = np.full_like(target_t, 21.0122)
            interp_bearing = np.zeros_like(target_t)

        interp_cadence = (
            np.interp(target_t, raw_time, np.array(cadence_data, dtype=np.float64))
            if cadence_data
            else None
        )
        interp_hr = (
            np.interp(target_t, raw_time, np.array(hr_data, dtype=np.float64))
            if hr_data
            else None
        )
        interp_temp = (
            np.interp(target_t, raw_time, np.array(temp_data, dtype=np.float64))
            if temp_data
            else None
        )

        track_points: List[TrackPoint] = []
        start_offset_s = int(target_t[0])

        for idx, t_val in enumerate(target_t):
            offset_s = int(t_val - start_offset_s)
            ts = datetime.fromtimestamp(base_dt.timestamp() + offset_s, tz=timezone.utc)
            spd_mps = float(max(0.0, interp_speed[idx]))

            track_points.append(
                TrackPoint(
                    time_offset_s=offset_s,
                    timestamp=ts,
                    lat=float(interp_lat[idx]),
                    lon=float(interp_lon[idx]),
                    elevation_m=float(interp_alt[idx]),
                    distance_m=float(interp_dist[idx]),
                    speed_mps=spd_mps,
                    speed_kmh=float(spd_mps * 3.6),
                    power_w=float(max(0.0, interp_watts[idx])),
                    bearing_deg=float(interp_bearing[idx]),
                    cadence_rpm=float(interp_cadence[idx]) if interp_cadence is not None else None,
                    heart_rate_bpm=float(interp_hr[idx]) if interp_hr is not None else None,
                )
            )

        # 5. Build FitSummary
        alt_diffs = np.diff(interp_alt)
        elev_gain = float(np.sum(alt_diffs[alt_diffs > 0])) if len(alt_diffs) > 0 else 0.0
        elev_loss = float(np.abs(np.sum(alt_diffs[alt_diffs < 0]))) if len(alt_diffs) > 0 else 0.0

        min_lat = float(np.min(interp_lat))
        max_lat = float(np.max(interp_lat))
        min_lon = float(np.min(interp_lon))
        max_lon = float(np.max(interp_lon))

        bbox = GeoBoundingBox(
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
            center_lat=float((min_lat + max_lat) / 2.0),
            center_lon=float((min_lon + max_lon) / 2.0),
        )

        avg_speed_mps = float(np.mean(interp_speed)) if len(interp_speed) > 0 else 0.0
        max_speed_mps = float(np.max(interp_speed)) if len(interp_speed) > 0 else 0.0
        avg_power = float(np.mean(interp_watts)) if len(interp_watts) > 0 else 0.0
        np_power = calculate_normalized_power(interp_watts)
        avg_temp = float(np.mean(interp_temp)) if interp_temp is not None else None

        summary = FitSummary(
            start_time=track_points[0].timestamp,
            end_time=track_points[-1].timestamp,
            duration_s=float(len(track_points)),
            total_distance_m=float(total_distance_m),
            avg_speed_kmh=float(avg_speed_mps * 3.6),
            max_speed_kmh=float(max_speed_mps * 3.6),
            avg_power_w=avg_power,
            normalized_power_w=np_power,
            total_elevation_gain_m=elev_gain,
            total_elevation_loss_m=elev_loss,
            bbox=bbox,
            points_count=len(track_points),
            avg_temperature_c=avg_temp,
        )

        return track_points, summary
