"""Pydantic schemas for multi-activity parameter auto-calibration."""

from typing import List, Optional
from pydantic import BaseModel, Field


class EnergyWindow(BaseModel):
    activity_id: str
    start_s: int
    end_s: int
    duration_s: float
    delta_h_m: float
    delta_v2_mps2: float
    work_power_j: float
    aero_integral: float
    rr_integral: float
    avg_speed_kmh: float
    avg_power_w: float
    avg_slope_pct: float


class ActivityCalibrationMeta(BaseModel):
    activity_id: str
    name: Optional[str] = None
    date: Optional[str] = None
    distance_km: float
    duration_min: float
    avg_power_w: float
    avg_speed_kmh: float
    windows_count: int
    loo_speed_rmse_kmh: Optional[float] = None
    loo_time_error_s: Optional[float] = None
    loo_time_error_pct: Optional[float] = None


class CalibrationRequest(BaseModel):
    mass_kg: float = Field(default=78.0, ge=40.0, le=150.0, description="Cyclist + bicycle total mass (kg)")
    window_duration_s: int = Field(default=300, ge=120, le=900, description="Energy window duration in seconds (2 to 15 min)")
    gear_id: Optional[str] = Field(default=None, description="Optional bike/gear ID filter")
    prior_eta: float = Field(default=0.97, ge=0.85, le=1.0)
    prior_cda: float = Field(default=0.32, ge=0.15, le=0.60)
    prior_crr: float = Field(default=0.004, ge=0.001, le=0.015)
    fixed_eta: Optional[float] = Field(default=None, description="If provided, fixes drivetrain efficiency eta")


class CalibrationResponse(BaseModel):
    cda: float = Field(..., description="Estimated aerodynamic drag area CdA in m^2")
    crr: float = Field(..., description="Estimated rolling resistance coefficient Crr")
    eta: float = Field(..., description="Estimated mechanical drivetrain efficiency eta")
    cda_std: float = Field(..., description="Standard error / uncertainty of CdA")
    crr_std: float = Field(..., description="Standard error / uncertainty of Crr")
    eta_std: float = Field(..., description="Standard error / uncertainty of eta")
    mass_kg: float = Field(..., description="Total system mass used in estimation")
    n_activities: int = Field(..., description="Number of activities included")
    total_windows: int = Field(..., description="Total number of valid energy balance windows solved")
    gear_id: Optional[str] = Field(default=None, description="Bike / gear ID")
    eta_fixed: bool = Field(default=False, description="True if eta was fixed because climbs were insufficient")
    eta_reason: Optional[str] = Field(default=None, description="Reason if eta was held fixed")
    condition_number: float = Field(..., description="Condition number of the linear system matrix")
    validation_mean_rmse_kmh: Optional[float] = Field(default=None, description="Mean LOO validation speed RMSE across activities")
    validation_mean_time_error_pct: Optional[float] = Field(default=None, description="Mean LOO validation total time absolute % error")
    activities: List[ActivityCalibrationMeta] = Field(default_factory=list)
    diagnostics: List[str] = Field(default_factory=list)
    badge_text: str = Field(..., description="Concise badge e.g. 'auto, n=7, CdA 0.315 ±0.012'")
