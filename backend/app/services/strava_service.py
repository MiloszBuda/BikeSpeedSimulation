"""Strava API service with OAuth 2.0, automatic token refresh, SQLite caching, and rate limiting."""

from datetime import datetime, timezone
import json
import logging
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.config import settings
from app.schemas.strava import (
    StravaActivityMeta,
    StravaAthlete,
    StravaAuthStatusResponse,
    StravaRateLimitInfo,
)

logger = logging.getLogger(__name__)


class StravaService:
    """Handles Strava API authentication, token persistence, rate limit monitoring,

    metadata caching, and streams retrieval.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.STRAVA_DB_PATH
        # Ensure parent directory exists
        db_dir = os.path.dirname(os.path.abspath(self.db_path))
        os.makedirs(db_dir, exist_ok=True)
        self._init_db()

        # In-memory rate limit tracker
        self.rate_limit_info = StravaRateLimitInfo()
        self.last_request_time: float = 0.0

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialize SQLite schema for Strava auth, activities, streams, and calibrations."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS strava_auth (
                    athlete_id INTEGER PRIMARY KEY,
                    client_id TEXT,
                    client_secret TEXT,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    scope TEXT,
                    athlete_json TEXT,
                    updated_at INTEGER NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS strava_activities (
                    id INTEGER PRIMARY KEY,
                    athlete_id INTEGER,
                    name TEXT NOT NULL,
                    distance REAL,
                    moving_time INTEGER,
                    elapsed_time INTEGER,
                    total_elevation_gain REAL,
                    type TEXT,
                    sport_type TEXT,
                    start_date TEXT,
                    start_date_local TEXT,
                    timezone TEXT,
                    trainer INTEGER,
                    device_watts INTEGER,
                    gear_id TEXT,
                    average_speed REAL,
                    max_speed REAL,
                    average_watts REAL,
                    weighted_average_watts REAL,
                    has_streams INTEGER DEFAULT 0,
                    payload_json TEXT,
                    updated_at INTEGER
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS strava_streams (
                    activity_id INTEGER PRIMARY KEY,
                    athlete_id INTEGER,
                    streams_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS calibrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at INTEGER NOT NULL,
                    athlete_id INTEGER,
                    gear_id TEXT,
                    mass_kg REAL,
                    cda REAL,
                    crr REAL,
                    eta REAL,
                    cda_std REAL,
                    crr_std REAL,
                    eta_std REAL,
                    validation_rmse_kmh REAL,
                    activity_ids_json TEXT,
                    result_json TEXT NOT NULL
                )
            """)
            conn.commit()

    def get_auth_url(self, client_id: Optional[str] = None, redirect_uri: Optional[str] = None) -> str:
        """Construct Strava OAuth authorization URL."""
        cid = client_id or settings.STRAVA_CLIENT_ID
        r_uri = redirect_uri or settings.STRAVA_REDIRECT_URI
        # activity:read_all is required to access private activities and detailed streams
        scope = "read,activity:read_all"
        return (
            f"{settings.STRAVA_AUTH_URL}?"
            f"client_id={cid}&response_type=code&redirect_uri={r_uri}&"
            f"approval_prompt=auto&scope={scope}"
        )

    async def exchange_code_for_token(
        self,
        code: str,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Dict[str, Any]:
        """Exchange temporary authorization code for persistent access & refresh tokens."""
        cid = client_id or settings.STRAVA_CLIENT_ID
        csec = client_secret or settings.STRAVA_CLIENT_SECRET

        if not cid or not csec:
            raise ValueError(
                "Brak Client ID lub Client Secret Stravy. "
                "Podaj je w formularzu lub ustaw zmienne środowiskowe STRAVA_CLIENT_ID i STRAVA_CLIENT_SECRET."
            )

        payload = {
            "client_id": cid,
            "client_secret": csec,
            "code": code,
            "grant_type": "authorization_code",
        }

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=20.0)
            close_client = True

        try:
            resp = await client.post(settings.STRAVA_TOKEN_URL, data=payload)
            self._update_rate_limits(resp.headers)

            if resp.status_code != 200:
                logger.error(f"Strava token exchange failed: {resp.status_code} {resp.text}")
                raise ValueError(f"Błąd autoryzacji Strava: {resp.text}")

            data = resp.json()
            athlete_data = data.get("athlete", {})
            athlete_id = athlete_data.get("id")

            # Store credentials securely in SQLite
            now_ts = int(time.time())
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO strava_auth 
                    (athlete_id, client_id, client_secret, access_token, refresh_token, expires_at, scope, athlete_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    athlete_id,
                    cid,
                    csec,
                    data.get("access_token"),
                    data.get("refresh_token"),
                    data.get("expires_at"),
                    "activity:read_all",
                    json.dumps(athlete_data),
                    now_ts,
                ))
                conn.commit()

            return data
        finally:
            if close_client:
                await client.aclose()

    async def get_valid_access_token(
        self,
        athlete_id: Optional[int] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[str, int]:
        """Retrieve a valid access token for the athlete, automatically refreshing it if expired or expiring within 5 minutes."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if athlete_id is not None:
                cursor.execute("SELECT * FROM strava_auth WHERE athlete_id = ? LIMIT 1", (athlete_id,))
            else:
                cursor.execute("SELECT * FROM strava_auth ORDER BY updated_at DESC LIMIT 1")
            row = cursor.fetchone()

        if not row:
            raise ValueError("Brak połączonego konta Strava. Zaloguj się najpierw przez Strava OAuth.")

        row_athlete_id = row["athlete_id"]
        cid = row["client_id"]
        csec = row["client_secret"]
        access_token = row["access_token"]
        refresh_token = row["refresh_token"]
        expires_at = row["expires_at"]

        now_ts = int(time.time())
        # If token expires in less than 5 minutes (300 seconds), refresh it
        if expires_at - now_ts < 300:
            logger.info(f"Strava token expiring soon for athlete {row_athlete_id}; refreshing...")
            close_client = False
            if client is None:
                client = httpx.AsyncClient(timeout=20.0)
                close_client = True

            try:
                ref_payload = {
                    "client_id": cid,
                    "client_secret": csec,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
                resp = await client.post(settings.STRAVA_TOKEN_URL, data=ref_payload)
                self._update_rate_limits(resp.headers)

                if resp.status_code != 200:
                    logger.error(f"Strava token refresh failed: {resp.status_code} {resp.text}")
                    raise ValueError(f"Nie udało się odświeżyć tokena Stravy: {resp.text}")

                new_data = resp.json()
                access_token = new_data["access_token"]
                refresh_token = new_data["refresh_token"]
                expires_at = new_data["expires_at"]

                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE strava_auth 
                        SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ?
                        WHERE athlete_id = ?
                    """, (access_token, refresh_token, expires_at, int(time.time()), row_athlete_id))
                    conn.commit()
            finally:
                if close_client:
                    await client.aclose()

        return access_token, row_athlete_id

    def get_auth_status(self) -> StravaAuthStatusResponse:
        """Check whether Strava account is connected and token is available."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM strava_auth ORDER BY updated_at DESC LIMIT 1")
            row = cursor.fetchone()

        if not row:
            has_creds = bool(settings.STRAVA_CLIENT_ID and settings.STRAVA_CLIENT_SECRET)
            return StravaAuthStatusResponse(connected=False, has_credentials=has_creds)

        athlete_obj = None
        if row["athlete_json"]:
            try:
                raw_ath = json.loads(row["athlete_json"])
                athlete_obj = StravaAthlete(
                    id=raw_ath.get("id"),
                    username=raw_ath.get("username"),
                    firstname=raw_ath.get("firstname"),
                    lastname=raw_ath.get("lastname"),
                    profile=raw_ath.get("profile"),
                    city=raw_ath.get("city"),
                    country=raw_ath.get("country"),
                )
            except Exception:
                pass

        return StravaAuthStatusResponse(
            connected=True,
            athlete=athlete_obj,
            scopes=["activity:read_all"],
            expires_at=row["expires_at"],
            has_credentials=True,
        )

    def disconnect(self, athlete_id: Optional[int] = None):
        """Remove saved athlete credentials and cached data."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if athlete_id:
                cursor.execute("DELETE FROM strava_auth WHERE athlete_id = ?", (athlete_id,))
            else:
                cursor.execute("DELETE FROM strava_auth")
            conn.commit()

    async def fetch_activities(
        self,
        before: Optional[int] = None,
        after: Optional[int] = None,
        page: int = 1,
        per_page: int = 30,
        athlete_id: Optional[int] = None,
        force_refresh: bool = False,
        client: Optional[httpx.AsyncClient] = None,
    ) -> List[StravaActivityMeta]:
        """Fetch athlete activity list, caching metadata in SQLite."""
        token, effective_athlete_id = await self.get_valid_access_token(athlete_id, client=client)

        # Check local cache first if not forcing refresh
        now_ts = int(time.time())
        if not force_refresh:
            cached = self._get_cached_activities(effective_athlete_id, before, after, page, per_page)
            if cached:
                return cached

        # Rate limit safety delay
        await self._throttle()

        params: Dict[str, Any] = {"page": page, "per_page": min(100, max(1, per_page))}
        if before:
            params["before"] = before
        if after:
            params["after"] = after

        headers = {"Authorization": f"Bearer {token}"}
        url = f"{settings.STRAVA_API_BASE}/athlete/activities"

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=25.0)
            close_client = True

        try:
            resp = await client.get(url, headers=headers, params=params)
            self._update_rate_limits(resp.headers)

            if resp.status_code == 429:
                logger.warning("Strava API 429 Rate Limit exceeded.")
                cached = self._get_cached_activities(effective_athlete_id, before, after, page, per_page)
                if cached:
                    return cached
                raise ValueError("Przekroczono limit zapytań Strava API (429 Too Many Requests). Spróbuj ponownie za chwilę.")

            if resp.status_code != 200:
                raise ValueError(f"Błąd pobierania aktywności ze Stravy ({resp.status_code}): {resp.text}")

            activities_raw = resp.json()
            metas: List[StravaActivityMeta] = []

            with self._get_connection() as conn:
                cursor = conn.cursor()
                for act in activities_raw:
                    act_id = act.get("id")
                    device_watts = bool(act.get("device_watts", False))
                    trainer = bool(act.get("trainer", False))
                    sport_type = act.get("sport_type") or act.get("type") or "Ride"
                    is_outdoor_power = device_watts and not trainer and ("Ride" in sport_type or sport_type == "GravelRide" or sport_type == "MountainBikeRide" or sport_type == "EBikeRide")

                    # Check if we already have streams cached for this activity
                    cursor.execute("SELECT 1 FROM strava_streams WHERE activity_id = ? LIMIT 1", (act_id,))
                    has_streams = cursor.fetchone() is not None

                    cursor.execute("""
                        INSERT OR REPLACE INTO strava_activities (
                            id, athlete_id, name, distance, moving_time, elapsed_time,
                            total_elevation_gain, type, sport_type, start_date, start_date_local,
                            timezone, trainer, device_watts, gear_id, average_speed, max_speed,
                            average_watts, weighted_average_watts, has_streams, payload_json, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        act_id,
                        effective_athlete_id,
                        act.get("name", f"Ride {act_id}"),
                        float(act.get("distance", 0.0)),
                        int(act.get("moving_time", 0)),
                        int(act.get("elapsed_time", 0)),
                        float(act.get("total_elevation_gain", 0.0)),
                        act.get("type", "Ride"),
                        sport_type,
                        act.get("start_date", ""),
                        act.get("start_date_local", ""),
                        act.get("timezone", ""),
                        1 if trainer else 0,
                        1 if device_watts else 0,
                        act.get("gear_id"),
                        float(act.get("average_speed", 0.0)),
                        float(act.get("max_speed", 0.0)),
                        float(act.get("average_watts", 0.0)) if act.get("average_watts") else None,
                        float(act.get("weighted_average_watts", 0.0)) if act.get("weighted_average_watts") else None,
                        1 if has_streams else 0,
                        json.dumps(act),
                        now_ts,
                    ))

                    metas.append(
                        StravaActivityMeta(
                            id=act_id,
                            name=act.get("name", f"Ride {act_id}"),
                            distance_m=float(act.get("distance", 0.0)),
                            moving_time_s=int(act.get("moving_time", 0)),
                            elapsed_time_s=int(act.get("elapsed_time", 0)),
                            total_elevation_gain_m=float(act.get("total_elevation_gain", 0.0)),
                            type=act.get("type", "Ride"),
                            sport_type=sport_type,
                            start_date=act.get("start_date", ""),
                            start_date_local=act.get("start_date_local", ""),
                            timezone=act.get("timezone"),
                            trainer=trainer,
                            device_watts=device_watts,
                            gear_id=act.get("gear_id"),
                            average_speed_mps=float(act.get("average_speed", 0.0)),
                            max_speed_mps=float(act.get("max_speed", 0.0)),
                            average_watts=float(act.get("average_watts")) if act.get("average_watts") else None,
                            weighted_average_watts=float(act.get("weighted_average_watts")) if act.get("weighted_average_watts") else None,
                            has_streams=has_streams,
                            is_outdoor_with_power=is_outdoor_power,
                        )
                    )
                conn.commit()

            return metas
        finally:
            if close_client:
                await client.aclose()

    def _get_cached_activities(
        self,
        athlete_id: int,
        before: Optional[int],
        after: Optional[int],
        page: int,
        per_page: int,
    ) -> List[StravaActivityMeta]:
        """Query activities from local SQLite cache."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = "SELECT * FROM strava_activities WHERE athlete_id = ?"
            args: List[Any] = [athlete_id]

            query += " ORDER BY start_date DESC LIMIT ? OFFSET ?"
            args.extend([per_page, (page - 1) * per_page])

            cursor.execute(query, tuple(args))
            rows = cursor.fetchall()

        if not rows:
            return []

        results: List[StravaActivityMeta] = []
        for r in rows:
            sport = r["sport_type"] or r["type"] or "Ride"
            is_outdoor_power = bool(r["device_watts"]) and not bool(r["trainer"])
            results.append(
                StravaActivityMeta(
                    id=r["id"],
                    name=r["name"],
                    distance_m=r["distance"],
                    moving_time_s=r["moving_time"],
                    elapsed_time_s=r["elapsed_time"],
                    total_elevation_gain_m=r["total_elevation_gain"],
                    type=r["type"],
                    sport_type=sport,
                    start_date=r["start_date"],
                    start_date_local=r["start_date_local"],
                    timezone=r["timezone"],
                    trainer=bool(r["trainer"]),
                    device_watts=bool(r["device_watts"]),
                    gear_id=r["gear_id"],
                    average_speed_mps=r["average_speed"],
                    max_speed_mps=r["max_speed"],
                    average_watts=r["average_watts"],
                    weighted_average_watts=r["weighted_average_watts"],
                    has_streams=bool(r["has_streams"]),
                    is_outdoor_with_power=is_outdoor_power,
                )
            )
        return results

    async def get_activity_streams(
        self,
        activity_id: int,
        athlete_id: Optional[int] = None,
        force_refresh: bool = False,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Dict[str, Any]:
        """Fetch 1 Hz activity streams (time, distance, latlng, altitude, watts, etc.) with SQLite caching."""
        # 1. Check local cache
        if not force_refresh:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT streams_json FROM strava_streams WHERE activity_id = ? LIMIT 1", (activity_id,))
                row = cursor.fetchone()
                if row and row["streams_json"]:
                    return json.loads(row["streams_json"])

        token, effective_athlete_id = await self.get_valid_access_token(athlete_id, client=client)

        # 2. Rate limit safety check
        await self._throttle()

        keys = "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth"
        url = f"{settings.STRAVA_API_BASE}/activities/{activity_id}/streams"
        params = {"keys": keys, "key_by_type": "true"}
        headers = {"Authorization": f"Bearer {token}"}

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0)
            close_client = True

        try:
            resp = await client.get(url, headers=headers, params=params)
            self._update_rate_limits(resp.headers)

            if resp.status_code == 429:
                raise ValueError("Przekroczono limit żądań Strava API (429 Too Many Requests). Odczekaj kilka minut.")

            if resp.status_code == 404:
                raise ValueError(f"Nie znaleziono aktywności Strava o ID {activity_id}.")

            if resp.status_code != 200:
                raise ValueError(f"Błąd pobierania strumieni ze Stravy ({resp.status_code}): {resp.text}")

            streams_data = resp.json()

            # Cache into SQLite
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO strava_streams (activity_id, athlete_id, streams_json, created_at)
                    VALUES (?, ?, ?, ?)
                """, (activity_id, effective_athlete_id, json.dumps(streams_data), int(time.time())))
                cursor.execute("UPDATE strava_activities SET has_streams = 1 WHERE id = ?", (activity_id,))
                conn.commit()

            return streams_data
        finally:
            if close_client:
                await client.aclose()

    def _update_rate_limits(self, headers: httpx.Headers):
        """Parse Strava rate limit headers (X-RateLimit-Limit: 200,2000, X-RateLimit-Usage: 15,120)."""
        limit_hdr = headers.get("x-ratelimit-limit")
        usage_hdr = headers.get("x-ratelimit-usage")

        if limit_hdr and usage_hdr:
            try:
                limits = [int(x.strip()) for x in limit_hdr.split(",")]
                usages = [int(x.strip()) for x in usage_hdr.split(",")]
                if len(limits) >= 2 and len(usages) >= 2:
                    self.rate_limit_info.short_limit = limits[0]
                    self.rate_limit_info.long_limit = limits[1]
                    self.rate_limit_info.short_usage = usages[0]
                    self.rate_limit_info.long_usage = usages[1]
            except Exception as e:
                logger.debug(f"Failed to parse Strava rate limit headers: {e}")

    async def _throttle(self):
        """Cooperative rate limiting backoff."""
        # Ensure at least 100ms between calls
        elapsed = time.time() - self.last_request_time
        if elapsed < 0.10:
            import asyncio
            await asyncio.sleep(0.10 - elapsed)

        # If near 15-minute limit (e.g. >= 195 / 200), apply caution
        if self.rate_limit_info.short_usage >= 195:
            logger.warning("Approaching Strava 15-min limit! Applying 5s delay.")
            import asyncio
            await asyncio.sleep(5.0)

        self.last_request_time = time.time()

    def save_calibration_result(
        self,
        athlete_id: Optional[int],
        gear_id: Optional[str],
        mass_kg: float,
        res: Dict[str, Any],
        activity_ids: List[int],
    ):
        """Save auto-calibration result to SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO calibrations (
                    created_at, athlete_id, gear_id, mass_kg, cda, crr, eta,
                    cda_std, crr_std, eta_std, validation_rmse_kmh, activity_ids_json, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                int(time.time()),
                athlete_id,
                gear_id,
                mass_kg,
                res.get("cda"),
                res.get("crr"),
                res.get("eta"),
                res.get("cda_std"),
                res.get("crr_std"),
                res.get("eta_std"),
                res.get("validation_mean_rmse_kmh"),
                json.dumps(activity_ids),
                json.dumps(res),
            ))
            conn.commit()

    def get_latest_calibration_result(self, athlete_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Retrieve the most recent auto-calibration result from SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if athlete_id:
                cursor.execute("SELECT result_json FROM calibrations WHERE athlete_id = ? ORDER BY created_at DESC LIMIT 1", (athlete_id,))
            else:
                cursor.execute("SELECT result_json FROM calibrations ORDER BY created_at DESC LIMIT 1")
            row = cursor.fetchone()

        if row and row["result_json"]:
            return json.loads(row["result_json"])
        return None
