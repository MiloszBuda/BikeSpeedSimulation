"""Tests for apparent wind vector geometry and flow analysis."""

import math
from datetime import datetime, timezone
import numpy as np
import pytest

from app.schemas.fit import TrackPoint, WeatherPoint
from app.services.wind_analysis import (
    WindAnalysisService,
    calculate_apparent_wind_single,
    calculate_apparent_wind_vectorized,
)


def test_apparent_wind_pure_headwind():
    # Bike heading North (0 deg), speed 10 m/s
    # Wind from North (0 deg), speed 4 m/s
    beta, headwind, crosswind, v_app, psi = calculate_apparent_wind_single(
        bike_speed_mps=10.0,
        bike_bearing_deg=0.0,
        wind_speed_mps=4.0,
        wind_dir_deg=0.0,
    )

    assert math.isclose(beta, 0.0, abs_tol=1e-3)
    assert math.isclose(headwind, 4.0, abs_tol=1e-3)
    assert math.isclose(crosswind, 0.0, abs_tol=1e-3)
    assert math.isclose(v_app, 14.0, abs_tol=1e-3)
    assert math.isclose(psi, 0.0, abs_tol=1e-3)


def test_apparent_wind_pure_tailwind():
    # Bike heading North (0 deg), speed 10 m/s
    # Wind from South (180 deg), speed 4 m/s
    beta, headwind, crosswind, v_app, psi = calculate_apparent_wind_single(
        bike_speed_mps=10.0,
        bike_bearing_deg=0.0,
        wind_speed_mps=4.0,
        wind_dir_deg=180.0,
    )

    assert math.isclose(beta, 180.0, abs_tol=1e-3)
    assert math.isclose(headwind, -4.0, abs_tol=1e-3)
    assert math.isclose(crosswind, 0.0, abs_tol=1e-3)
    assert math.isclose(v_app, 6.0, abs_tol=1e-3)
    assert math.isclose(psi, 0.0, abs_tol=1e-3)


def test_apparent_wind_pure_crosswind():
    # Bike heading North (0 deg), speed 10 m/s
    # Wind from East (90 deg), speed 10 m/s
    beta, headwind, crosswind, v_app, psi = calculate_apparent_wind_single(
        bike_speed_mps=10.0,
        bike_bearing_deg=0.0,
        wind_speed_mps=10.0,
        wind_dir_deg=90.0,
    )

    assert math.isclose(beta, 90.0, abs_tol=1e-3)
    assert math.isclose(headwind, 0.0, abs_tol=1e-3)
    assert math.isclose(crosswind, 10.0, abs_tol=1e-3)
    # v_app = sqrt(10^2 + 10^2) = 14.1421 m/s
    assert math.isclose(v_app, math.sqrt(200.0), rel_tol=1e-3)
    # psi = atan2(10, 10) = 45 degrees
    assert math.isclose(psi, 45.0, abs_tol=1e-3)


def test_vectorized_matches_single():
    n = 100
    np.random.seed(42)
    speeds = np.random.uniform(5.0, 15.0, n)
    bearings = np.random.uniform(0.0, 360.0, n)
    wind_speeds = np.random.uniform(0.0, 10.0, n)
    wind_dirs = np.random.uniform(0.0, 360.0, n)

    v_beta, v_head, v_cross, v_vapp, v_psi = calculate_apparent_wind_vectorized(
        speeds, bearings, wind_speeds, wind_dirs
    )

    for i in range(n):
        s_beta, s_head, s_cross, s_vapp, s_psi = calculate_apparent_wind_single(
            speeds[i], bearings[i], wind_speeds[i], wind_dirs[i]
        )
        assert math.isclose(v_beta[i], s_beta, abs_tol=1e-4)
        assert math.isclose(v_head[i], s_head, abs_tol=1e-4)
        assert math.isclose(v_cross[i], s_cross, abs_tol=1e-4)
        assert math.isclose(v_vapp[i], s_vapp, abs_tol=1e-4)
        assert math.isclose(v_psi[i], s_psi, abs_tol=1e-4)


def test_enrich_track_with_weather():
    dt = datetime(2023, 7, 1, 12, 0, 0, tzinfo=timezone.utc)
    tp = TrackPoint(
        time_offset_s=0,
        timestamp=dt,
        lat=52.0,
        lon=21.0,
        elevation_m=100.0,
        distance_m=0.0,
        speed_mps=10.0,
        speed_kmh=36.0,
        power_w=250.0,
        bearing_deg=0.0,
    )
    wp = WeatherPoint(
        temp_c=20.0,
        surface_pressure_hpa=1013.25,
        surface_pressure_pa=101325.0,
        wind_speed_10m_mps=5.0,
        wind_speed_cyclist_mps=3.175,
        wind_direction_deg=0.0,
        relative_humidity_pct=60.0,
        air_density_kg_m3=1.20,
    )

    enriched = WindAnalysisService.enrich_track_with_weather([tp], [wp])
    assert len(enriched) == 1
    p = enriched[0]
    assert p.speed_mps == 10.0
    assert p.power_w == 250.0
    assert p.headwind_comp_mps == 3.175
    assert p.apparent_wind_speed_mps == 13.175
    assert p.air_density_kg_m3 == 1.20
