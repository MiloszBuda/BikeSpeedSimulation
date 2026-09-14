"""Tests for elevation filtering, drift compensation, and slope calculation."""

import math
import numpy as np
import pytest

from app.services.elevation_service import ElevationService


def test_smooth_elevation_savgol():
    # Pure hill with Gaussian noise
    x = np.linspace(0, 10, 50)
    true_hill = 100.0 + 20.0 * np.sin(x / 2.0)
    noise = np.random.normal(0, 1.5, size=len(x))
    noisy_hill = true_hill + noise

    smoothed = ElevationService.smooth_elevation_savgol(noisy_hill, window_length=11, polyorder=2)

    assert len(smoothed) == len(noisy_hill)
    # Variance to true profile should be significantly smaller in smoothed than noisy
    var_noisy = np.var(noisy_hill - true_hill)
    var_smooth = np.var(smoothed - true_hill)
    assert var_smooth < var_noisy

    # Short arrays should not crash
    short_arr = np.array([10.0, 11.0, 12.0])
    res_short = ElevationService.smooth_elevation_savgol(short_arr)
    assert len(res_short) == 3


def test_compensate_barometric_drift():
    # Ride of constant real altitude 100m
    n = 100
    elev = np.full(n, 100.0)
    temp = np.full(n, 20.0)
    # Weather front moves in: surface pressure drops from 1013.25 to 1005.0 hPa
    # Altimeter would falsely read rising altitude
    pressures = np.linspace(1013.25, 1005.0, n)

    corrected = ElevationService.compensate_barometric_drift(elev, pressures, temp)
    assert len(corrected) == n
    # Start point is unshifted
    assert math.isclose(corrected[0], 100.0, abs_tol=1e-3)
    # As pressure drops, standard baro altimeter over-reports height, so correction lowers it
    assert corrected[-1] < 100.0


def test_calculate_slope_from_distance():
    # 5% constant climb: 5m rise per 100m distance
    distance = np.arange(0, 1000, 5.0)  # 5m steps
    elev = 100.0 + 0.05 * distance

    slope = ElevationService.calculate_slope_from_distance(elev, distance)
    # Average slope should be close to 0.05 (5%)
    assert np.allclose(slope[2:-2], 0.05, atol=1e-3)

    # Extreme slope should be clipped
    steep_elev = np.array([0.0, 100.0])
    steep_dist = np.array([0.0, 10.0])  # 1000% slope
    clipped_slope = ElevationService.calculate_slope_from_distance(steep_elev, steep_dist)
    assert np.max(clipped_slope) <= 0.25
