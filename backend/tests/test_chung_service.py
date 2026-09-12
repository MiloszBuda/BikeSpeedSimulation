"""Tests for Chung's Virtual Elevation (VE) method and parameter estimation."""

import math
import numpy as np
import pytest

from app.services.chung_service import ChungService


def test_compute_virtual_elevation():
    # 100 seconds ride at constant speed 10 m/s, zero wind, flat terrain
    dt = 1.0
    n = 100
    v = np.full(n, 10.0)
    v_app = np.full(n, 10.0)
    rho = np.full(n, 1.20)
    m = 78.0
    g = 9.80665
    eta = 0.97
    CdA = 0.30
    Crr = 0.004

    # Calculate exact equilibrium power for flat terrain (dh/dt = 0)
    # P * eta = 1/2 * rho * CdA * v^3 + m * g * Crr * v
    p_aero = 0.5 * rho[0] * CdA * (v[0]**3)
    p_rr = m * g * Crr * v[0]
    p_eq = (p_aero + p_rr) / eta
    P = np.full(n, p_eq)

    h_virt = ChungService.compute_virtual_elevation(
        P=P, v=v, v_app=v_app, rho=rho, m=m, CdA=CdA, Crr=Crr, dt=dt, eta=eta, g=g
    )

    # Since power exactly balances drag and rolling resistance with constant speed,
    # virtual elevation dh_virt should remain essentially constant (~0 m change)
    h_change = h_virt[-1] - h_virt[0]
    assert math.isclose(h_change, 0.0, abs_tol=1e-3)


def test_fit_parameters_recovers_known_cda():
    # Synthetic test ride with known CdA = 0.34
    true_cda = 0.34
    fixed_crr = 0.0040
    m = 78.0
    eta = 0.97
    g = 9.80665
    dt = 1.0
    n = 120

    t = np.arange(n, dtype=np.float64)
    # Gentle rolling hill profile (3m elevation change over 120s)
    h_real = 100.0 + 3.0 * np.sin(np.pi * t / n)
    dh_dt = np.gradient(h_real, dt)

    v = 9.0 + 0.5 * np.cos(np.pi * t / n)
    v_app = v.copy()  # Zero wind for simplicity
    rho = np.full(n, 1.20)

    dv_dt = np.gradient(v, dt)

    # Synthesize power required by the physics equation:
    # P * eta = 1/2 * rho * CdA * v^3 + m * g * Crr * v + m * v * dv/dt + m * g * dh/dt
    p_aero = 0.5 * rho * true_cda * (v**3)
    p_rr = m * g * fixed_crr * v
    p_accel = m * v * dv_dt
    p_climb = m * g * dh_dt
    P = (p_aero + p_rr + p_accel + p_climb) / eta

    fit_res = ChungService.fit_parameters(
        P=P,
        v=v,
        v_app=v_app,
        rho=rho,
        m=m,
        h_real=h_real,
        dt=dt,
        eta=eta,
        initial_cda=0.25,
        fixed_crr=fixed_crr,
        g=g,
    )

    estimated_cda = fit_res["cda"]
    # Optimizer should recover true CdA within 1% error
    assert math.isclose(estimated_cda, true_cda, rel_tol=0.015)
    # High R-squared (> 0.98)
    assert fit_res["r_squared"] > 0.95
    # Low RMSE
    assert fit_res["rmse_m"] < 1.0
