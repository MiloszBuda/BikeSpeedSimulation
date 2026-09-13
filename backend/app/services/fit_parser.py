"""FIT file parsing, cleaning, and 1 Hz time-series resampling service."""

import io
import math
from datetime import datetime, timezone
from typing import BinaryIO, List, Optional, Tuple, Union

import fitdecode
import numpy as np
import polars as pl

from app.schemas.fit import FitSummary, GeoBoundingBox, TrackPoint

SEMICIRCLE_TO_DEGREES = 180.0 / 2147483648.0


def _to_degrees(val: Optional[Union[int, float]]) -> Optional[float]:
    """Convert semicircles to decimal degrees if needed."""
    if val is None:
        return None
    # If magnitude is greater than 180, it's in semicircles
    if abs(val) > 180.0:
        return float(val * SEMICIRCLE_TO_DEGREES)
    return float(val)


def _to_utc_datetime(dt_val: Union[datetime, int, float]) -> datetime:
    """Ensure datetime is UTC aware."""
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            return dt_val.replace(tzinfo=timezone.utc)
        return dt_val.astimezone(timezone.utc)
    # Garmin epoch fallback (seconds since 1989-12-31 00:00:00 UTC)
    garmin_epoch_unix = 631065600
    unix_ts = garmin_epoch_unix + dt_val
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc)


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate initial great-circle bearing from (lat1, lon1) to (lat2, lon2).
    Returns bearing in degrees [0, 360) where 0 is True North, 90 is East.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)

    bearing_rad = math.atan2(y, x)
    bearing_deg = math.degrees(bearing_rad)
    return (bearing_deg + 360.0) % 360.0


def calculate_normalized_power(power_series: np.ndarray) -> Optional[float]:
    """
    Calculate Normalized Power (NP) using the Coggan algorithm:
    1. 30-second rolling average of power
    2. Raise each value to the 4th power
    3. Take average of these values
    4. Take 4th root of average
    """
    if len(power_series) < 30 or np.all(power_series == 0):
        return None
    
    # 30-second moving average
    kernel = np.ones(30) / 30.0
    rolling_30s = np.convolve(power_series, kernel, mode="valid")
    if len(rolling_30s) == 0:
        return None
    
    mean_p4 = np.mean(rolling_30s**4)
    return float(mean_p4**0.25)


class FitParser:
    """Service to parse, validate and resample FIT files to 1 Hz."""

    @staticmethod
    def parse_fit_bytes(fit_bytes: bytes) -> Tuple[List[TrackPoint], FitSummary]:
        """Parse raw FIT bytes and return 1 Hz resampled track points and summary."""
        file_obj = io.BytesIO(fit_bytes)
        return FitParser.parse_fit_stream(file_obj)

    @staticmethod
    def parse_fit_stream(stream: BinaryIO) -> Tuple[List[TrackPoint], FitSummary]:
        """Parse FIT file stream and return 1 Hz resampled track points and summary."""
        raw_records = []

        with fitdecode.FitReader(stream, check_crc=fitdecode.CrcCheck.WARN) as fit:
            for frame in fit:
                if not isinstance(frame, fitdecode.FitDataMessage) or frame.name != "record":
                    continue

                ts = frame.get_value("timestamp", fallback=None)
                if ts is None:
                    continue
                dt = _to_utc_datetime(ts)

                lat = _to_degrees(frame.get_value("position_lat", fallback=None))
                lon = _to_degrees(frame.get_value("position_long", fallback=None))

                # Read speed (enhanced_speed if available)
                speed = frame.get_value("enhanced_speed", fallback=None)
                if speed is None:
                    speed = frame.get_value("speed", fallback=None)

                # Read altitude
                altitude = frame.get_value("enhanced_altitude", fallback=None)
                if altitude is None:
                    altitude = frame.get_value("altitude", fallback=None)

                distance = frame.get_value("distance", fallback=None)
                power = frame.get_value("power", fallback=0.0)
                cadence = frame.get_value("cadence", fallback=None)
                heart_rate = frame.get_value("heart_rate", fallback=None)
                temp = frame.get_value("temperature", fallback=None)

                raw_records.append({
                    "timestamp": dt,
                    "lat": lat,
                    "lon": lon,
                    "speed": float(speed) if speed is not None else None,
                    "altitude": float(altitude) if altitude is not None else None,
                    "distance": float(distance) if distance is not None else None,
                    "power": float(power) if power is not None else 0.0,
                    "cadence": float(cadence) if cadence is not None else None,
                    "heart_rate": float(heart_rate) if heart_rate is not None else None,
                    "temperature": float(temp) if temp is not None else None,
                })

        if not raw_records:
            raise ValueError("No record frames found in FIT file.")

        # Sort by timestamp and filter duplicates
        raw_records.sort(key=lambda r: r["timestamp"])
        unique_records = []
        seen_timestamps = set()
        for r in raw_records:
            if r["timestamp"] not in seen_timestamps:
                seen_timestamps.add(r["timestamp"])
                unique_records.append(r)

        # Check if we have valid GPS points
        gps_records = [r for r in unique_records if r["lat"] is not None and r["lon"] is not None]
        if not gps_records:
            raise ValueError("FIT file contains no records with valid GPS coordinates (lat/lon).")

        # If some points have missing GPS, interpolate them or filter
        # For simplicity and accuracy, base time grid on records with GPS
        return FitParser._resample_to_1hz(gps_records)

    @staticmethod
    def _resample_to_1hz(records: List[dict]) -> Tuple[List[TrackPoint], FitSummary]:
        """Resample irregularly spaced records to uniform 1 Hz time series."""
        start_time = records[0]["timestamp"]
        end_time = records[-1]["timestamp"]
        total_seconds = int((end_time - start_time).total_seconds())

        if total_seconds <= 0:
            raise ValueError("FIT activity duration is 0 seconds.")

        # Source timestamps in seconds relative to start_time
        src_t = np.array([(r["timestamp"] - start_time).total_seconds() for r in records], dtype=np.float64)
        target_t = np.arange(0, total_seconds + 1, 1, dtype=np.float64)

        # Interpolate coordinates
        src_lat = np.array([r["lat"] for r in records], dtype=np.float64)
        src_lon = np.array([r["lon"] for r in records], dtype=np.float64)
        interp_lat = np.interp(target_t, src_t, src_lat)
        interp_lon = np.interp(target_t, src_t, src_lon)

        # Interpolate altitude
        alt_values = [r["altitude"] for r in records if r["altitude"] is not None]
        if alt_values:
            # Fill missing altitudes with nearest
            clean_alt = []
            last_alt = alt_values[0]
            for r in records:
                if r["altitude"] is not None:
                    last_alt = r["altitude"]
                clean_alt.append(last_alt)
            interp_alt = np.interp(target_t, src_t, np.array(clean_alt, dtype=np.float64))
        else:
            interp_alt = np.zeros_like(target_t)

        # Interpolate power
        src_power = np.array([r["power"] if r["power"] is not None else 0.0 for r in records], dtype=np.float64)
        interp_power = np.interp(target_t, src_t, src_power)

        # Distance & Speed
        src_dist = [r["distance"] for r in records]
        has_distance = any(d is not None for d in src_dist)
        if has_distance:
            clean_dist = []
            last_d = 0.0
            for d in src_dist:
                if d is not None:
                    last_d = d
                clean_dist.append(last_d)
            interp_dist = np.interp(target_t, src_t, np.array(clean_dist, dtype=np.float64))
        else:
            # Compute distance cumulatively from GPS
            interp_dist = np.zeros_like(target_t)
            for i in range(1, len(target_t)):
                d = FitParser._haversine_distance(interp_lat[i-1], interp_lon[i-1], interp_lat[i], interp_lon[i])
                interp_dist[i] = interp_dist[i-1] + d

        # Speed (m/s)
        src_speed = [r["speed"] for r in records]
        has_speed = any(s is not None for s in src_speed)
        if has_speed:
            clean_speed = [s if s is not None else 0.0 for s in src_speed]
            interp_speed = np.interp(target_t, src_t, np.array(clean_speed, dtype=np.float64))
        else:
            # Derive speed from distance gradient
            interp_speed = np.gradient(interp_dist)
            interp_speed = np.maximum(interp_speed, 0.0)

        # Cadence & Heart Rate (optional)
        has_cadence = any(r["cadence"] is not None for r in records)
        interp_cadence = (
            np.interp(target_t, src_t, np.array([r["cadence"] or 0.0 for r in records], dtype=np.float64))
            if has_cadence
            else None
        )

        has_hr = any(r["heart_rate"] is not None for r in records)
        interp_hr = (
            np.interp(target_t, src_t, np.array([r["heart_rate"] or 0.0 for r in records], dtype=np.float64))
            if has_hr
            else None
        )

        # Bearings
        bearings = np.zeros_like(target_t)
        last_bearing = 0.0
        for i in range(len(target_t) - 1):
            d_step = FitParser._haversine_distance(interp_lat[i], interp_lon[i], interp_lat[i+1], interp_lon[i+1])
            if d_step > 0.3:  # Only update bearing if moved more than 30 cm
                last_bearing = calculate_bearing(interp_lat[i], interp_lon[i], interp_lat[i+1], interp_lon[i+1])
            bearings[i] = last_bearing
        bearings[-1] = last_bearing

        # Build TrackPoints
        track_points: List[TrackPoint] = []
        for i, t_offset in enumerate(target_t):
            point_dt = datetime.fromtimestamp(start_time.timestamp() + t_offset, tz=timezone.utc)
            speed_mps = float(interp_speed[i])
            track_points.append(
                TrackPoint(
                    time_offset_s=int(t_offset),
                    timestamp=point_dt,
                    lat=float(interp_lat[i]),
                    lon=float(interp_lon[i]),
                    elevation_m=float(interp_alt[i]),
                    distance_m=float(interp_dist[i]),
                    speed_mps=speed_mps,
                    speed_kmh=speed_mps * 3.6,
                    power_w=float(interp_power[i]),
                    bearing_deg=float(bearings[i]),
                    cadence_rpm=float(interp_cadence[i]) if interp_cadence is not None else None,
                    heart_rate_bpm=float(interp_hr[i]) if interp_hr is not None else None,
                )
            )

        # Summary statistics
        total_dist = float(interp_dist[-1] - interp_dist[0])
        elev_diffs = np.diff(interp_alt)
        elev_gain = float(np.sum(elev_diffs[elev_diffs > 0])) if len(elev_diffs) > 0 else 0.0
        elev_loss = float(np.abs(np.sum(elev_diffs[elev_diffs < 0]))) if len(elev_diffs) > 0 else 0.0

        avg_speed_mps = total_dist / total_seconds if total_seconds > 0 else 0.0
        max_speed_mps = float(np.max(interp_speed))

        min_lat, max_lat = float(np.min(interp_lat)), float(np.max(interp_lat))
        min_lon, max_lon = float(np.min(interp_lon)), float(np.max(interp_lon))

        temp_values = [r["temperature"] for r in records if r.get("temperature") is not None]
        avg_temp_c = float(np.mean(temp_values)) if temp_values else None

        summary = FitSummary(
            start_time=start_time,
            end_time=end_time,
            duration_s=float(total_seconds),
            total_distance_m=total_dist,
            avg_speed_kmh=avg_speed_mps * 3.6,
            max_speed_kmh=max_speed_mps * 3.6,
            avg_power_w=float(np.mean(interp_power)),
            normalized_power_w=calculate_normalized_power(interp_power),
            total_elevation_gain_m=elev_gain,
            total_elevation_loss_m=elev_loss,
            bbox=GeoBoundingBox(
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
                center_lat=(min_lat + max_lat) / 2.0,
                center_lon=(min_lon + max_lon) / 2.0,
            ),
            points_count=len(track_points),
            avg_temperature_c=avg_temp_c,
        )

        return track_points, summary

    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Great circle distance between two points on Earth in meters."""
        r_earth = 6371000.0  # meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r_earth * c
