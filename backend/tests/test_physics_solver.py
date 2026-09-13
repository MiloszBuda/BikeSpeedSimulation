"""Tests for vectorized physics solvers (windless and arbitrary wind)."""

import math
import numpy as np
import pytest

from app.services.physics_solver import PhysicsSolver


def test_solve_v0_flat_road():
    P = np.array([250.0])
    s = np.array([0.0])
    m = 78.0
    CdA = 0.32
    Crr = 0.004
    rho = np.array([1.20])
    eta = 0.97
    g = 9.80665

    v0 = PhysicsSolver.solve_v0_vectorized(P, s, m=m, CdA=CdA, Crr=Crr, rho=rho, eta=eta, g=g)
    v = float(v0[0])

    # Check power balance residual: 1/2 * rho * CdA * v^3 + m*g*Crr*v - P*eta == 0
    p_aero = 0.5 * rho[0] * CdA * (v**3)
    p_rr = m * g * Crr * v
    p_in = P[0] * eta
    residual = abs(p_aero + p_rr - p_in)

    assert residual < 1e-4
    # Speed for 250W flat road should be ~10.3 m/s (~37 km/h)
    assert 9.5 < v < 11.5


def test_solve_v0_climbing():
    P = np.array([250.0])
    s = np.array([0.06])  # 6% climb
    v0 = PhysicsSolver.solve_v0_vectorized(P, s)
    v = float(v0[0])

    # For a 6% climb at 250W, speed is around 4.5 - 5.5 m/s (~16-20 km/h)
    assert 4.0 < v < 6.0


def test_solve_speed_arbitrary_wind_headwind_vs_tailwind():
    P = np.array([250.0, 250.0])
    s = np.array([0.0, 0.0])
    bearing = np.array([0.0, 0.0])  # Moving North
    wind_speed = np.array([5.0, 5.0])  # 5 m/s wind
    wind_dir = np.array([0.0, 180.0])  # North (headwind) vs South (tailwind)

    speeds = PhysicsSolver.solve_speed_arbitrary_wind(
        P=P,
        s=s,
        bearing_deg=bearing,
        wind_speed=wind_speed,
        wind_dir_deg=wind_dir,
    )

    v_headwind, v_tailwind = speeds[0], speeds[1]
    # Tailwind MUST be significantly faster than headwind at equal power
    assert v_tailwind > v_headwind
    assert v_tailwind - v_headwind > 4.0  # Big difference for 5 m/s (18 km/h) wind


def test_solve_speed_crosswind_drag_increase():
    # Comparing zero wind vs pure crosswind (same power & zero slope)
    P = np.array([250.0, 250.0])
    s = np.array([0.0, 0.0])
    bearing = np.array([0.0, 0.0])  # Heading North
    wind_speed = np.array([0.0, 8.0])  # 0 m/s vs 8 m/s crosswind
    wind_dir = np.array([90.0, 90.0])  # From East

    speeds = PhysicsSolver.solve_speed_arbitrary_wind(
        P=P,
        s=s,
        bearing_deg=bearing,
        wind_speed=wind_speed,
        wind_dir_deg=wind_dir,
    )

    v_calm, v_cross = speeds[0], speeds[1]
    # Crosswind increases apparent airspeed v_app = sqrt(v^2 + v_cross^2), thus increasing drag
    assert v_calm > v_cross


def test_solve_speed_terminal_velocity_coasting():
    # Coasting (0W) on a -7% descent with 0 wind
    P = np.array([0.0])
    s = np.array([-0.07])
    bearing = np.array([0.0])
    wind_speed = np.array([0.0])
    wind_dir = np.array([0.0])

    v_sim = PhysicsSolver.solve_speed_arbitrary_wind(
        P=P,
        s=s,
        bearing_deg=bearing,
        wind_speed=wind_speed,
        wind_dir_deg=wind_dir,
    )

    v = float(v_sim[0])
    # Terminal velocity on -7% descent is typically ~17-21 m/s (60-75 km/h)
    assert 15.0 < v < 25.0


def test_smooth_power_response_asymmetric_lag():
    """Verify that instantaneous power surges ramp smoothly, decay smoothly, and preserve total work."""
    time_s = np.array([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
    # Step from 200W to 1000W at t=1, then drop back to 200W at t=4
    raw_power = np.array([200.0, 1000.0, 1000.0, 1000.0, 200.0, 200.0, 200.0, 200.0])

    p_eff = PhysicsSolver.smooth_power_response(raw_power, time_s, tau_up=1.2, tau_down=2.2)

    # Work conservation: integral of power over time must be preserved
    trapz_fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
    orig_work = float(trapz_fn(raw_power, time_s))
    filt_work = float(trapz_fn(p_eff, time_s))
    assert math.isclose(filt_work, orig_work, rel_tol=1e-3)

    # Ramp is smooth (first second after 1000W step does not jump instantly to 1000W)
    assert p_eff[1] < 800.0
    assert p_eff[3] > p_eff[2] > p_eff[1]

    # Decay is smooth (does not plunge to 200W instantly)
    assert p_eff[4] > 300.0
    assert p_eff[5] < p_eff[4]


def test_simulate_original_pacing_identical_conditions_zero_delta():
    """Verify that simulating with identical wind conditions produces exactly 0.0 delta from baseline."""
    n = 100
    v_base = np.linspace(10.0, 5.0, n)
    bearing = np.full(n, 45.0)
    wind_speed = np.full(n, 4.0)
    wind_dir = np.full(n, 120.0)
    rho = np.full(n, 1.225)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=wind_speed,
        base_wind_dir_deg=wind_dir,
        sim_wind_speed=wind_speed,
        sim_wind_dir_deg=wind_dir,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    np.testing.assert_allclose(v_sim, v_base, atol=1e-5)


def test_simulate_original_pacing_tailwind_sprint_slows_in_calm_air():
    """Verify that a 43 km/h sprint with tailwind slows down slightly when simulated in calm air."""
    n = 100
    v_base = np.full(n, 43.0 / 3.6)
    bearing = np.zeros(n)
    # Baseline: 4 m/s tailwind (from South, heading North)
    base_wind_speed = np.full(n, 4.0)
    base_wind_dir = np.full(n, 180.0)
    # Scenario: calm air (zero wind)
    sim_wind_speed = np.zeros(n)
    sim_wind_dir = np.zeros(n)
    rho = np.full(n, 1.225)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_speed,
        base_wind_dir_deg=base_wind_dir,
        sim_wind_speed=sim_wind_speed,
        sim_wind_dir_deg=sim_wind_dir,
        rho=rho,
        mass=85.0,
        cda=0.32,
        dx=5.0,
    )

    sim_kmh = v_sim * 3.6
    # Simulated speed must slow down realistically from 43 km/h when tailwind is removed, NOT exploding to 60-80 km/h
    assert np.all(sim_kmh <= 43.0 + 1e-4)
    assert 32.0 < sim_kmh[-1] < 36.0


def test_simulate_original_pacing_headwind_speeds_up_in_calm_air():
    """Verify that a 35 km/h ride into 4 m/s headwind accelerates smoothly to physical equilibrium in calm air."""
    n = 100
    v_base = np.full(n, 35.0 / 3.6)
    bearing = np.zeros(n)
    # Baseline: 4 m/s headwind (from North, heading North)
    base_wind_speed = np.full(n, 4.0)
    base_wind_dir = np.zeros(n)
    # Scenario: calm air (zero wind)
    sim_wind_speed = np.zeros(n)
    sim_wind_dir = np.zeros(n)
    rho = np.full(n, 1.225)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_speed,
        base_wind_dir_deg=base_wind_dir,
        sim_wind_speed=sim_wind_speed,
        sim_wind_dir_deg=sim_wind_dir,
        rho=rho,
        mass=85.0,
        cda=0.32,
        dx=5.0,
    )

    sim_kmh = v_sim * 3.6
    # Simulated speed should smoothly accelerate above 35 km/h to physical equilibrium (~43.7 km/h)
    assert np.all(sim_kmh >= 35.0 - 1e-4)
    assert 42.0 < sim_kmh[-1] < 45.0


def test_simulate_original_pacing_braking_descent_stays_controlled():
    """Verify that a 22 km/h braking descent remains controlled in calm air, with no runaway acceleration."""
    n = 100
    v_base = np.full(n, 22.0 / 3.6)
    bearing = np.zeros(n)
    # Mild baseline wind
    base_wind_speed = np.full(n, 2.0)
    base_wind_dir = np.zeros(n)
    sim_wind_speed = np.zeros(n)
    sim_wind_dir = np.zeros(n)
    rho = np.full(n, 1.225)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_speed,
        base_wind_dir_deg=base_wind_dir,
        sim_wind_speed=sim_wind_speed,
        sim_wind_dir_deg=sim_wind_dir,
        rho=rho,
        mass=85.0,
        cda=0.32,
        dx=5.0,
        slope=np.full(n, -0.04),
    )

    sim_kmh = v_sim * 3.6
    # Speeds must stay tightly controlled within ~4 km/h of baseline, NOT blow up to 50-60 km/h!
    assert np.all(sim_kmh < 28.0)
    assert np.all(sim_kmh >= 22.0 - 1e-4)


def test_simulate_original_pacing_220w_flat_headwind_removal_reaches_full_delta():
    """Verify that removing a 6 m/s headwind at 220W on flat road reaches ~35.5 km/h (+12 km/h delta)."""
    n = 1920  # ~9.6 km
    dx = 5.0
    v_base = np.full(n, 23.32 / 3.6)
    bearing = np.zeros(n)
    base_wind_speed = np.full(n, 6.0)
    base_wind_dir = np.zeros(n)
    sim_wind_speed = np.zeros(n)
    sim_wind_dir = np.zeros(n)
    rho = np.full(n, 1.20)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_speed,
        base_wind_dir_deg=base_wind_dir,
        sim_wind_speed=sim_wind_speed,
        sim_wind_dir_deg=sim_wind_dir,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=dx,
    )

    final_speed_kmh = float(v_sim[-1] * 3.6)
    delta_kmh = final_speed_kmh - 23.32
    # Must reach the full ~12.1 km/h physical delta, NOT being clamped to +4 km/h!
    assert math.isclose(final_speed_kmh, 35.45, abs_tol=0.5)
    assert math.isclose(delta_kmh, 12.13, abs_tol=0.5)



def test_original_pacing_baseline_exact_match():
    """Test A: Identical wind conditions (scale=1, rot=0°, zero_wind=False) -> v_sim == v_base, delta == 0."""
    n = 100
    v_base = np.linspace(8.0, 12.0, n)
    bearing = np.full(n, 30.0)
    wind_speed = np.full(n, 5.0)
    wind_dir = np.full(n, 90.0)
    rho = np.full(n, 1.20)

    v_sim = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=wind_speed,
        base_wind_dir_deg=wind_dir,
        sim_wind_speed=wind_speed,
        sim_wind_dir_deg=wind_dir,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )
    # Exact match down to floating point precision
    assert np.allclose(v_sim, v_base, atol=1e-6)


def test_original_pacing_zero_wind_sign_direction():
    """Test B: Correct sign of response when removing wind (zero wind):
    - Removing tailwind makes cyclist slower (v_sim < v_base)
    - Removing headwind makes cyclist faster (v_sim > v_base)
    """
    n = 80
    v_base = np.full(n, 30.0 / 3.6)
    bearing = np.zeros(n)  # heading North (0°)
    rho = np.full(n, 1.225)

    # 1. Baseline with tailwind (wind from 180° / South, parallel < 0)
    base_wind_tw = np.full(n, 5.0)
    base_dir_tw = np.full(n, 180.0)
    sim_wind_zero = np.zeros(n)
    sim_dir_zero = np.zeros(n)

    v_sim_tw_removal = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_tw,
        base_wind_dir_deg=base_dir_tw,
        sim_wind_speed=sim_wind_zero,
        sim_wind_dir_deg=sim_dir_zero,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )
    # Removing tailwind assist must slow the rider down
    assert v_sim_tw_removal[-1] < v_base[-1]

    # 2. Baseline with headwind (wind from 0° / North, parallel > 0)
    base_wind_hw = np.full(n, 5.0)
    base_dir_hw = np.full(n, 0.0)

    v_sim_hw_removal = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_hw,
        base_wind_dir_deg=base_dir_hw,
        sim_wind_speed=sim_wind_zero,
        sim_wind_dir_deg=sim_dir_zero,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )
    # Removing headwind resistance must speed the rider up
    assert v_sim_hw_removal[-1] > v_base[-1]


def test_original_pacing_2x_wind_nonlinear_scaling():
    """Test C: 2x wind causes non-linear speed increase (drag is quadratic in v_app).
    Doubling tailwind from 4 m/s to 8 m/s increases speed, but with diminishing returns,
    and never blows up to unrealistic speeds.
    """
    n = 120
    v_base = np.full(n, 32.0 / 3.6)
    bearing = np.zeros(n)  # heading North
    rho = np.full(n, 1.225)

    base_wind = np.full(n, 4.0)
    base_dir = np.full(n, 180.0)  # Tailwind 4 m/s (~14.4 km/h)

    # 2x tailwind: 8 m/s (~28.8 km/h)
    sim_wind_2x = np.full(n, 8.0)
    sim_dir_2x = np.full(n, 180.0)

    v_sim_2x = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind,
        base_wind_dir_deg=base_dir,
        sim_wind_speed=sim_wind_2x,
        sim_wind_dir_deg=sim_dir_2x,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    v_base_kmh = float(v_base[-1] * 3.6)
    v_sim_2x_kmh = float(v_sim_2x[-1] * 3.6)

    # Speed increases
    assert v_sim_2x_kmh > v_base_kmh
    # Increase should be realistic (e.g. +4 to +8 km/h, NOT doubling to 64 km/h)
    assert 35.0 < v_sim_2x_kmh < 44.0


def test_original_pacing_90deg_crosswind_rotation():
    """Test D: 90° rotation changes headwind to pure crosswind.
    Crosswind has zero headwind component but increases apparent wind v_app = sqrt(v^2 + w^2).
    A pure crosswind is noticeably faster than pure headwind, but slower than calm air.
    """
    n = 100
    v_base = np.full(n, 30.0 / 3.6)
    bearing = np.zeros(n)  # heading North
    rho = np.full(n, 1.225)

    # Baseline: 5 m/s headwind (North)
    base_wind = np.full(n, 5.0)
    base_dir = np.zeros(n)

    # 90° rotation: East wind (pure crosswind)
    sim_wind_cross = np.full(n, 5.0)
    sim_dir_cross = np.full(n, 90.0)

    v_sim_cross = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind,
        base_wind_dir_deg=base_dir,
        sim_wind_speed=sim_wind_cross,
        sim_wind_dir_deg=sim_dir_cross,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    # Rotating from pure headwind to pure crosswind relieves headwind resistance -> rider speeds up
    assert v_sim_cross[-1] > v_base[-1]


def test_original_pacing_0_5x_wind_monotonicity():
    """Test E: Monotonicity test:
    For headwind: v_base (1.0x) < v_sim (0.5x) < v_sim (0.0x calm).
    """
    n = 100
    v_base = np.full(n, 28.0 / 3.6)
    bearing = np.zeros(n)
    rho = np.full(n, 1.225)

    base_wind_hw = np.full(n, 6.0)
    base_dir_hw = np.zeros(n)

    # 0.5x headwind (3.0 m/s)
    sim_wind_05x = np.full(n, 3.0)
    sim_dir_hw = np.zeros(n)

    # 0.0x (calm)
    sim_wind_0x = np.zeros(n)

    v_sim_05x = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_hw,
        base_wind_dir_deg=base_dir_hw,
        sim_wind_speed=sim_wind_05x,
        sim_wind_dir_deg=sim_dir_hw,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    v_sim_0x = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind_hw,
        base_wind_dir_deg=base_dir_hw,
        sim_wind_speed=sim_wind_0x,
        sim_wind_dir_deg=sim_dir_hw,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    # Strict monotonicity: v_base < v_sim_05x < v_sim_0x
    assert v_base[-1] < v_sim_05x[-1] < v_sim_0x[-1]


def test_original_pacing_180deg_wind_reversal():
    """Test F: Wind reversal (180° rotation):
    Tailwind in baseline (180°) turned into headwind (0°) causes substantial speed drop.
    """
    n = 100
    v_base = np.full(n, 36.0 / 3.6)
    bearing = np.zeros(n)  # heading North
    rho = np.full(n, 1.225)

    base_wind = np.full(n, 5.0)
    base_dir_tw = np.full(n, 180.0)  # Tailwind in baseline

    sim_wind = np.full(n, 5.0)
    sim_dir_hw = np.full(n, 0.0)    # 180° reversed -> Headwind

    v_sim_rev = PhysicsSolver.simulate_original_pacing(
        baseline_speed=v_base,
        bearing_deg=bearing,
        base_wind_speed=base_wind,
        base_wind_dir_deg=base_dir_tw,
        sim_wind_speed=sim_wind,
        sim_wind_dir_deg=sim_dir_hw,
        rho=rho,
        mass=78.0,
        cda=0.32,
        dx=5.0,
    )

    # Turning tailwind into headwind must cause significant slowdown
    assert v_sim_rev[-1] < v_base[-1]
    assert (v_base[-1] - v_sim_rev[-1]) * 3.6 > 5.0
