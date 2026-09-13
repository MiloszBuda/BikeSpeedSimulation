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
    avg_temperature_c: Optional[float] = None


class WeatherSummary(BaseModel):
    avg_temp_c: float
    avg_pressure_hpa: float
    avg_air_density_kg_m3: float
    avg_wind_speed_10m_mps: float
    avg_wind_speed_cyclist_mps: float
    dominant_wind_dir_deg: float
    is_fallback: bool = Field(default=False, description="True if standard atmospheric fallback was used due to API limits or network issues")
    fallback_reason: Optional[str] = Field(default=None, description="Detailed reason if fallback weather was used")


class FitInspectResponse(BaseModel):
    summary: FitSummary
    sample_points: List[TrackPoint]


class FitProcessResponse(BaseModel):
    summary: FitSummary
    weather_summary: WeatherSummary
    points: List[EnrichedPoint]


# --- Physics & Chung Estimation Models ---

class ChungEstimateRequest(BaseModel):
    mass_kg: float = Field(default=78.0, description="Total mass of cyclist and equipment (kg)")
    drivetrain_efficiency: float = Field(default=0.97, description="Mechanical drivetrain efficiency eta")
    fixed_crr: Optional[float] = Field(default=None, description="If provided, Crr is fixed and only CdA is optimized")
    initial_cda: float = Field(default=0.32, description="Initial guess for CdA")
    initial_crr: float = Field(default=0.004, description="Initial guess for Crr")


class ChungEstimateResponse(BaseModel):
    cda: float = Field(..., description="Estimated aerodynamic drag area CdA (m^2)")
    crr: float = Field(..., description="Estimated rolling resistance coefficient Crr")
    r_squared: float = Field(..., description="Coefficient of determination between virtual and real elevation")
    rmse_m: float = Field(..., description="Root Mean Squared Error of elevation fit (meters)")
    virtual_elevation_m: List[float] = Field(..., description="Calculated virtual elevation profile h_virt(t)")
    real_elevation_m: List[float] = Field(..., description="Smoothed real elevation profile h_real(t)")
    time_offset_s: List[int] = Field(..., description="Time offsets in seconds")


# --- What-If Simulation Models ---

class PacingMode:
    ORIGINAL = "original"
    CONSTANT_AVG = "constant_avg"
    ADAPTIVE_SLOPE = "adaptive_slope"


class WhatIfSimulationRequest(BaseModel):
    mass_kg: float = Field(default=78.0, description="Total mass in kg")
    cda: float = Field(default=0.32, description="Aerodynamic drag area CdA (m^2)")
    crr: float = Field(default=0.004, description="Rolling resistance coefficient Crr")
    drivetrain_efficiency: float = Field(default=0.97, description="Drivetrain efficiency eta")
    spatial_step_m: float = Field(default=5.0, description="Spatial discretization step delta_x in meters")
    
    # Wind scenario controls
    zero_wind: bool = Field(default=False, description="Simulate purely windless conditions")
    wind_scale_factor: float = Field(default=1.0, description="Wind speed multiplier (e.g. 0.0 to 2.0)")
    wind_rotation_deg: float = Field(default=0.0, description="Rotate wind direction by degrees (+180 for headwind reversal)")
    
    # Route scenario controls
    reverse_route: bool = Field(default=False, description="Ride route in reverse ('pod prąd')")
    pacing_mode: str = Field(default="original", description="Pacing mode: 'original', 'constant_avg', or 'adaptive_slope'")
    calculate_equivalent_power: bool = Field(default=True, description="Compute power needed to match baseline time")


class SpatialPoint(BaseModel):
    distance_m: float
    lat: float
    lon: float
    elevation_m: float
    slope: float
    bearing_deg: float
    power_w: float
    wind_speed_mps: float
    wind_dir_deg: float
    simulated_speed_mps: float
    simulated_speed_kmh: float
    baseline_speed_mps: float
    baseline_speed_kmh: float
    delta_time_s: float = Field(..., description="Cumulative time gain (+) or loss (-) compared to baseline (seconds)")
    power_effective_w: Optional[float] = Field(default=None, description="Effective power transferred to drivetrain after inertia lag")
    acceleration_mps2: Optional[float] = Field(default=None, description="Instantaneous acceleration along trajectory (m/s^2)")


class SimulationSummary(BaseModel):
    total_distance_m: float
    baseline_time_s: float
    simulated_time_s: float
    time_delta_s: float = Field(..., description="Time difference (baseline - simulated): positive means faster")
    baseline_avg_speed_kmh: float
    simulated_avg_speed_kmh: float
    equivalent_power_w: Optional[float] = Field(
        default=None,
        description="Power needed under the simulated conditions to match the baseline time",
    )
    pacing_mode: str
    reverse_route: bool
    wind_scenario: str


class WhatIfSimulationResponse(BaseModel):
    summary: SimulationSummary
    spatial_points: List[SpatialPoint]

