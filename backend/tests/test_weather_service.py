"""Tests for weather service, atmospheric calculations, and Open-Meteo API client."""

import math
from datetime import datetime, timezone
import httpx
import pytest
import respx

from app.config import settings
from app.services.weather_service import WeatherService


def test_calculate_air_density():
    # Standard sea level: 101325 Pa, 15 deg C (288.15 K)
    # rho = 101325 / (287.058 * 288.15) = 1.2250 kg/m^3
    rho_std = WeatherService.calculate_air_density(101325.0, 15.0)
    assert math.isclose(rho_std, 1.2250, rel_tol=1e-3)

    # Warm summer day: 101325 Pa, 30 deg C (303.15 K)
    # rho = 101325 / (287.058 * 303.15) = 1.1644 kg/m^3
    rho_warm = WeatherService.calculate_air_density(101325.0, 30.0)
    assert math.isclose(rho_warm, 1.1644, rel_tol=1e-3)
    assert rho_warm < rho_std

    # High altitude: 85000 Pa, 5 deg C (278.15 K)
    rho_alt = WeatherService.calculate_air_density(85000.0, 5.0)
    assert math.isclose(rho_alt, 1.0645, rel_tol=1e-3)


def test_logarithmic_wind_profile():
    service = WeatherService(z_ref=10.0, z_cyclist=1.2, z0=0.03)
    # Factor = ln(1.2/0.03) / ln(10.0/0.03) = ln(40) / ln(333.333) ~ 0.6350
    assert math.isclose(service.wind_height_factor, 0.6350, rel_tol=1e-2)

    # 10 m/s at 10m height should scale to ~6.35 m/s at 1.2m
    v_cyclist = service.scale_wind_speed(10.0)
    assert math.isclose(v_cyclist, 6.35, rel_tol=1e-2)

    # 0 m/s wind remains 0 m/s
    assert service.scale_wind_speed(0.0) == 0.0


def test_circular_wind_direction_interpolation():
    """Verify that interpolation between 350 deg and 10 deg passes through 0 deg North, NOT 180 deg South."""
    service = WeatherService()
    weather_raw = {
        "hourly": {
            "time": ["2023-05-01T10:00", "2023-05-01T11:00"],
            "temperature_2m": [20.0, 20.0],
            "surface_pressure": [1013.25, 1013.25],
            "wind_speed_10m": [5.0, 5.0],
            "wind_direction_10m": [350.0, 10.0],
            "relative_humidity_2m": [50.0, 50.0],
        }
    }

    # Midpoint timestamp at 10:30
    mid_ts = datetime(2023, 5, 1, 10, 30, tzinfo=timezone.utc)
    points, summary = service.interpolate_to_timestamps(weather_raw, [mid_ts])

    assert len(points) == 1
    # At midpoint, wind angle should be 0 (or 360) degrees (North)
    mid_dir = points[0].wind_direction_deg
    assert math.isclose(mid_dir, 0.0, abs_tol=1e-1) or math.isclose(mid_dir, 360.0, abs_tol=1e-1)


def test_interpolate_weather_series(sample_weather_api_response):
    service = WeatherService()
    # Interpolate for 3 seconds around 01:00 to 01:02
    target_times = [
        datetime(2021, 9, 8, 1, 0, 0, tzinfo=timezone.utc),
        datetime(2021, 9, 8, 1, 30, 0, tzinfo=timezone.utc),
        datetime(2021, 9, 8, 2, 0, 0, tzinfo=timezone.utc),
    ]

    points, summary = service.interpolate_to_timestamps(sample_weather_api_response, target_times)

    assert len(points) == 3
    # At 01:00: temp = 16.0, wind_10m = 6.0, wind_dir = 100.0
    assert math.isclose(points[0].temp_c, 16.0, rel_tol=1e-3)
    assert math.isclose(points[0].wind_speed_10m_mps, 6.0, rel_tol=1e-3)
    assert math.isclose(points[0].wind_direction_deg, 100.0, rel_tol=1e-2)

    # At 01:30: temp should be midpoint 16.5, wind_10m = 6.5, wind_dir = 105.0
    assert math.isclose(points[1].temp_c, 16.5, rel_tol=1e-3)
    assert math.isclose(points[1].wind_speed_10m_mps, 6.5, rel_tol=1e-3)
    assert math.isclose(points[1].wind_direction_deg, 105.0, rel_tol=1e-2)

    # Verify summary
    assert math.isclose(summary.avg_temp_c, 16.5, rel_tol=1e-3)
    assert math.isclose(summary.avg_wind_speed_10m_mps, 6.5, rel_tol=1e-3)


@pytest.mark.asyncio
@respx.mock
async def test_fetch_weather_raw_archive_success(sample_weather_api_response):
    service = WeatherService()

    respx.get(service.archive_url).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient() as client:
        data = await service.fetch_weather_raw(
            lat=52.23,
            lon=21.01,
            start_date="2021-09-08",
            end_date="2021-09-08",
            client=client,
        )

    assert "hourly" in data
    assert len(data["hourly"]["time"]) == 4
    assert data["latitude"] == 52.23


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_for_track_429_triggers_brightsky_fallback():
    """Verify that Open-Meteo 429 automatically cascades to Bright Sky API and returns real station weather."""
    service = WeatherService()
    WeatherService.clear_cache()

    # Open-Meteo returns 429
    respx.get(service.archive_url).respond(status_code=429, text="Too Many Requests")
    respx.get(service.forecast_url).respond(status_code=429, text="Too Many Requests")

    # Bright Sky returns valid DWD station observations
    brightsky_payload = {
        "weather": [
            {
                "timestamp": "2026-09-13T10:00:00+00:00",
                "temperature": 18.0,
                "pressure_msl": 1018.0,
                "wind_speed": 14.4,  # 14.4 km/h = 4.0 m/s
                "wind_direction": 180.0,
                "relative_humidity": 55.0,
            },
            {
                "timestamp": "2026-09-13T11:00:00+00:00",
                "temperature": 19.0,
                "pressure_msl": 1017.0,
                "wind_speed": 18.0,  # 18.0 km/h = 5.0 m/s
                "wind_direction": 190.0,
                "relative_humidity": 50.0,
            },
        ],
        "sources": [{"station_name": "RZESZOW-JASIONKA"}],
    }
    respx.get("https://api.brightsky.dev/weather").respond(status_code=200, json=brightsky_payload)

    target_times = [
        datetime(2026, 9, 13, 10, 0, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 13, 10, 30, 0, tzinfo=timezone.utc),
    ]

    async with httpx.AsyncClient() as client:
        points, summary = await service.get_weather_for_track(
            lat=50.15,
            lon=21.82,
            start_date="2026-09-13",
            end_date="2026-09-13",
            target_timestamps=target_times,
            avg_elevation_m=200.0,
            temp_c_hint=18.0,
            client=client,
        )

    assert len(points) == 2
    assert summary.is_fallback is False
    assert summary.weather_provider == "Bright Sky (DWD/SYNOP)"
    assert math.isclose(summary.avg_temp_c, 18.25, rel_tol=1e-2)
    assert math.isclose(summary.avg_wind_speed_10m_mps, 4.25, rel_tol=1e-2)
    assert math.isclose(summary.dominant_wind_dir_deg, 182.5, abs_tol=1.0)


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_for_track_429_triggers_met_norway_fallback():
    """Verify that if Open-Meteo and Bright Sky fail, MET Norway is queried and succeeds."""
    service = WeatherService()
    WeatherService.clear_cache()

    # Open-Meteo returns 429
    respx.get(service.archive_url).respond(status_code=429, text="Too Many Requests")
    respx.get(service.forecast_url).respond(status_code=429, text="Too Many Requests")

    # Bright Sky returns 500
    respx.get("https://api.brightsky.dev/weather").respond(status_code=500, text="Internal Server Error")

    # MET Norway returns valid timeseries
    met_payload = {
        "properties": {
            "timeseries": [
                {
                    "time": "2026-09-13T10:00:00Z",
                    "data": {
                        "instant": {
                            "details": {
                                "air_temperature": 16.0,
                                "air_pressure_at_sea_level": 1015.0,
                                "wind_speed": 3.0,
                                "wind_from_direction": 90.0,
                                "relative_humidity": 60.0,
                            }
                        }
                    },
                },
                {
                    "time": "2026-09-13T11:00:00Z",
                    "data": {
                        "instant": {
                            "details": {
                                "air_temperature": 17.0,
                                "air_pressure_at_sea_level": 1015.0,
                                "wind_speed": 4.0,
                                "wind_from_direction": 90.0,
                                "relative_humidity": 55.0,
                            }
                        }
                    },
                },
            ]
        }
    }
    respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").respond(status_code=200, json=met_payload)

    target_times = [
        datetime(2026, 9, 13, 10, 0, 0, tzinfo=timezone.utc),
    ]

    async with httpx.AsyncClient() as client:
        points, summary = await service.get_weather_for_track(
            lat=50.15,
            lon=21.82,
            start_date="2026-09-13",
            end_date="2026-09-13",
            target_timestamps=target_times,
            avg_elevation_m=200.0,
            temp_c_hint=16.0,
            client=client,
        )

    assert len(points) == 1
    assert summary.is_fallback is False
    assert summary.weather_provider == "MET Norway"
    assert math.isclose(summary.avg_temp_c, 16.0, rel_tol=1e-2)
    assert math.isclose(summary.avg_wind_speed_10m_mps, 3.0, rel_tol=1e-2)


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_for_track_429_graceful_fallback():
    """Verify that when all external services fail, ISA fallback engages gracefully without error."""
    service = WeatherService()
    WeatherService.clear_cache()

    # Open-Meteo returns 429
    respx.get(service.archive_url).respond(status_code=429, text="Too Many Requests")
    respx.get(service.forecast_url).respond(status_code=429, text="Too Many Requests")
    # Bright Sky returns 500
    respx.get("https://api.brightsky.dev/weather").respond(status_code=500, text="Down")
    # MET Norway returns 500
    respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").respond(status_code=500, text="Down")

    target_times = [
        datetime(2026, 9, 13, 10, 0, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 13, 10, 0, 1, tzinfo=timezone.utc),
    ]

    async with httpx.AsyncClient() as client:
        points, summary = await service.get_weather_for_track(
            lat=50.15,
            lon=21.82,
            start_date="2026-09-13",
            end_date="2026-09-13",
            target_timestamps=target_times,
            avg_elevation_m=220.0,
            temp_c_hint=19.5,
            client=client,
        )

    assert len(points) == 2
    assert summary.is_fallback is True
    assert summary.weather_provider == "Standard Atmosphere (ISA)"
    assert "niedostępne" in (summary.fallback_reason or "") or "429" in (summary.fallback_reason or "")
    # Should use the hint temperature 19.5 C
    assert math.isclose(summary.avg_temp_c, 19.5, rel_tol=1e-3)
    assert 1.15 < summary.avg_air_density_kg_m3 < 1.25
    assert points[0].wind_speed_10m_mps == 2.0


@pytest.mark.asyncio
@respx.mock
async def test_weather_cache_avoids_duplicate_api_calls(sample_weather_api_response):
    """Verify that calling fetch_weather_raw for same spatial area hits cache instead of remote API."""
    service = WeatherService()

    route = respx.get(service.archive_url).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient() as client:
        # First call: hits remote API
        await service.fetch_weather_raw(lat=52.234, lon=21.012, start_date="2020-01-01", end_date="2020-01-01", client=client)
        # Second call with nearby coordinates (same 2-decimal cell): hits cache
        await service.fetch_weather_raw(lat=52.231, lon=21.014, start_date="2020-01-01", end_date="2020-01-01", client=client)

    # Remote route should have only been called once
    assert route.call_count == 1
