"""FastAPI router endpoints for FIT parsing and weather processing."""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
import numpy as np

from app.schemas.fit import (
    ChungEstimateResponse,
    FitInspectResponse,
    FitProcessResponse,
    WhatIfSimulationResponse,
)
from app.services.fit_parser import FitParser
from app.services.weather_service import WeatherService
from app.services.wind_analysis import WindAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["FIT & Weather"])
weather_service = WeatherService()


@router.get("/health", summary="Health check")
@router.get("/ping", summary="Ping check")
@router.get("/status", summary="Status check")
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


@router.post(
    "/physics/estimate-cda",
    response_model=ChungEstimateResponse,
    summary="Estimate aerodynamic drag CdA and rolling resistance Crr using Chung's Virtual Elevation method",
)
async def estimate_cda(
    file: UploadFile = File(...),
    mass_kg: float = Form(78.0),
    drivetrain_efficiency: float = Form(0.97),
    fixed_crr: Optional[float] = Form(None),
    initial_cda: float = Form(0.32),
    initial_crr: float = Form(0.004),
):
    """
    Fits CdA (and optionally Crr) to match virtual elevation profile h_virt(t) with real elevation.
    Ideal for closed loops (out-and-back, velodrome, circuit) with minimal braking.
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

        # Fetch Open-Meteo weather
        start_date_str = summary.start_time.strftime("%Y-%m-%d")
        end_date_str = summary.end_time.strftime("%Y-%m-%d")
        weather_raw = await weather_service.fetch_weather_raw(
            lat=summary.bbox.center_lat,
            lon=summary.bbox.center_lon,
            start_date=start_date_str,
            end_date=end_date_str,
        )
        weather_points, _ = weather_service.interpolate_to_timestamps(
            weather_raw, [tp.timestamp for tp in track_points]
        )
        enriched = WindAnalysisService.enrich_track_with_weather(track_points, weather_points)

        # Arrays for Chung fitting
        p_arr = np.array([pt.power_w for pt in enriched], dtype=np.float64)
        v_arr = np.array([pt.speed_mps for pt in enriched], dtype=np.float64)
        v_app_arr = np.array([pt.apparent_wind_speed_mps for pt in enriched], dtype=np.float64)
        rho_arr = np.array([pt.air_density_kg_m3 for pt in enriched], dtype=np.float64)
        h_real_arr = np.array([pt.elevation_m for pt in enriched], dtype=np.float64)

        from app.services.chung_service import ChungService
        res = ChungService.fit_parameters(
            P=p_arr,
            v=v_arr,
            v_app=v_app_arr,
            rho=rho_arr,
            m=mass_kg,
            h_real=h_real_arr,
            dt=1.0,
            eta=drivetrain_efficiency,
            initial_cda=initial_cda,
            initial_crr=initial_crr,
            fixed_crr=fixed_crr,
        )

        return ChungEstimateResponse(
            cda=res["cda"],
            crr=res["crr"],
            r_squared=res["r_squared"],
            rmse_m=res["rmse_m"],
            virtual_elevation_m=res["virtual_elevation"],
            real_elevation_m=res["real_elevation"],
            time_offset_s=[pt.time_offset_s for pt in enriched],
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error in estimate-cda: {e}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in estimate-cda")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fit CdA: {str(e)}",
        )


@router.post(
    "/simulation/what-if",
    response_model=WhatIfSimulationResponse,
    summary="Run distance-domain 'What-If' simulation under modified wind and route conditions",
)
async def simulate_what_if(
    file: UploadFile = File(...),
    mass_kg: float = Form(78.0),
    cda: float = Form(0.32),
    crr: float = Form(0.004),
    drivetrain_efficiency: float = Form(0.97),
    spatial_step_m: float = Form(5.0),
    zero_wind: bool = Form(False),
    wind_scale_factor: float = Form(1.0),
    wind_rotation_deg: float = Form(0.0),
    reverse_route: bool = Form(False),
    pacing_mode: str = Form("original"),
    calculate_equivalent_power: bool = Form(True),
):
    """
    Run spatial simulation in the distance domain (delta_x = 5m).
    Supports:
    - Zero wind / scaled wind (0x - 2x) / wind angle rotation
    - Route reversal ('Jazda pod prąd') with inverted grade
    - Adaptive pacing models (reducing power on descents, increasing on climbs)
    - Equivalent power calculation to match baseline time
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

        # Fetch Open-Meteo weather
        start_date_str = summary.start_time.strftime("%Y-%m-%d")
        end_date_str = summary.end_time.strftime("%Y-%m-%d")
        weather_raw = await weather_service.fetch_weather_raw(
            lat=summary.bbox.center_lat,
            lon=summary.bbox.center_lon,
            start_date=start_date_str,
            end_date=end_date_str,
        )
        weather_points, _ = weather_service.interpolate_to_timestamps(
            weather_raw, [tp.timestamp for tp in track_points]
        )
        enriched = WindAnalysisService.enrich_track_with_weather(track_points, weather_points)

        from app.services.simulation_engine import SimulationEngine
        from app.schemas.fit import WhatIfSimulationRequest

        sim_request = WhatIfSimulationRequest(
            mass_kg=mass_kg,
            cda=cda,
            crr=crr,
            drivetrain_efficiency=drivetrain_efficiency,
            spatial_step_m=spatial_step_m,
            zero_wind=zero_wind,
            wind_scale_factor=wind_scale_factor,
            wind_rotation_deg=wind_rotation_deg,
            reverse_route=reverse_route,
            pacing_mode=pacing_mode,
            calculate_equivalent_power=calculate_equivalent_power,
        )

        return SimulationEngine.run_simulation(enriched, sim_request)

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error in simulation: {e}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in simulation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation failed: {str(e)}",
        )

