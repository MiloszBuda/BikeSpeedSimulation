"""Apparent wind vector geometry and aerodynamic flow calculations."""

import math
from typing import List, Tuple

import numpy as np

from app.schemas.fit import EnrichedPoint, TrackPoint, WeatherPoint


def calculate_apparent_wind_single(
    bike_speed_mps: float,
    bike_bearing_deg: float,
    wind_speed_mps: float,
    wind_dir_deg: float,
) -> Tuple[float, float, float, float, float]:
    """
    Compute vector components of apparent wind for a single observation.
    
    Returns:
        (yaw_angle_deg, headwind_comp_mps, crosswind_comp_mps, v_app_mps, psi_deg)
    """
    # Relative wind angle beta = wind_dir - bike_bearing
    beta_deg = (wind_dir_deg - bike_bearing_deg + 360.0) % 360.0
    beta_rad = math.radians(beta_deg)

    # Parallel component (positive = headwind, negative = tailwind)
    headwind_comp = wind_speed_mps * math.cos(beta_rad)
    # Perpendicular component (crosswind)
    crosswind_comp = wind_speed_mps * math.sin(beta_rad)

    # Forward air velocity facing the cyclist
    v_head = bike_speed_mps + headwind_comp

    # Resultant apparent wind speed
    v_app = math.sqrt(v_head**2 + crosswind_comp**2)

    # Apparent attack angle psi
    psi_rad = math.atan2(crosswind_comp, v_head)
    psi_deg = math.degrees(psi_rad)

    return beta_deg, headwind_comp, crosswind_comp, v_app, psi_deg


def calculate_apparent_wind_vectorized(
    bike_speed: np.ndarray,
    bike_bearing: np.ndarray,
    wind_speed: np.ndarray,
    wind_dir: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Vectorized computation of apparent wind over arrays.
    All angular inputs in degrees, speeds in m/s.
    """
    beta_deg = (wind_dir - bike_bearing + 360.0) % 360.0
    beta_rad = np.radians(beta_deg)

    headwind_comp = wind_speed * np.cos(beta_rad)
    crosswind_comp = wind_speed * np.sin(beta_rad)

    v_head = bike_speed + headwind_comp
    v_app = np.sqrt(v_head**2 + crosswind_comp**2)

    psi_rad = np.arctan2(crosswind_comp, v_head)
    psi_deg = np.degrees(psi_rad)

    return beta_deg, headwind_comp, crosswind_comp, v_app, psi_deg


class WindAnalysisService:
    """Service for enriching track points with apparent wind vector components."""

    @staticmethod
    def enrich_track_with_weather(
        track_points: List[TrackPoint],
        weather_points: List[WeatherPoint],
    ) -> List[EnrichedPoint]:
        """Combine 1 Hz track points and 1 Hz weather points into EnrichedPoints."""
        if len(track_points) != len(weather_points):
            raise ValueError(
                f"Mismatched points length: track={len(track_points)}, weather={len(weather_points)}"
            )

        n = len(track_points)
        bike_speed = np.array([tp.speed_mps for tp in track_points], dtype=np.float64)
        bike_bearing = np.array([tp.bearing_deg for tp in track_points], dtype=np.float64)
        wind_speed = np.array([wp.wind_speed_cyclist_mps for wp in weather_points], dtype=np.float64)
        wind_dir = np.array([wp.wind_direction_deg for wp in weather_points], dtype=np.float64)

        betas, headwinds, crosswinds, v_apps, psis = calculate_apparent_wind_vectorized(
            bike_speed, bike_bearing, wind_speed, wind_dir
        )

        enriched_points: List[EnrichedPoint] = []
        for i in range(n):
            tp = track_points[i]
            wp = weather_points[i]

            enriched_points.append(
                EnrichedPoint(
                    # Track fields
                    time_offset_s=tp.time_offset_s,
                    timestamp=tp.timestamp,
                    lat=tp.lat,
                    lon=tp.lon,
                    elevation_m=tp.elevation_m,
                    distance_m=tp.distance_m,
                    speed_mps=tp.speed_mps,
                    speed_kmh=tp.speed_kmh,
                    power_w=tp.power_w,
                    bearing_deg=tp.bearing_deg,
                    cadence_rpm=tp.cadence_rpm,
                    heart_rate_bpm=tp.heart_rate_bpm,
                    # Weather fields
                    temp_c=wp.temp_c,
                    surface_pressure_hpa=wp.surface_pressure_hpa,
                    surface_pressure_pa=wp.surface_pressure_pa,
                    wind_speed_10m_mps=wp.wind_speed_10m_mps,
                    wind_speed_cyclist_mps=wp.wind_speed_cyclist_mps,
                    wind_direction_deg=wp.wind_direction_deg,
                    relative_humidity_pct=wp.relative_humidity_pct,
                    air_density_kg_m3=wp.air_density_kg_m3,
                    # Vector geometry fields
                    yaw_angle_deg=float(betas[i]),
                    headwind_comp_mps=float(headwinds[i]),
                    crosswind_comp_mps=float(crosswinds[i]),
                    apparent_wind_speed_mps=float(v_apps[i]),
                    apparent_wind_angle_deg=float(psis[i]),
                )
            )

        return enriched_points
