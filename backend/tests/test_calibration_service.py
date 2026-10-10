"""Unit tests for multi-activity parameter auto-calibration service."""

from datetime import datetime, timezone
import math
import numpy as np
import pytest

from app.schemas.calibration import CalibrationRequest, EnergyWindow
from app.schemas.fit import EnrichedPoint
from app.services.calibration_service import CalibrationService


def create_synthetic_enriched_ride(
    duration_s: int = 1800,
    base_speed_mps: float = 8.5,
    base_power_w: float = 220.0,
    slope: float = 0.005,
    cda_true: float = 0.32,
    crr_true: float = 0.004,
    eta_true: float = 0.97,
    mass_kg: float = 78.0,
    rho: float = 1.20,
    headwind_mps: float = 1.0,
) -> list[EnrichedPoint]:
    """Generate a physically consistent synthetic enriched cycling activity."""
    points = []
    g = 9.80665
    dt = 1.0

    current_dist = 0.0
    current_elev = 100.0

    # Theoretical required power at steady speed:
    # P * eta = (0.5 * rho * CdA * (v + w)^2 + m*g*crr + m*g*slope) * v
    v = base_speed_mps
    v_head = v + headwind_mps
    f_aero = 0.5 * rho * cda_true * v_head * v_head
    f_rr = mass_kg * g * crr_true
    f_gravity = mass_kg * g * slope
    f_total = f_aero + f_rr + f_gravity
    required_power = (f_total * v) / eta_true

    for i in range(duration_s):
        # Add slight gentle undulating variation
        t_s = float(i)
        v_i = v + 0.3 * math.sin(t_s / 60.0)
        p_i = max(50.0, required_power + 15.0 * math.sin(t_s / 60.0))
        slope_i = slope + 0.003 * math.cos(t_s / 90.0)

        current_dist += v_i * dt
        current_elev += slope_i * (v_i * dt)

        points.append(
            EnrichedPoint(
                time_offset_s=i,
                timestamp=datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
                lat=52.2 + i * 0.00005,
                lon=21.0 + i * 0.00005,
                elevation_m=current_elev,
                distance_m=current_dist,
                speed_mps=v_i,
                speed_kmh=v_i * 3.6,
                power_w=p_i,
                bearing_deg=45.0,
                cadence_rpm=88.0,
                heart_rate_bpm=145.0,
                temp_c=20.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=1.5,
                wind_speed_cyclist_mps=1.0,
                wind_direction_deg=45.0,
                relative_humidity_pct=50.0,
                air_density_kg_m3=rho,
                yaw_angle_deg=0.0,
                headwind_comp_mps=headwind_mps,
                crosswind_comp_mps=0.0,
                apparent_wind_speed_mps=v_i + headwind_mps,
                apparent_wind_angle_deg=0.0,
            )
        )

    return points


def test_extract_activity_windows():
    """Verify clean energy balance windows are extracted from a realistic ride."""
    points = create_synthetic_enriched_ride(duration_s=1800)  # 30 minutes
    windows = CalibrationService.extract_activity_windows(
        points=points,
        activity_id="test_ride_1",
        mass_kg=78.0,
        window_duration_s=300,
    )

    # 30 min minus 5 min warmup = 25 min = 1500 s. With 150s step and 300s window: ~8-9 windows
    assert len(windows) >= 5
    first_w = windows[0]
    assert first_w.activity_id == "test_ride_1"
    assert first_w.duration_s == 300.0
    assert first_w.work_power_j > 50000.0
    assert first_w.aero_integral > 10000.0
    assert first_w.rr_integral > 100000.0


def test_solve_parameters_recovers_ground_truth():
    """Verify that constrained regularized linear least squares recovers ground truth parameters."""
    cda_true = 0.31
    crr_true = 0.0042
    eta_true = 0.965
    mass_kg = 78.0

    # Create synthetic windows directly satisfying energy balance
    windows = []
    g = 9.80665
    np.random.seed(42)

    for i in range(12):
        # Vary speed from 6.5 to 11.5 m/s across windows to decouple Crr from CdA
        v_win = 6.5 + i * 0.45
        w_par = 0.8 * np.sin(i)
        v_app = v_win + w_par
        rho = 1.20
        duration = 300.0

        # Distinct slope values for climbing identifiability
        slope = -0.005 + 0.004 * i
        dist = v_win * duration
        delta_h = slope * dist

        aero_integral = 0.5 * rho * v_app * v_app * v_win * duration
        rr_integral = mass_kg * g * v_win * duration
        delta_v2 = np.random.uniform(-1.0, 1.0)

        # Work balance: W_p * eta = m*g*dh + 0.5*m*dv2 + CdA*aero + Crr*rr
        mechanical_energy = mass_kg * g * delta_h + 0.5 * mass_kg * delta_v2
        aero_work = cda_true * aero_integral
        rr_work = crr_true * rr_integral
        p_work = (mechanical_energy + aero_work + rr_work) / eta_true

        # Add tiny noise (1%)
        p_work += np.random.normal(0, 0.005 * p_work)

        windows.append(
            EnergyWindow(
                activity_id="synth",
                start_s=i * 300,
                end_s=(i + 1) * 300,
                duration_s=duration,
                delta_h_m=delta_h,
                delta_v2_mps2=delta_v2,
                work_power_j=p_work,
                aero_integral=aero_integral,
                rr_integral=rr_integral,
                avg_speed_kmh=v_win * 3.6,
                avg_power_w=p_work / duration,
                avg_slope_pct=slope * 100.0,
            )
        )

    (
        cda_opt,
        crr_opt,
        eta_opt,
        cda_std,
        crr_std,
        eta_std,
        cond_num,
        eta_fixed,
        eta_reason,
    ) = CalibrationService.solve_parameters(
        windows=windows,
        mass_kg=mass_kg,
        prior_eta=0.97,
        prior_cda=0.32,
        prior_crr=0.004,
    )

    # Check recovery accuracy within tight tolerance
    assert math.isclose(cda_opt, cda_true, abs_tol=0.035)
    assert math.isclose(crr_opt, crr_true, abs_tol=0.0015)
    assert math.isclose(eta_opt, eta_true, abs_tol=0.025)
    assert cda_std < 0.05
    assert crr_std < 0.003
    assert cond_num > 0.0


def test_solve_parameters_flat_ride_fixes_eta():
    """Verify that when rides are purely flat (no climb variation), eta is safely fixed to default."""
    windows = []
    mass_kg = 78.0

    for i in range(8):
        windows.append(
            EnergyWindow(
                activity_id="flat",
                start_s=i * 300,
                end_s=(i + 1) * 300,
                duration_s=300.0,
                delta_h_m=0.1,  # completely flat
                delta_v2_mps2=0.0,
                work_power_j=60000.0,
                aero_integral=40000.0,
                rr_integral=1800000.0,
                avg_speed_kmh=28.0,
                avg_power_w=200.0,
                avg_slope_pct=0.0,
            )
        )

    (
        cda_opt,
        crr_opt,
        eta_opt,
        _,
        _,
        _,
        _,
        eta_fixed,
        eta_reason,
    ) = CalibrationService.solve_parameters(
        windows=windows,
        mass_kg=mass_kg,
        prior_eta=0.97,
        prior_cda=0.32,
        prior_crr=0.004,
    )

    assert eta_fixed is True
    assert eta_opt == 0.97
    assert "zbyt mało zróżnicowanych podjazdów" in eta_reason.lower()


def test_run_multi_activity_calibration_end_to_end():
    """Verify end-to-end multi-activity calibration with LOO validation."""
    ride1 = create_synthetic_enriched_ride(duration_s=1800, base_speed_mps=8.0, slope=0.008)
    ride2 = create_synthetic_enriched_ride(duration_s=1800, base_speed_mps=9.5, slope=0.004)

    activities = [
        ("ride_1", "Górska trasa 1", "2026-06-01", ride1),
        ("ride_2", "Płaska trasa 2", "2026-06-02", ride2),
    ]

    req = CalibrationRequest(mass_kg=78.0, window_duration_s=300)
    res = CalibrationService.run_multi_activity_calibration(activities=activities, request=req)

    assert res.n_activities == 2
    assert res.total_windows >= 8
    assert 0.20 <= res.cda <= 0.45
    assert 0.002 <= res.crr <= 0.008
    assert 0.92 <= res.eta <= 0.995
    assert len(res.activities) == 2
    assert res.badge_text.startswith("auto, n=2")
