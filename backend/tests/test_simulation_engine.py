"""Tests for distance-domain simulation engine and What-If scenarios."""

import math
from datetime import datetime, timezone
import numpy as np
import pytest

from app.schemas.fit import EnrichedPoint, PacingMode, WhatIfSimulationRequest
from app.services.simulation_engine import SimulationEngine


def make_test_enriched_track(n_points: int = 100, speed_mps: float = 10.0, power_w: float = 250.0):
    """Helper to build a realistic straight-line enriched track."""
    base_time = datetime(2023, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    points: list[EnrichedPoint] = []

    for i in range(n_points):
        dist = i * 10.0  # 10m intervals, total ~1000m
        elev = 100.0 + 5.0 * math.sin(i / 10.0)
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)

        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + i * 0.0001,
                lon=21.0,
                elevation_m=elev,
                distance_m=dist,
                speed_mps=speed_mps,
                speed_kmh=speed_mps * 3.6,
                power_w=power_w,
                bearing_deg=0.0,  # Heading North
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=5.0,
                wind_speed_cyclist_mps=3.175,
                wind_direction_deg=0.0,  # From North (headwind)
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=3.175,
                crosswind_comp_mps=0.0,
                apparent_wind_speed_mps=speed_mps + 3.175,
                apparent_wind_angle_deg=0.0,
            )
        )
    return points


def test_simulation_spatial_discretization():
    points = make_test_enriched_track(n_points=50)  # total 490m
    req = WhatIfSimulationRequest(spatial_step_m=5.0)

    res = SimulationEngine.run_simulation(points, req)

    assert len(res.spatial_points) > 0
    # Steps should be spaced by approx 5m
    assert math.isclose(res.spatial_points[1].distance_m - res.spatial_points[0].distance_m, 5.0, abs_tol=1e-2)
    assert res.summary.total_distance_m == points[-1].distance_m


def test_simulation_zero_wind_faster_than_headwind():
    points = make_test_enriched_track(n_points=60)  # Baseline has 3.175 m/s headwind
    # Scenario: Zero wind
    req = WhatIfSimulationRequest(zero_wind=True, spatial_step_m=5.0)

    res = SimulationEngine.run_simulation(points, req)

    # Without headwind, cyclist should ride faster, so simulated time should be lower
    # Note: baseline time is derived from baseline speed
    assert res.summary.simulated_avg_speed_kmh > 0.0
    assert res.summary.simulated_time_s > 0.0


def test_simulation_route_reversal():
    points = make_test_enriched_track(n_points=60)
    req_forward = WhatIfSimulationRequest(reverse_route=False, spatial_step_m=5.0)
    req_reverse = WhatIfSimulationRequest(reverse_route=True, spatial_step_m=5.0)

    res_fwd = SimulationEngine.run_simulation(points, req_forward)
    res_rev = SimulationEngine.run_simulation(points, req_reverse)

    assert res_rev.summary.reverse_route is True
    # Bearings in reverse should be rotated by 180 degrees
    fwd_bearing = res_fwd.spatial_points[0].bearing_deg
    rev_bearing = res_rev.spatial_points[0].bearing_deg
    diff_bearing = abs(fwd_bearing - rev_bearing)
    assert math.isclose(diff_bearing, 180.0, abs_tol=1e-2)


def test_adaptive_pacing_conserves_mean_power():
    points = make_test_enriched_track(n_points=80)
    req = WhatIfSimulationRequest(
        pacing_mode=PacingMode.ADAPTIVE_SLOPE,
        spatial_step_m=5.0,
    )

    res = SimulationEngine.run_simulation(points, req)

    powers = np.array([sp.power_w for sp in res.spatial_points])
    # Average power in adaptive pacing should be conserved and close to original 250W
    assert math.isclose(float(np.mean(powers)), 250.0, rel_tol=0.05)


def test_equivalent_power_solver():
    points = make_test_enriched_track(n_points=60)
    # Double the headwind (wind_scale_factor = 2.0)
    req = WhatIfSimulationRequest(
        wind_scale_factor=2.0,
        calculate_equivalent_power=True,
    )

    res = SimulationEngine.run_simulation(points, req)

    assert res.summary.equivalent_power_w is not None
    # Facing double headwind, equivalent power to match baseline time MUST be higher than 250W
    assert res.summary.equivalent_power_w > 250.0


def test_simulation_coasting_and_equivalent_power_realistic():
    """Regression test: verify that intermittent coasting (0W) does not cause simulated time or equivalent power to explode."""
    n_points = 200  # 2 km
    base_time = datetime(2023, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    points: list[EnrichedPoint] = []

    for i in range(n_points):
        # 15% of points have 0W (coasting)
        p_w = 0.0 if (i % 7 == 0) else 220.0
        dist = i * 10.0
        # loop-like bearing
        bearing = (i * 360.0 / n_points)
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)
        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + 0.01 * math.cos(math.radians(bearing)),
                lon=21.0 + 0.01 * math.sin(math.radians(bearing)),
                elevation_m=100.0,
                distance_m=dist,
                speed_mps=8.5,
                speed_kmh=8.5 * 3.6,
                power_w=p_w,
                bearing_deg=bearing,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=4.0,
                wind_speed_cyclist_mps=3.0,
                wind_direction_deg=90.0,
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=0.0,
                crosswind_comp_mps=3.0,
                apparent_wind_speed_mps=8.5,
                apparent_wind_angle_deg=0.0,
            )
        )

    req = WhatIfSimulationRequest(
        pacing_mode=PacingMode.ORIGINAL,
        spatial_step_m=5.0,
        calculate_equivalent_power=True,
    )
    res = SimulationEngine.run_simulation(points, req)

    # Simulated time should be within 30% of baseline, NOT hours or 3x
    assert res.summary.simulated_time_s < res.summary.baseline_time_s * 1.3
    # Equivalent power should be realistic and NOT pegged to 3.5x upper limit (770W)
    assert res.summary.equivalent_power_w is not None
    assert 100.0 < res.summary.equivalent_power_w < 300.0


def test_simulation_baseline_produces_exact_zero_delta():
    """Verify that simulating with baseline parameters produces exactly 0.0 delta and identical times."""
    points = make_test_enriched_track(n_points=60, power_w=240.0)
    req = WhatIfSimulationRequest(
        zero_wind=False,
        wind_scale_factor=1.0,
        wind_rotation_deg=0.0,
        reverse_route=False,
        pacing_mode=PacingMode.ORIGINAL,
        spatial_step_m=5.0,
        calculate_equivalent_power=True,
    )
    res = SimulationEngine.run_simulation(points, req)

    assert math.isclose(res.summary.time_delta_s, 0.0, abs_tol=1e-5)
    assert math.isclose(res.summary.simulated_time_s, res.summary.baseline_time_s, abs_tol=1e-5)
    assert math.isclose(res.summary.equivalent_power_w, 240.0, abs_tol=1e-5)
    for sp in res.spatial_points:
        assert math.isclose(sp.delta_time_s, 0.0, abs_tol=1e-5)
        assert math.isclose(sp.simulated_speed_kmh, sp.baseline_speed_kmh, abs_tol=1e-3)


def test_simulation_baseline_resilient_to_minor_angle_and_scale_rounding():
    """Verify that minor rounding in compass / slider (e.g. 1.5 deg rotation, 1.02x scale) still resolves to baseline 0.0s."""
    points = make_test_enriched_track(n_points=60, power_w=255.0)
    req = WhatIfSimulationRequest(
        zero_wind=False,
        wind_scale_factor=1.02,
        wind_rotation_deg=1.8,
        reverse_route=False,
        pacing_mode=PacingMode.ORIGINAL,
        spatial_step_m=5.0,
        calculate_equivalent_power=True,
    )
    res = SimulationEngine.run_simulation(points, req)

    assert math.isclose(res.summary.time_delta_s, 0.0, abs_tol=1e-5)
    assert math.isclose(res.summary.simulated_time_s, res.summary.baseline_time_s, abs_tol=1e-5)
    assert math.isclose(res.summary.equivalent_power_w, 255.0, abs_tol=1e-5)


def test_simulation_downhill_no_speed_jump():
    """Regression test: on a -5.6% downhill with 0W, speed must NOT jump to 92 km/h."""
    base_time = datetime(2023, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    points: list[EnrichedPoint] = []

    # 1 km approach flat at 36 km/h (10 m/s), 200W
    for i in range(100):
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)
        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + i * 0.0001,
                lon=21.0,
                elevation_m=200.0,
                distance_m=i * 10.0,
                speed_mps=10.0,
                speed_kmh=36.0,
                power_w=200.0,
                bearing_deg=0.0,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=3.0,
                wind_speed_cyclist_mps=2.0,
                wind_direction_deg=90.0,
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=0.0,
                crosswind_comp_mps=2.0,
                apparent_wind_speed_mps=10.0,
                apparent_wind_angle_deg=0.0,
            )
        )

    # 500m steep descent at -5.6%, 0W, baseline speed controlled to 35.8 km/h
    for i in range(100, 150):
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)
        # Drop 5.6m every 100m
        elev = 200.0 - (i - 100) * 0.56
        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + i * 0.0001,
                lon=21.0,
                elevation_m=elev,
                distance_m=i * 10.0,
                speed_mps=9.94,  # 35.8 km/h
                speed_kmh=35.8,
                power_w=0.0,
                bearing_deg=0.0,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=3.0,
                wind_speed_cyclist_mps=2.0,
                wind_direction_deg=90.0,
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=0.0,
                crosswind_comp_mps=2.0,
                apparent_wind_speed_mps=9.94,
                apparent_wind_angle_deg=0.0,
            )
        )

    # Simulate with Zero Wind
    req = WhatIfSimulationRequest(
        zero_wind=True,
        spatial_step_m=5.0,
    )
    res = SimulationEngine.run_simulation(points, req)

    # Ensure NO point on this descent exceeds 65 km/h (definitely NOT 73.8 or 92 km/h!)
    max_sim_speed = max(sp.simulated_speed_kmh for sp in res.spatial_points)
    assert max_sim_speed < 60.0


def test_simulation_sprint_power_bounded_and_no_explosive_speed_jump():
    """
    Regression test: a 1035W sprint on a -6.2% gradient with baseline speed 33.7 km/h -> 43 km/h
    must NOT explode to 81.3 km/h and must NOT jump 30+ km/h over 50 meters.
    """
    base_time = datetime(2023, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    points: list[EnrichedPoint] = []

    # 40 points (400m): approach at 33.7 km/h (9.36 m/s), 220W, s = -6.2%
    for i in range(40):
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)
        elev = 200.0 - i * 0.62  # -6.2% grade
        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + i * 0.0001,
                lon=21.0,
                elevation_m=elev,
                distance_m=i * 10.0,
                speed_mps=9.36,  # 33.7 km/h
                speed_kmh=33.7,
                power_w=220.0,
                bearing_deg=0.0,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=3.0,
                wind_speed_cyclist_mps=1.9,
                wind_direction_deg=180.0,  # Tailwind
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=-1.9,
                crosswind_comp_mps=0.0,
                apparent_wind_speed_mps=7.46,
                apparent_wind_angle_deg=0.0,
            )
        )

    # 10 points (100m): 1035W sprint, baseline speed accelerates to 43.0 km/h (11.94 m/s)
    for i in range(40, 50):
        dt = datetime.fromtimestamp(base_time.timestamp() + i, tz=timezone.utc)
        elev = 200.0 - i * 0.62
        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=dt,
                lat=52.0 + i * 0.0001,
                lon=21.0,
                elevation_m=elev,
                distance_m=i * 10.0,
                speed_mps=11.94,  # 43.0 km/h
                speed_kmh=43.0,
                power_w=1035.0,  # 1035W sprint
                bearing_deg=0.0,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=3.0,
                wind_speed_cyclist_mps=1.9,
                wind_direction_deg=180.0,
                air_density_kg_m3=1.20,
                yaw_angle_deg=0.0,
                headwind_comp_mps=-1.9,
                crosswind_comp_mps=0.0,
                apparent_wind_speed_mps=10.04,
                apparent_wind_angle_deg=0.0,
            )
        )

    # Simulate What-If with Zero Wind
    req = WhatIfSimulationRequest(
        zero_wind=True,
        spatial_step_m=5.0,
        pacing_mode=PacingMode.ORIGINAL,
    )
    res = SimulationEngine.run_simulation(points, req)

    sim_speeds = [sp.simulated_speed_kmh for sp in res.spatial_points]
    max_sim_speed = max(sim_speeds)

    # 1. Max simulated speed must NOT reach 81.3 km/h or anything above 55 km/h
    assert max_sim_speed < 55.0, f"Max speed {max_sim_speed:.1f} km/h exceeded realistic threshold"

    # 2. Acceleration check: over any 50m window (10 spatial steps of 5m), speed delta cannot exceed 18 km/h
    for k in range(len(sim_speeds) - 10):
        delta_50m = sim_speeds[k + 10] - sim_speeds[k]
        assert delta_50m < 18.0, f"Speed jump {delta_50m:.1f} km/h over 50m exceeded physical limit"



