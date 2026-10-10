"""Pydantic schemas for Strava API integration, OAuth, and stream processing."""

from typing import List, Optional
from pydantic import BaseModel, Field


class StravaAuthUrlResponse(BaseModel):
    auth_url: str
    client_id: str


class StravaTokenExchangeRequest(BaseModel):
    code: str = Field(..., description="Authorization code returned by Strava redirect")
    client_id: Optional[str] = Field(default=None, description="Optional override for Strava client_id")
    client_secret: Optional[str] = Field(default=None, description="Optional override for Strava client_secret")


class StravaAthlete(BaseModel):
    id: int
    username: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    profile: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None


class StravaAuthStatusResponse(BaseModel):
    connected: bool
    athlete: Optional[StravaAthlete] = None
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[int] = None
    has_credentials: bool = False


class StravaActivityMeta(BaseModel):
    id: int
    name: str
    distance_m: float
    moving_time_s: int
    elapsed_time_s: int
    total_elevation_gain_m: float
    type: str
    sport_type: str
    start_date: str
    start_date_local: str
    timezone: Optional[str] = None
    trainer: bool
    device_watts: bool
    gear_id: Optional[str] = None
    gear_name: Optional[str] = None
    average_speed_mps: float
    max_speed_mps: float
    average_watts: Optional[float] = None
    weighted_average_watts: Optional[float] = None
    has_streams: bool = False
    is_outdoor_with_power: bool = False


class StravaActivitiesResponse(BaseModel):
    activities: List[StravaActivityMeta]
    total: int
    page: int
    per_page: int


class StravaCalibrateRequest(BaseModel):
    activity_ids: List[int] = Field(..., min_length=1, description="List of Strava activity IDs to calibrate against")
    mass_kg: float = Field(default=78.0, ge=40.0, le=150.0, description="Cyclist + bike mass in kg")
    window_duration_s: int = Field(default=300, ge=120, le=900, description="Energy window duration in seconds")
    gear_id: Optional[str] = Field(default=None, description="Optional bike/gear ID filter")


class StravaRateLimitInfo(BaseModel):
    short_limit: int = 200
    short_usage: int = 0
    long_limit: int = 2000
    long_usage: int = 0
