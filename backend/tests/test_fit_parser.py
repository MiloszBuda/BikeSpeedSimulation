"""Tests for FIT parser service."""

import math
from datetime import datetime, timezone
import numpy as np
import pytest

from app.services.fit_parser import (
    FitParser,
    _to_degrees,
    calculate_bearing,
    calculate_normalized_power,
)
from tests.conftest import make_synthetic_fit_bytes


def test_to_degrees_conversion():
    # 0 semicircles -> 0 degrees
    assert _to_degrees(0) == 0.0
    # Values <= 180 should not be scaled
    assert _to_degrees(52.2297) == 52.2297
    assert _to_degrees(-21.0122) == -21.0122
    # Semicircles conversion: 2^31 is 180 degrees
    semi_90 = 2**30
    assert math.isclose(_to_degrees(semi_90), 90.0, rel_tol=1e-6)
    semi_warsaw = int(52.2297 * (2**31 / 180.0))
    assert math.isclose(_to_degrees(semi_warsaw), 52.2297, rel_tol=1e-5)
    # None
    assert _to_degrees(None) is None


def test_calculate_bearing():
    # Moving due North
    b_north = calculate_bearing(52.0, 21.0, 53.0, 21.0)
    assert math.isclose(b_north, 0.0, abs_tol=1e-2)

    # Moving due East
    b_east = calculate_bearing(0.0, 0.0, 0.0, 1.0)
    assert math.isclose(b_east, 90.0, abs_tol=1e-2)

    # Moving due South
    b_south = calculate_bearing(53.0, 21.0, 52.0, 21.0)
    assert math.isclose(b_south, 180.0, abs_tol=1e-2)

    # Moving due West
    b_west = calculate_bearing(0.0, 1.0, 0.0, 0.0)
    assert math.isclose(b_west, 270.0, abs_tol=1e-2)


def test_normalized_power():
    # Array < 30 elements returns None
    short_power = np.array([200.0] * 20)
    assert calculate_normalized_power(short_power) is None

    # Array of constant 250W over 60 seconds should yield NP = 250W
    const_power = np.array([250.0] * 60)
    np_val = calculate_normalized_power(const_power)
    assert np_val is not None
    assert math.isclose(np_val, 250.0, rel_tol=1e-3)


def test_parse_valid_fit(sample_fit_bytes):
    points, summary = FitParser.parse_fit_bytes(sample_fit_bytes)

    assert len(points) == 30
    assert summary.duration_s == 29.0
    assert summary.points_count == 30

    # Verify first point
    p0 = points[0]
    assert p0.time_offset_s == 0
    assert math.isclose(p0.lat, 52.2297, rel_tol=1e-4)
    assert math.isclose(p0.lon, 21.0122, rel_tol=1e-4)
    assert math.isclose(p0.speed_mps, 8.5, rel_tol=1e-2)
    assert p0.power_w == 250.0

    # Verify monotonic time offset
    offsets = [p.time_offset_s for p in points]
    assert offsets == list(range(30))

    # Verify summary bbox
    assert summary.bbox.min_lat <= summary.bbox.max_lat
    assert summary.bbox.min_lon <= summary.bbox.max_lon
    assert math.isclose(summary.avg_power_w, 250.0, rel_tol=1e-2)


def test_parse_empty_bytes():
    with pytest.raises(Exception):
        FitParser.parse_fit_bytes(b"")


def test_resample_irregular_records():
    # Test resampling of irregular records (e.g. 0s, 3s, 5s)
    t0 = datetime(2023, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    t3 = datetime(2023, 6, 1, 10, 0, 3, tzinfo=timezone.utc)
    t5 = datetime(2023, 6, 1, 10, 0, 5, tzinfo=timezone.utc)

    records = [
        {
            "timestamp": t0,
            "lat": 52.0,
            "lon": 21.0,
            "speed": 10.0,
            "altitude": 100.0,
            "distance": 0.0,
            "power": 200.0,
            "cadence": 80.0,
            "heart_rate": 140.0,
        },
        {
            "timestamp": t3,
            "lat": 52.0003,
            "lon": 21.0,
            "speed": 10.0,
            "altitude": 103.0,
            "distance": 30.0,
            "power": 230.0,
            "cadence": 85.0,
            "heart_rate": 145.0,
        },
        {
            "timestamp": t5,
            "lat": 52.0005,
            "lon": 21.0,
            "speed": 10.0,
            "altitude": 105.0,
            "distance": 50.0,
            "power": 250.0,
            "cadence": 90.0,
            "heart_rate": 150.0,
        },
    ]

    points, summary = FitParser._resample_to_1hz(records)
    # Total span is 5 seconds -> 6 points (0, 1, 2, 3, 4, 5)
    assert len(points) == 6
    assert summary.duration_s == 5.0

    # At t=1s (interpolated 1/3 between t0 and t3):
    # power should be 200 + (230 - 200) * 1/3 = 210.0
    p1 = points[1]
    assert math.isclose(p1.power_w, 210.0, rel_tol=1e-3)
    assert math.isclose(p1.elevation_m, 101.0, rel_tol=1e-3)
