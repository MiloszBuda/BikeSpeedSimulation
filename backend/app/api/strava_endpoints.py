"""FastAPI endpoints for Strava OAuth 2.0, activities listing, and stream processing."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
import numpy as np

from app.schemas.fit import FitProcessResponse
from app.schemas.strava import (
    StravaActivitiesResponse,
    StravaAuthStatusResponse,
    StravaAuthUrlResponse,
    StravaTokenExchangeRequest,
)
from app.services.strava_adapter import StravaAdapter
from app.services.strava_service import StravaService
from app.services.weather_service import WeatherService
from app.services.wind_analysis import WindAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/strava", tags=["Strava API"])
strava_service = StravaService()
weather_service = WeatherService()


@router.get(
    "/auth-url",
    response_model=StravaAuthUrlResponse,
    summary="Get Strava OAuth authorization URL",
)
async def get_strava_auth_url(
    client_id: Optional[str] = Query(None, description="Optional Strava client_id override"),
    redirect_uri: Optional[str] = Query(None, description="Optional redirect URI"),
):
    """Generate Strava OAuth authorization URL with activity:read_all scope."""
    url = strava_service.get_auth_url(client_id=client_id, redirect_uri=redirect_uri)
    from app.config import settings
    cid = client_id or settings.STRAVA_CLIENT_ID
    return StravaAuthUrlResponse(auth_url=url, client_id=cid)


@router.post(
    "/exchange-token",
    summary="Exchange authorization code for tokens and persist credentials",
)
async def exchange_strava_code(request: StravaTokenExchangeRequest):
    """Exchange temporary authorization code for persistent tokens and store athlete credentials in SQLite."""
    try:
        data = await strava_service.exchange_code_for_token(
            code=request.code,
            client_id=request.client_id,
            client_secret=request.client_secret,
        )
        athlete = data.get("athlete", {})
        return {
            "success": True,
            "athlete": {
                "id": athlete.get("id"),
                "username": athlete.get("username"),
                "firstname": athlete.get("firstname"),
                "lastname": athlete.get("lastname"),
                "profile": athlete.get("profile"),
            },
            "expires_at": data.get("expires_at"),
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error exchanging Strava code")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/status",
    response_model=StravaAuthStatusResponse,
    summary="Check Strava connection status and athlete profile",
)
async def get_strava_status():
    """Check whether a Strava athlete is currently connected."""
    return strava_service.get_auth_status()


@router.post(
    "/disconnect",
    summary="Disconnect Strava account and clear credentials",
)
async def disconnect_strava():
    """Disconnect Strava and remove saved credentials."""
    strava_service.disconnect()
    return {"success": True, "message": "Rozłączono ze Stravą."}


@router.get(
    "/activities",
    response_model=StravaActivitiesResponse,
    summary="List athlete activities with caching",
)
async def get_strava_activities(
    before: Optional[int] = Query(None, description="Epoch timestamp filter (before)"),
    after: Optional[int] = Query(None, description="Epoch timestamp filter (after)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(30, ge=1, le=100, description="Items per page"),
    force_refresh: bool = Query(False, description="Bypass local SQLite cache and fetch from Strava API"),
):
    """
    Retrieve athlete activities from Strava or local SQLite cache.
    Includes badges for outdoor rides with real power meter data (device_watts=true).
    """
    try:
        activities = await strava_service.fetch_activities(
            before=before,
            after=after,
            page=page,
            per_page=per_page,
            force_refresh=force_refresh,
        )
        return StravaActivitiesResponse(
            activities=activities,
            total=len(activities),
            page=page,
            per_page=per_page,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching Strava activities")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/activities/{activity_id}/streams",
    summary="Get 1 Hz activity streams",
)
async def get_activity_streams(
    activity_id: int,
    force_refresh: bool = Query(False, description="Force refresh streams from Strava API"),
):
    """Retrieve 1 Hz data streams for an activity from SQLite cache or Strava API."""
    try:
        streams = await strava_service.get_activity_streams(
            activity_id=activity_id,
            force_refresh=force_refresh,
        )
        return streams
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error fetching streams for activity {activity_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post(
    "/activities/{activity_id}/process",
    response_model=FitProcessResponse,
    summary="Load a Strava activity directly into the simulation pipeline",
)
async def process_strava_activity(
    activity_id: int,
    wind_scale_factor: Optional[float] = Query(1.0),
    wind_rotation_deg: Optional[float] = Query(0.0),
):
    """
    Convert Strava activity streams into TrackPoints, fetch historical Open-Meteo weather,
    and compute apparent wind vectors. Enables 1-click loading of any Strava activity.
    """
    try:
        streams = await strava_service.get_activity_streams(activity_id=activity_id)
        track_points, summary = StravaAdapter.streams_to_track_points(streams)

        # Activity date bounds in UTC for Open-Meteo
        start_date_str = summary.start_time.strftime("%Y-%m-%d")
        end_date_str = summary.end_time.strftime("%Y-%m-%d")

        target_timestamps = [tp.timestamp for tp in track_points]
        avg_elev = float(np.mean([tp.elevation_m for tp in track_points])) if track_points else 150.0

        weather_points, weather_summary = await weather_service.get_weather_for_track(
            lat=summary.bbox.center_lat,
            lon=summary.bbox.center_lon,
            start_date=start_date_str,
            end_date=end_date_str,
            target_timestamps=target_timestamps,
            avg_elevation_m=avg_elev,
            temp_c_hint=summary.avg_temperature_c,
        )

        scale = 1.0 if wind_scale_factor is None else wind_scale_factor
        rot = 0.0 if wind_rotation_deg is None else wind_rotation_deg

        if scale != 1.0 or rot != 0.0:
            modified_weather = []
            for wp in weather_points:
                w_10m = wp.wind_speed_10m_mps * scale
                w_dir = (wp.wind_direction_deg + rot) % 360.0
                w_cyclist = weather_service.scale_wind_speed(w_10m)

                from app.schemas.fit import WeatherPoint
                modified_weather.append(
                    WeatherPoint(
                        temp_c=wp.temp_c,
                        surface_pressure_hpa=wp.surface_pressure_hpa,
                        surface_pressure_pa=wp.surface_pressure_pa,
                        wind_speed_10m_mps=w_10m,
                        wind_speed_cyclist_mps=w_cyclist,
                        wind_direction_deg=w_dir,
                        relative_humidity_pct=wp.relative_humidity_pct,
                        air_density_kg_m3=wp.air_density_kg_m3,
                    )
                )
            weather_points = modified_weather

        enriched_points = WindAnalysisService.enrich_track_with_weather(track_points, weather_points)

        return FitProcessResponse(
            summary=summary,
            weather_summary=weather_summary,
            points=enriched_points,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to process Strava activity {activity_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd przetwarzania aktywności ze Stravy: {str(e)}",
        )
