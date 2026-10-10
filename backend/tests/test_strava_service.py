"""Unit and integration tests for StravaService and StravaAdapter."""

from datetime import datetime, timezone
import json
import math
import os
import tempfile
import pytest
import respx
import httpx

from app.schemas.strava import StravaActivityMeta
from app.services.strava_adapter import StravaAdapter
from app.services.strava_service import StravaService


def test_strava_adapter_streams_to_track_points():
    """Verify that Strava streams are accurately converted to 1 Hz TrackPoints and FitSummary."""
    # Create realistic synthetic Strava streams
    n_pts = 60
    time_arr = list(range(n_pts))
    dist_arr = [float(i * 8.0) for i in range(n_pts)]  # constant 8.0 m/s (~28.8 km/h)
    latlng_arr = [[52.2297 + i * 0.0001, 21.0122 + i * 0.0001] for i in range(n_pts)]
    alt_arr = [100.0 + i * 0.2 for i in range(n_pts)]
    watts_arr = [200.0 + (i % 20) for i in range(n_pts)]

    streams = {
        "time": {"data": time_arr},
        "distance": {"data": dist_arr},
        "latlng": {"data": latlng_arr},
        "altitude": {"data": alt_arr},
        "watts": {"data": watts_arr},
        "velocity_smooth": {"data": [8.0] * n_pts},
    }

    track_points, summary = StravaAdapter.streams_to_track_points(
        streams=streams,
        start_time_iso="2026-06-01T10:00:00Z",
    )

    assert len(track_points) == n_pts
    assert summary.points_count == n_pts
    assert summary.total_distance_m == pytest.approx(dist_arr[-1])
    assert summary.avg_speed_kmh == pytest.approx(8.0 * 3.6, rel=1e-2)
    assert summary.avg_power_w > 190.0

    # First point
    p0 = track_points[0]
    assert p0.time_offset_s == 0
    assert p0.elevation_m == 100.0
    assert p0.distance_m == 0.0
    assert 0.0 <= p0.bearing_deg < 360.0

    # Speed computed from distance
    p1 = track_points[1]
    assert math.isclose(p1.speed_mps, 8.0, abs_tol=0.1)


@pytest.mark.asyncio
async def test_strava_service_auth_and_caching(tmp_path):
    """Test OAuth exchange, SQLite persistence, and activity caching."""
    db_path = str(tmp_path / "test_strava.db")
    service = StravaService(db_path=db_path)

    # Check initial auth status
    status = service.get_auth_status()
    assert status.connected is False

    # Test auth URL generation
    auth_url = service.get_auth_url(client_id="12345", redirect_uri="http://localhost:5173/strava/callback")
    assert "client_id=12345" in auth_url
    assert "activity:read_all" in auth_url

    # Mock token exchange
    token_payload = {
        "token_type": "Bearer",
        "access_token": "acc_token_123",
        "refresh_token": "ref_token_456",
        "expires_at": 2000000000,  # far future
        "athlete": {
            "id": 99999,
            "username": "tester",
            "firstname": "Jan",
            "lastname": "Kowalski",
        },
    }

    with respx.mock:
        respx.post("https://www.strava.com/oauth/token").respond(status_code=200, json=token_payload)

        async with httpx.AsyncClient() as client:
            res = await service.exchange_code_for_token(
                code="auth_code_xyz",
                client_id="12345",
                client_secret="secret_abc",
                client=client,
            )

    assert res["access_token"] == "acc_token_123"

    # Check connected status
    status_after = service.get_auth_status()
    assert status_after.connected is True
    assert status_after.athlete is not None
    assert status_after.athlete.id == 99999
    assert status_after.athlete.firstname == "Jan"

    # Mock activity fetching and test SQLite caching
    activities_payload = [
        {
            "id": 101,
            "name": "Morning Ride",
            "distance": 32000.0,
            "moving_time": 3600,
            "elapsed_time": 3700,
            "total_elevation_gain": 250.0,
            "type": "Ride",
            "sport_type": "Ride",
            "start_date": "2026-06-01T08:00:00Z",
            "trainer": False,
            "device_watts": True,
            "average_speed": 8.88,
            "max_speed": 14.5,
            "average_watts": 210.0,
        }
    ]

    with respx.mock:
        respx.get("https://www.strava.com/api/v3/athlete/activities").respond(status_code=200, json=activities_payload)

        async with httpx.AsyncClient() as client:
            acts = await service.fetch_activities(force_refresh=True, client=client)

    assert len(acts) == 1
    assert acts[0].id == 101
    assert acts[0].is_outdoor_with_power is True

    # Now fetch without force_refresh: should hit local SQLite cache without HTTP requests!
    acts_cached = await service.fetch_activities(force_refresh=False)
    assert len(acts_cached) == 1
    assert acts_cached[0].id == 101

    # Mock stream fetching
    streams_payload = {
        "time": {"data": [0, 1, 2]},
        "distance": {"data": [0.0, 8.0, 16.0]},
        "latlng": {"data": [[52.2, 21.0], [52.2001, 21.0001], [52.2002, 21.0002]]},
        "altitude": {"data": [100.0, 100.1, 100.2]},
        "watts": {"data": [220, 225, 230]},
    }

    with respx.mock:
        respx.get("https://www.strava.com/api/v3/activities/101/streams").respond(status_code=200, json=streams_payload)

        async with httpx.AsyncClient() as client:
            streams = await service.get_activity_streams(activity_id=101, force_refresh=True, client=client)

    assert "time" in streams
    assert len(streams["time"]["data"]) == 3

    # Subsequent call should return from SQLite cache without HTTP call
    cached_streams = await service.get_activity_streams(activity_id=101, force_refresh=False)
    assert "time" in cached_streams
