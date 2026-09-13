"""Pytest fixtures and test utilities."""

import struct
from datetime import datetime, timezone
from typing import Any, Dict
import pytest


def make_synthetic_fit_bytes(
    num_points: int = 30,
    base_time: int = 1000000000,
    start_lat: float = 52.2297,
    start_lon: float = 21.0122,
    speed_mps: float = 8.5,
    power_w: float = 250.0,
    altitude_m: float = 120.0,
) -> bytes:
    """Generate a valid binary Garmin FIT file buffer containing records."""
    # Definition message: global mesg num 20 (record) with 6 fields:
    # 253 (timestamp), 0 (position_lat), 1 (position_long), 6 (speed), 7 (power), 5 (distance)
    def_msg = struct.pack(
        '<BBBHB'
        'BBB'  # field 253 (timestamp)
        'BBB'  # field 0 (lat)
        'BBB'  # field 1 (lon)
        'BBB'  # field 6 (speed)
        'BBB'  # field 7 (power)
        'BBB', # field 5 (distance)
        0x40, 0, 0, 20, 6,
        253, 4, 0x86,
        0, 4, 0x85,
        1, 4, 0x85,
        6, 2, 0x84,
        7, 2, 0x84,
        5, 4, 0x86,
    )

    data_records = bytearray()
    lat_semi = int(start_lat * (2**31 / 180.0))
    lon_semi = int(start_lon * (2**31 / 180.0))

    for i in range(num_points):
        data_records += struct.pack(
            '<B I i i H H I',
            0x00,
            base_time + i,
            lat_semi + i * 100,
            lon_semi + i * 100,
            int(speed_mps * 1000),
            int(power_w),
            int(i * speed_mps * 100),
        )

    body = def_msg + data_records
    header = struct.pack('<BBHI4sH', 14, 0x20, 2100, len(body), b'.FIT', 0)
    footer_crc = struct.pack('<H', 0)
    return header + body + footer_crc


@pytest.fixture
def sample_fit_bytes() -> bytes:
    """Fixture providing valid 30-second binary FIT activity."""
    return make_synthetic_fit_bytes(num_points=30)


@pytest.fixture
def sample_weather_api_response() -> Dict[str, Any]:
    """Fixture providing realistic Open-Meteo hourly response."""
    return {
        "latitude": 52.23,
        "longitude": 21.01,
        "generationtime_ms": 0.25,
        "utc_offset_seconds": 0,
        "timezone": "UTC",
        "elevation": 115.0,
        "hourly_units": {
            "time": "iso8601",
            "temperature_2m": "°C",
            "surface_pressure": "hPa",
            "wind_speed_10m": "m/s",
            "wind_direction_10m": "°",
            "relative_humidity_2m": "%",
        },
        "hourly": {
            "time": [
                "2021-09-08T00:00",
                "2021-09-08T01:00",
                "2021-09-08T02:00",
                "2021-09-08T03:00",
            ],
            "temperature_2m": [15.0, 16.0, 17.0, 18.0],
            "surface_pressure": [1013.25, 1013.0, 1012.8, 1012.5],
            "wind_speed_10m": [5.0, 6.0, 7.0, 8.0],
            "wind_direction_10m": [90.0, 100.0, 110.0, 120.0],
            "relative_humidity_2m": [70.0, 68.0, 65.0, 60.0],
        },
    }


@pytest.fixture(autouse=True)
def auto_clear_weather_cache():
    """Clear WeatherService in-memory cache before and after every test to ensure test isolation."""
    from app.services.weather_service import WeatherService
    WeatherService.clear_cache()
    yield
    WeatherService.clear_cache()

