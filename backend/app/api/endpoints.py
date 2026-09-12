"""FastAPI router endpoints for FIT parsing and weather processing."""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.schemas.fit import FitInspectResponse, FitProcessResponse
from app.services.fit_parser import FitParser
from app.services.weather_service import WeatherService
from app.services.wind_analysis import WindAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["FIT & Weather"])
weather_service = WeatherService()


@router.get("/health", summary="Health check")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "Bike Speed Simulation Backend"}


@router.post(
    "/fit/inspect",
    response_model=FitInspectResponse,
    summary="Inspect and summarize a .fit file without fetching weather",
)
async def inspect_fit(file: UploadFile = File(...)):
    """
    Upload a .FIT activity file to extract summary statistics (duration, distance,
    elevation gain/loss, avg speed, avg power, bounding box) and sample points.
    """
    if not file.filename.lower().endswith(".fit"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a .fit extension.",
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        track_points, summary = FitParser.parse_fit_bytes(content)

        # Downsample sample_points if too many (up to ~100 points for preview)
        step = max(1, len(track_points) // 100)
        sample_points = track_points[::step]

        return FitInspectResponse(summary=summary, sample_points=sample_points)

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Error parsing FIT file: {e}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during FIT inspection")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process FIT file: {str(e)}",
        )


@router.post(
    "/fit/process",
    response_model=FitProcessResponse,
    summary="Upload .fit file, fetch historical Open-Meteo weather, and calculate apparent wind vectors",
)
async def process_fit(
    file: UploadFile = File(...),
    wind_speed_override_mps: Optional[float] = Form(
        None, description="Optional manual override for wind speed (m/s)"
    ),
    wind_dir_override_deg: Optional[float] = Form(
        None, description="Optional manual override for wind direction [0, 360) degrees"
    ),
    wind_scale_factor: Optional[float] = Form(
        1.0, description="Multiplier for historical wind speed (e.g. 1.5 = 50% stronger, 0 = no wind)"
    ),
    wind_rotation_deg: Optional[float] = Form(
        0.0, description="Angle in degrees to rotate wind direction (e.g. 180 to reverse wind)"
    ),
):
    """
    Complete processing pipeline:
    1. Parse and validate binary .FIT activity.
    2. Resample to uniform 1 Hz time series.
    3. Query Open-Meteo Historical Reanalysis (ERA5) for the activity location & time.
    4. Compute air density and logarithmic wind profile at cyclist height.
    5. Calculate apparent wind vectors (v_app, yaw angle beta, crosswind, headwind, apparent angle psi).
    """
    if not file.filename.lower().endswith(".fit"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a .fit extension.",
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        track_points, summary = FitParser.parse_fit_bytes(content)

        # Activity date bounds in UTC for Open-Meteo
        start_date_str = summary.start_time.strftime("%Y-%m-%d")
        end_date_str = summary.end_time.strftime("%Y-%m-%d")

        # Fetch Open-Meteo weather for activity centroid
        try:
            weather_raw = await weather_service.fetch_weather_raw(
                lat=summary.bbox.center_lat,
                lon=summary.bbox.center_lon,
                start_date=start_date_str,
                end_date=end_date_str,
            )
        except Exception as e:
            logger.error(f"Failed to fetch weather from Open-Meteo: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Open-Meteo weather service error: {str(e)}",
            )

        # Interpolate weather to 1 Hz timestamps
        target_timestamps = [tp.timestamp for tp in track_points]
        weather_points, weather_summary = weather_service.interpolate_to_timestamps(
            weather_raw, target_timestamps
        )

        # Apply any wind overrides or modifiers
        scale = 1.0 if wind_scale_factor is None else wind_scale_factor
        rot = 0.0 if wind_rotation_deg is None else wind_rotation_deg

        if wind_speed_override_mps is not None or scale != 1.0 or rot != 0.0 or wind_dir_override_deg is not None:
            modified_weather = []
            for wp in weather_points:
                w_10m = wind_speed_override_mps if wind_speed_override_mps is not None else (wp.wind_speed_10m_mps * scale)
                w_dir = wind_dir_override_deg if wind_dir_override_deg is not None else ((wp.wind_direction_deg + rot) % 360.0)
                w_cyclist = weather_service.scale_wind_speed(w_10m)

                modified_weather.append(
                    wp.model_copy(
                        update={
                            "wind_speed_10m_mps": w_10m,
                            "wind_speed_cyclist_mps": w_cyclist,
                            "wind_direction_deg": w_dir,
                        }
                    )
                )
            weather_points = modified_weather

        # Enrich track with apparent wind geometry
        enriched_points = WindAnalysisService.enrich_track_with_weather(
            track_points, weather_points
        )

        return FitProcessResponse(
            summary=summary,
            weather_summary=weather_summary,
            points=enriched_points,
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation or parsing error: {e}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during FIT processing")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process activity: {str(e)}",
        )
