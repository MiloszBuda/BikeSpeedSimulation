"""Integration tests for calibration and Strava FastAPI endpoints."""

from datetime import datetime, timezone
import io
import json
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services.strava_service import StravaService
from tests.conftest import make_synthetic_fit_bytes

client = TestClient(app)


def test_calibrate_fit_endpoint_success(monkeypatch):
    """Test /api/calibration/calibrate-fit endpoint with multiple synthetic FIT files."""
    # Generate 2 synthetic FIT files of 600s with power
    fit_bytes1 = make_synthetic_fit_bytes(num_points=600, speed_mps=8.5, power_w=240.0)
    fit_bytes2 = make_synthetic_fit_bytes(num_points=600, speed_mps=9.2, power_w=280.0)

    # Mock weather service get_weather_for_track to avoid external network calls
    async def mock_weather(*args, **kwargs):
        from app.schemas.fit import WeatherPoint, WeatherSummary
        pts = [
            WeatherPoint(
                temp_c=18.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=2.0,
                wind_speed_cyclist_mps=1.4,
                wind_direction_deg=90.0,
                relative_humidity_pct=50.0,
                air_density_kg_m3=1.20,
            )
            for _ in range(600)
        ]
        summary = WeatherSummary(
            avg_temp_c=18.0,
            avg_pressure_hpa=1013.25,
            avg_air_density_kg_m3=1.20,
            avg_wind_speed_10m_mps=2.0,
            avg_wind_speed_cyclist_mps=1.4,
            dominant_wind_dir_deg=90.0,
        )
        return pts, summary

    from app.api import calibration_endpoints
    monkeypatch.setattr(calibration_endpoints.weather_service, "get_weather_for_track", mock_weather)

    files = [
        ("files", ("ride1.fit", fit_bytes1, "application/octet-stream")),
        ("files", ("ride2.fit", fit_bytes2, "application/octet-stream")),
    ]
    data = {
        "mass_kg": "78.0",
        "window_duration_s": "300",
    }

    resp = client.post("/api/calibration/calibrate-fit", files=files, data=data)
    assert resp.status_code == 200
    res = resp.json()

    assert res["n_activities"] == 2
    assert res["total_windows"] >= 2
    assert 0.18 <= res["cda"] <= 0.55
    assert 0.002 <= res["crr"] <= 0.010
    assert 0.90 <= res["eta"] <= 1.0
    assert "badge_text" in res
    assert res["badge_text"].startswith("auto, n=2")

    # Check /api/calibration/latest endpoint
    latest_resp = client.get("/api/calibration/latest")
    assert latest_resp.status_code == 200
    assert latest_resp.json()["calibrated"] is True


def test_strava_auth_url_endpoint():
    """Test /api/strava/auth-url endpoint."""
    resp = client.get("/api/strava/auth-url?client_id=98765")
    assert resp.status_code == 200
    data = resp.json()
    assert "client_id=98765" in data["auth_url"]
    assert "activity%3Aread_all" in data["auth_url"]


def test_strava_status_and_disconnect():
    """Test /api/strava/status and /api/strava/disconnect endpoints."""
    resp = client.get("/api/strava/status")
    assert resp.status_code == 200
    assert "connected" in resp.json()

    resp_disc = client.post("/api/strava/disconnect")
    assert resp_disc.status_code == 200
    assert resp_disc.json()["success"] is True

    resp_after = client.get("/api/strava/status")
    assert resp_after.json()["connected"] is False


@pytest.mark.asyncio
async def test_strava_process_activity_endpoint(monkeypatch):
    """Test /api/strava/activities/{id}/process loads a Strava activity into simulation pipeline."""
    streams_data = {
        "time": {"data": list(range(120))},
        "distance": {"data": [float(i * 8.0) for i in range(120)]},
        "latlng": {"data": [[52.2 + i * 0.0001, 21.0 + i * 0.0001] for i in range(120)]},
        "altitude": {"data": [110.0 + i * 0.1 for i in range(120)]},
        "watts": {"data": [220.0 for _ in range(120)]},
    }

    from app.api import strava_endpoints

    async def mock_get_streams(activity_id, **kwargs):
        return streams_data

    async def mock_weather(*args, **kwargs):
        from app.schemas.fit import WeatherPoint, WeatherSummary
        pts = [
            WeatherPoint(
                temp_c=18.0,
                surface_pressure_hpa=1013.25,
                surface_pressure_pa=101325.0,
                wind_speed_10m_mps=2.0,
                wind_speed_cyclist_mps=1.4,
                wind_direction_deg=90.0,
                relative_humidity_pct=50.0,
                air_density_kg_m3=1.20,
            )
            for _ in range(120)
        ]
        summary = WeatherSummary(
            avg_temp_c=18.0,
            avg_pressure_hpa=1013.25,
            avg_air_density_kg_m3=1.20,
            avg_wind_speed_10m_mps=2.0,
            avg_wind_speed_cyclist_mps=1.4,
            dominant_wind_dir_deg=90.0,
        )
        return pts, summary

    monkeypatch.setattr(strava_endpoints.strava_service, "get_activity_streams", mock_get_streams)
    monkeypatch.setattr(strava_endpoints.weather_service, "get_weather_for_track", mock_weather)

    resp = client.post("/api/strava/activities/55555/process")
    assert resp.status_code == 200
    res = resp.json()

    assert "summary" in res
    assert "points" in res
    assert len(res["points"]) == 120
    assert res["summary"]["points_count"] == 120
    assert res["points"][0]["speed_mps"] > 0
    assert "apparent_wind_speed_mps" in res["points"][0]
