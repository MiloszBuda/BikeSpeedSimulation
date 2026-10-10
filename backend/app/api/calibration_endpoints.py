"""FastAPI endpoints for multi-activity parameter auto-calibration."""

import logging
from typing import List, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
import numpy as np

from app.schemas.calibration import (
    CalibrationRequest,
    CalibrationResponse,
)
from app.schemas.fit import EnrichedPoint
from app.schemas.strava import StravaCalibrateRequest
from app.services.calibration_service import CalibrationService
from app.services.fit_parser import FitParser
from app.services.strava_adapter import StravaAdapter
from app.services.strava_service import StravaService
from app.services.weather_service import WeatherService
from app.services.wind_analysis import WindAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calibration", tags=["Auto-Calibration"])
weather_service = WeatherService()
strava_service = StravaService()


@router.post(
    "/calibrate-fit",
    response_model=CalibrationResponse,
    summary="Auto-calibrate CdA, Crr, and eta across multiple uploaded .FIT files",
)
async def calibrate_from_fit_files(
    files: List[UploadFile] = File(..., description="List of 2 to 20 .FIT activity files"),
    mass_kg: float = Form(78.0, ge=40.0, le=150.0, description="Total cyclist + bike mass in kg"),
    window_duration_s: int = Form(300, ge=120, le=900, description="Window size in seconds"),
    gear_id: Optional[str] = Form(None, description="Optional bike/gear ID"),
    prior_eta: float = Form(0.97, ge=0.85, le=1.0),
    prior_cda: float = Form(0.32, ge=0.15, le=0.60),
    prior_crr: float = Form(0.004, ge=0.001, le=0.015),
    fixed_eta: Optional[float] = Form(None, ge=0.85, le=1.0),
):
    """
    Multi-activity calibration pipeline on uploaded .FIT files:
    1. Parse each .FIT file into 1 Hz time series.
    2. Query historical weather and calculate apparent wind vectors.
    3. Extract non-braking moving energy balance windows.
    4. Solve constrained regularized linear least squares for (CdA, Crr, eta).
    5. Perform leave-one-out cross-validation to compute generalization RMSE.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prześlij co najmniej jeden plik .fit do kalibracji.",
        )

    activities_data = []

    for idx, f in enumerate(files):
        if not f.filename.lower().endswith(".fit"):
            continue

        try:
            content = await f.read()
            if len(content) == 0:
                continue

            track_points, summary = FitParser.parse_fit_bytes(content)

            # Check if activity has real power meter data
            avg_p = float(summary.avg_power_w)
            if avg_p < 20.0:
                logger.info(f"Skipping file {f.filename}: avg power too low ({avg_p}W, likely no powermeter).")
                continue

            # Fetch weather for activity centroid
            start_date_str = summary.start_time.strftime("%Y-%m-%d")
            end_date_str = summary.end_time.strftime("%Y-%m-%d")
            target_timestamps = [tp.timestamp for tp in track_points]
            avg_elev = float(np.mean([tp.elevation_m for tp in track_points])) if track_points else 150.0

            weather_points, _ = await weather_service.get_weather_for_track(
                lat=summary.bbox.center_lat,
                lon=summary.bbox.center_lon,
                start_date=start_date_str,
                end_date=end_date_str,
                target_timestamps=target_timestamps,
                avg_elevation_m=avg_elev,
                temp_c_hint=summary.avg_temperature_c,
            )

            enriched = WindAnalysisService.enrich_track_with_weather(track_points, weather_points)
            act_id = f"fit_{idx + 1}_{f.filename}"
            activities_data.append((act_id, f.filename, start_date_str, enriched))

        except Exception as e:
            logger.warning(f"Failed to process file {f.filename} during calibration: {e}")

    if not activities_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Żaden z przesłanych plików nie zawiera poprawnych danych z miernikiem mocy.",
        )

    calib_request = CalibrationRequest(
        mass_kg=mass_kg,
        window_duration_s=window_duration_s,
        gear_id=gear_id,
        prior_eta=prior_eta,
        prior_cda=prior_cda,
        prior_crr=prior_crr,
        fixed_eta=fixed_eta,
    )

    try:
        response = CalibrationService.run_multi_activity_calibration(activities_data, calib_request)
        # Cache result locally
        strava_service.save_calibration_result(
            athlete_id=None,
            gear_id=gear_id,
            mass_kg=mass_kg,
            res=response.model_dump(),
            activity_ids=[i for i in range(len(activities_data))],
        )
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Calibration calculation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd podczas kalibracji parametrów: {str(e)}",
        )


@router.post(
    "/calibrate-strava",
    response_model=CalibrationResponse,
    summary="Auto-calibrate CdA, Crr, and eta using selected Strava activities",
)
async def calibrate_from_strava(request: StravaCalibrateRequest):
    """
    Auto-calibrate physical parameters from selected Strava activities:
    1. Retrieve 1 Hz streams for each activity from cache or Strava API.
    2. Convert to TrackPoints via StravaAdapter and enrich with weather.
    3. Run regularized energy-window least-squares solver and LOO cross-validation.
    """
    if not request.activity_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wybierz co najmniej jedną aktywność ze Stravy do kalibracji.",
        )

    activities_data = []

    for act_id in request.activity_ids:
        try:
            streams = await strava_service.get_activity_streams(act_id)
            track_points, summary = StravaAdapter.streams_to_track_points(streams)

            if summary.avg_power_w < 20.0:
                logger.info(f"Skipping Strava activity {act_id}: avg power too low ({summary.avg_power_w}W).")
                continue

            # Fetch weather
            start_date_str = summary.start_time.strftime("%Y-%m-%d")
            end_date_str = summary.end_time.strftime("%Y-%m-%d")
            target_timestamps = [tp.timestamp for tp in track_points]
            avg_elev = float(np.mean([tp.elevation_m for tp in track_points])) if track_points else 150.0

            weather_points, _ = await weather_service.get_weather_for_track(
                lat=summary.bbox.center_lat,
                lon=summary.bbox.center_lon,
                start_date=start_date_str,
                end_date=end_date_str,
                target_timestamps=target_timestamps,
                avg_elevation_m=avg_elev,
                temp_c_hint=summary.avg_temperature_c,
            )

            enriched = WindAnalysisService.enrich_track_with_weather(track_points, weather_points)
            activities_data.append((str(act_id), f"Strava #{act_id}", start_date_str, enriched))

        except Exception as e:
            logger.warning(f"Failed to process Strava activity {act_id} for calibration: {e}")

    if not activities_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nie udało się pobrać danych ze strumieni wybranych aktywności Stravy lub brak danych z miernika mocy.",
        )

    calib_req = CalibrationRequest(
        mass_kg=request.mass_kg,
        window_duration_s=request.window_duration_s,
        gear_id=request.gear_id,
    )

    try:
        response = CalibrationService.run_multi_activity_calibration(activities_data, calib_req)
        # Save in SQLite
        strava_service.save_calibration_result(
            athlete_id=None,
            gear_id=request.gear_id,
            mass_kg=request.mass_kg,
            res=response.model_dump(),
            activity_ids=request.activity_ids,
        )
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Strava calibration failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd podczas kalibracji ze Stravy: {str(e)}",
        )


@router.get(
    "/latest",
    summary="Retrieve the most recent auto-calibration result",
)
async def get_latest_calibration():
    """Retrieve the most recent auto-calibration result from SQLite cache."""
    latest = strava_service.get_latest_calibration_result()
    if not latest:
        return {"calibrated": False, "result": None}
    return {"calibrated": True, "result": latest}
