"""Pydantic models for FIT data, weather series, and combined physics vectors."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class GeoBoundingBox(BaseModel):
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    center_lat: float
    center_lon: float


class TrackPoint(BaseModel):
    time_offset_s: int = Field(..., description="Seconds since ride start")
    timestamp: datetime = Field(..., description="UTC timestamp")
    lat: float = Field(..., description="Latitude in decimal degrees")
    lon: float = Field(..., description="Longitude in decimal degrees")
    elevation_m: float = Field(..., description="Elevation above sea level in meters")
    distance_m: float = Field(..., description="Cumulative distance from start in meters")
    speed_mps: float = Field(..., description="Ground speed in m/s")
    speed_kmh: float = Field(..., description="Ground speed in km/h")
    power_w: float = Field(default=0.0, description="Cyclist mechanical power in Watts")
    bearing_deg: float = Field(..., description="Heading / bearing of bike movement [0, 360) degrees")
    cadence_rpm: Optional[float] = Field(default=None, description="Cadence in RPM")
    heart_rate_bpm: Optional[float] = Field(default=None, description="Heart rate in BPM")


class WeatherPoint(BaseModel):
    temp_c: float = Field(..., description="Temperature at 2m in Celsius")
    surface_pressure_hpa: float = Field(..., description="Surface atmospheric pressure in hPa")
    surface_pressure_pa: float = Field(..., description="Surface atmospheric pressure in Pa")
    wind_speed_10m_mps: float = Field(..., description="Wind speed at 10m height in m/s")
    wind_speed_cyclist_mps: float = Field(..., description="Adjusted wind speed at cyclist height (z~1.2m) in m/s")
    wind_direction_deg: float = Field(..., description="Direction from which wind originates [0, 360) degrees")
    relative_humidity_pct: Optional[float] = Field(default=None, description="Relative humidity %")
    air_density_kg_m3: float = Field(..., description="Calculated air density rho (kg/m^3)")


class EnrichedPoint(BaseModel):
    # Track metrics
    time_offset_s: int
    timestamp: datetime
    lat: float
    lon: float
    elevation_m: float
    distance_m: float
    speed_mps: float
    speed_kmh: float
    power_w: float
    bearing_deg: float
    cadence_rpm: Optional[float] = None
    heart_rate_bpm: Optional[float] = None

    # Weather metrics
    temp_c: float
    surface_pressure_hpa: float
    surface_pressure_pa: float
    wind_speed_10m_mps: float
    wind_speed_cyclist_mps: float
    wind_direction_deg: float
    relative_humidity_pct: Optional[float] = None
    air_density_kg_m3: float

    # Vector geometry metrics
    yaw_angle_deg: float = Field(..., description="Yaw angle beta (relative wind direction vs bike bearing)")
    headwind_comp_mps: float = Field(..., description="Wind component along bike axis (positive = headwind, negative = tailwind)")
    crosswind_comp_mps: float = Field(..., description="Wind component perpendicular to bike axis")
    apparent_wind_speed_mps: float = Field(..., description="Apparent wind speed v_app felt by cyclist in m/s")
    apparent_wind_angle_deg: float = Field(..., description="Apparent wind attack angle psi in degrees")


class FitSummary(BaseModel):
    start_time: datetime
    end_time: datetime
    duration_s: float
    total_distance_m: float
    avg_speed_kmh: float
    max_speed_kmh: float
    avg_power_w: float
    normalized_power_w: Optional[float] = None
    total_elevation_gain_m: float
    total_elevation_loss_m: float
    bbox: GeoBoundingBox
    points_count: int


class WeatherSummary(BaseModel):
    avg_temp_c: float
    avg_pressure_hpa: float
    avg_air_density_kg_m3: float
    avg_wind_speed_10m_mps: float
    avg_wind_speed_cyclist_mps: float
    dominant_wind_dir_deg: float


class FitInspectResponse(BaseModel):
    summary: FitSummary
    sample_points: List[TrackPoint]


class FitProcessResponse(BaseModel):
    summary: FitSummary
    weather_summary: WeatherSummary
    points: List[EnrichedPoint]
