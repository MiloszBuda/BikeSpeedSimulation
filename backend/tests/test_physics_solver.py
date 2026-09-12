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
