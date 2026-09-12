"""Integration tests for FastAPI endpoints."""

import httpx
import pytest
import respx

from app.config import settings
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        res_api = await client.get("/api/health")
        assert res_api.status_code == 200
        assert res_api.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_inspect_fit_invalid_extension():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("activity.gpx", b"dummy content", "application/octet-stream")}
        res = await client.post("/api/fit/inspect", files=files)
        assert res.status_code == 400
        assert "must have a .fit extension" in res.json()["detail"]


@pytest.mark.asyncio
async def test_inspect_fit_empty_file():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("activity.fit", b"", "application/octet-stream")}
        res = await client.post("/api/fit/inspect", files=files)
        assert res.status_code == 400
        assert "file is empty" in res.json()["detail"]


@pytest.mark.asyncio
async def test_inspect_fit_success(sample_fit_bytes):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("ride.fit", sample_fit_bytes, "application/octet-stream")}
        res = await client.post("/api/fit/inspect", files=files)

        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "sample_points" in data
        assert data["summary"]["points_count"] == 30
        assert data["summary"]["avg_power_w"] == 250.0
        assert len(data["sample_points"]) > 0


@pytest.mark.asyncio
@respx.mock
async def test_process_fit_success(sample_fit_bytes, sample_weather_api_response):
    # Mock Open-Meteo archive call
    respx.get(settings.OPEN_METEO_ARCHIVE_URL).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("ride.fit", sample_fit_bytes, "application/octet-stream")}
        res = await client.post("/api/fit/process", files=files)

        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "weather_summary" in data
        assert "points" in data
        assert len(data["points"]) == 30

        p0 = data["points"][0]
        assert "apparent_wind_speed_mps" in p0
        assert "headwind_comp_mps" in p0
        assert "crosswind_comp_mps" in p0
        assert "air_density_kg_m3" in p0
        assert p0["air_density_kg_m3"] > 1.0


@pytest.mark.asyncio
@respx.mock
async def test_process_fit_with_wind_modifiers(sample_fit_bytes, sample_weather_api_response):
    # Mock Open-Meteo archive call
    respx.get(settings.OPEN_METEO_ARCHIVE_URL).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("ride.fit", sample_fit_bytes, "application/octet-stream")}
        data_params = {
            "wind_scale_factor": 0.0,  # Zero wind simulation
            "wind_rotation_deg": 180.0,
        }
        res = await client.post("/api/fit/process", files=files, data=data_params)

        assert res.status_code == 200
        data = res.json()
        p0 = data["points"][0]
        # In zero-wind scenario, wind speed at cyclist is 0, so apparent wind == bike speed
        assert p0["wind_speed_cyclist_mps"] == 0.0
        assert pytest.approx(p0["apparent_wind_speed_mps"], 1e-2) == p0["speed_mps"]


@pytest.mark.asyncio
@respx.mock
async def test_estimate_cda_endpoint(sample_fit_bytes, sample_weather_api_response):
    respx.get(settings.OPEN_METEO_ARCHIVE_URL).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("ride.fit", sample_fit_bytes, "application/octet-stream")}
        data = {
            "mass_kg": 78.0,
            "fixed_crr": 0.004,
            "initial_cda": 0.32,
        }
        res = await client.post("/api/physics/estimate-cda", files=files, data=data)

        assert res.status_code == 200
        result = res.json()
        assert "cda" in result
        assert "crr" in result
        assert "virtual_elevation_m" in result
        assert "real_elevation_m" in result
        assert 0.10 < result["cda"] < 0.65
        assert len(result["virtual_elevation_m"]) == 30


@pytest.mark.asyncio
@respx.mock
async def test_simulation_what_if_endpoint(sample_fit_bytes, sample_weather_api_response):
    respx.get(settings.OPEN_METEO_ARCHIVE_URL).respond(
        status_code=200,
        json=sample_weather_api_response,
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        files = {"file": ("ride.fit", sample_fit_bytes, "application/octet-stream")}
        data = {
            "mass_kg": 78.0,
            "cda": 0.32,
            "crr": 0.004,
            "spatial_step_m": 5.0,
            "zero_wind": "true",
            "calculate_equivalent_power": "true",
        }
        res = await client.post("/api/simulation/what-if", files=files, data=data)

        assert res.status_code == 200
        result = res.json()
        assert "summary" in result
        assert "spatial_points" in result
        assert result["summary"]["simulated_avg_speed_kmh"] > 0.0
        assert len(result["spatial_points"]) > 0


@pytest.mark.asyncio
async def test_cors_github_pages_origin():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = {
            "Origin": "https://miloszbuda.github.io",
            "Access-Control-Request-Method": "POST",
        }
        res = await client.options("/api/fit/process", headers=headers)
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "https://miloszbuda.github.io"


