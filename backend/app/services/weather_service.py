"""Weather data fetching, temporal/spatial interpolation, and atmospheric physics service."""

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np

from app.config import settings
from app.schemas.fit import WeatherPoint, WeatherSummary

logger = logging.getLogger(__name__)

# Global in-memory cache for Open-Meteo responses keyed by (lat, lon, start_date, end_date)
# Spatial coordinates rounded to 2 decimal places (~1.1 km resolution)
_WEATHER_CACHE: Dict[Tuple[float, float, str, str], Dict[str, Any]] = {}
_MAX_CACHE_SIZE = 256


class WeatherService:
    """Service to fetch Open-Meteo weather reanalysis and interpolate along ride track."""

    @classmethod
    def clear_cache(cls) -> None:
        """Clear in-memory weather cache (primarily for tests)."""
        _WEATHER_CACHE.clear()

    def __init__(
        self,
        archive_url: str = settings.OPEN_METEO_ARCHIVE_URL,
        forecast_url: str = settings.OPEN_METEO_FORECAST_URL,
        z_ref: float = settings.Z_REF,
        z_cyclist: float = settings.Z_CYCLIST,
        z0: float = settings.Z0_ROUGHNESS_OPEN_ROAD,
    ):
        self.archive_url = archive_url
        self.forecast_url = forecast_url
        self.z_ref = z_ref
        self.z_cyclist = z_cyclist
        self.z0 = z0
        # Wind scale factor via logarithmic wind profile
        self.wind_height_factor = math.log(self.z_cyclist / self.z0) / math.log(self.z_ref / self.z0)

    @staticmethod
    def calculate_air_density(pressure_pa: float, temp_c: float) -> float:
        """
        Calculate dry air density rho (kg/m^3) using ideal gas law:
        rho = P / (R_dry * T_kelvin)
        """
        temp_k = temp_c + 273.15
        if temp_k <= 0:
            raise ValueError(f"Invalid temperature in Celsius: {temp_c}")
        return float(pressure_pa / (settings.R_DRY_AIR * temp_k))

    def scale_wind_speed(self, wind_speed_10m: float) -> float:
        """Scale wind speed from 10m anemometer height to cyclist height (z ~ 1.2m)."""
        return float(max(0.0, wind_speed_10m * self.wind_height_factor))

    async def fetch_weather_raw(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Dict[str, Any]:
        """
        Fetch hourly weather variables from Open-Meteo API with caching, smart endpoint routing,
        and retry with backoff on 429 rate limits.
        """
        cache_key = (round(lat, 2), round(lon, 2), start_date, end_date)
        if cache_key in _WEATHER_CACHE:
            logger.info(f"Open-Meteo cache hit for {cache_key}")
            return _WEATHER_CACHE[cache_key]

        params = {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "start_date": start_date,
            "end_date": end_date,
            "hourly": [
                "temperature_2m",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "relative_humidity_2m",
            ],
            "wind_speed_unit": "ms",
            "timezone": "UTC",
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=15.0)
            should_close = True

        try:
            # Historical ERA5 has 5-day latency; recent dates must use forecast endpoint directly
            today = datetime.now(timezone.utc).date()
            try:
                start_d = datetime.fromisoformat(start_date).date()
                is_recent = (today - start_d).days < 5
            except Exception:
                is_recent = True

            urls_to_try = (
                [self.forecast_url, self.archive_url]
                if is_recent
                else [self.archive_url, self.forecast_url]
            )

            last_error = None
            for url in urls_to_try:
                for attempt in range(2):
                    try:
                        res = await client.get(url, params=params)
                        if res.status_code == 200:
                            data = res.json()
                            if "hourly" in data and "time" in data["hourly"] and len(data["hourly"]["time"]) > 0:
                                _WEATHER_CACHE[cache_key] = data
                                if len(_WEATHER_CACHE) > _MAX_CACHE_SIZE:
                                    oldest = next(iter(_WEATHER_CACHE))
                                    del _WEATHER_CACHE[oldest]
                                return data
                        elif res.status_code == 429:
                            last_error = httpx.HTTPStatusError("429 Too Many Requests", request=res.request, response=res)
                            logger.warning(f"Open-Meteo 429 rate limit on {url} (attempt {attempt+1}/2)")
                            if attempt == 0:
                                await asyncio.sleep(1.5)
                                continue
                        else:
                            last_error = httpx.HTTPStatusError(f"{res.status_code} {res.reason_phrase}", request=res.request, response=res)
                            break
                    except (httpx.TimeoutException, httpx.NetworkError) as err:
                        last_error = err
                        logger.warning(f"Network error querying {url}: {err} (attempt {attempt+1}/2)")
                        if attempt == 0:
                            await asyncio.sleep(1.0)
                            continue

            if last_error:
                raise last_error
            raise RuntimeError("No weather data returned from Open-Meteo endpoints.")
        finally:
            if should_close:
                await client.aclose()

    async def fetch_brightsky(
        self,
        lat: float,
        lon: float,
        date_str: str,
        last_date_str: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch weather observations from Bright Sky (DWD/SYNOP open weather API).
        Returns an Open-Meteo compatible hourly dict if successful, or None.
        """
        url = "https://api.brightsky.dev/weather"
        params: Dict[str, Any] = {
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "date": date_str,
        }
        if last_date_str and last_date_str != date_str:
            params["last_date"] = last_date_str

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=10.0)
            should_close = True

        try:
            res = await client.get(url, params=params)
            if res.status_code == 200:
                data = res.json()
                weather_entries = data.get("weather", [])
                if weather_entries:
                    times = []
                    temps = []
                    pressures = []
                    wind_speeds = []
                    wind_dirs = []
                    humidities = []
                    for entry in weather_entries:
                        t = entry.get("timestamp")
                        if not t:
                            continue
                        times.append(t)
                        temps.append(float(entry.get("temperature") if entry.get("temperature") is not None else 20.0))
                        p = entry.get("pressure_msl")
                        pressures.append(float(p if p is not None else 1013.25))
                        w_kmh = entry.get("wind_speed")
                        w_mps = (float(w_kmh) / 3.6) if w_kmh is not None else 2.0
                        wind_speeds.append(w_mps)
                        w_dir = entry.get("wind_direction")
                        wind_dirs.append(float(w_dir if w_dir is not None else 0.0))
                        humidities.append(float(entry.get("relative_humidity")) if entry.get("relative_humidity") is not None else None)

                    if times:
                        return {
                            "_provider": "Bright Sky (DWD/SYNOP)",
                            "hourly": {
                                "time": times,
                                "temperature_2m": temps,
                                "surface_pressure": pressures,
                                "wind_speed_10m": wind_speeds,
                                "wind_direction_10m": wind_dirs,
                                "relative_humidity_2m": humidities,
                            },
                        }
        except Exception as e:
            logger.warning(f"Bright Sky query error for ({lat}, {lon}, {date_str}): {e}")
        finally:
            if should_close:
                await client.aclose()
        return None

    async def fetch_met_norway(
        self,
        lat: float,
        lon: float,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch forecast time-series from MET Norway Weather API (api.met.no).
        Returns an Open-Meteo compatible hourly dict if successful, or None.
        """
        url = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
        params = {
            "lat": round(lat, 4),
            "lon": round(lon, 4),
        }
        headers = {
            "User-Agent": "BikeSpeedSimulation/1.0 (https://github.com/MiloszBuda/BikeSpeedSimulation)",
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=10.0)
            should_close = True

        try:
            res = await client.get(url, params=params, headers=headers)
            if res.status_code == 200:
                data = res.json()
                timeseries = data.get("properties", {}).get("timeseries", [])
                if timeseries:
                    times = []
                    temps = []
                    pressures = []
                    wind_speeds = []
                    wind_dirs = []
                    humidities = []
                    for entry in timeseries:
                        t = entry.get("time")
                        instant = entry.get("data", {}).get("instant", {}).get("details", {})
                        if not t or not instant:
                            continue
                        times.append(t)
                        temps.append(float(instant.get("air_temperature", 20.0)))
                        pressures.append(float(instant.get("air_pressure_at_sea_level", 1013.25)))
                        wind_speeds.append(float(instant.get("wind_speed", 2.0)))
                        wind_dirs.append(float(instant.get("wind_from_direction", 0.0)))
                        humidities.append(float(instant.get("relative_humidity")) if "relative_humidity" in instant else None)

                    if times:
                        return {
                            "_provider": "MET Norway",
                            "hourly": {
                                "time": times,
                                "temperature_2m": temps,
                                "surface_pressure": pressures,
                                "wind_speed_10m": wind_speeds,
                                "wind_direction_10m": wind_dirs,
                                "relative_humidity_2m": humidities,
                            },
                        }
        except Exception as e:
            logger.warning(f"MET Norway query error for ({lat}, {lon}): {e}")
        finally:
            if should_close:
                await client.aclose()
        return None

    def interpolate_to_timestamps(
        self,
        weather_raw: Dict[str, Any],
        target_timestamps: List[datetime],
        weather_provider: str = "Open-Meteo",
    ) -> Tuple[List[WeatherPoint], WeatherSummary]:
        """
        Interpolate hourly weather data to target second-by-second timestamps.
        Uses linear interpolation for continuous variables and trigonometric circular
        interpolation for wind direction (to avoid 0/360 discontinuities).
        Includes automatic timestamp sorting and deduplication for multi-provider resilience.
        """
        hourly = weather_raw.get("hourly", {})
        time_strs = hourly.get("time", [])
        if not time_strs:
            raise ValueError("No hourly time series in weather response.")

        # Parse hourly timestamps into epoch seconds
        raw_epochs = []
        for t_str in time_strs:
            dt = datetime.fromisoformat(t_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            raw_epochs.append(dt.timestamp())

        raw_temp = hourly.get("temperature_2m", [])
        raw_press = hourly.get("surface_pressure", [])
        raw_wind = hourly.get("wind_speed_10m", [])
        raw_dir = hourly.get("wind_direction_10m", [])
        raw_hum = hourly.get("relative_humidity_2m", None)

        # Sort and deduplicate by epoch timestamp to ensure monotonic array for np.interp
        combined = []
        for i in range(len(raw_epochs)):
            combined.append((
                raw_epochs[i],
                raw_temp[i] if i < len(raw_temp) else 20.0,
                raw_press[i] if i < len(raw_press) else 1013.25,
                raw_wind[i] if i < len(raw_wind) else 2.0,
                raw_dir[i] if i < len(raw_dir) else 0.0,
                raw_hum[i] if raw_hum and i < len(raw_hum) else None,
            ))
        combined.sort(key=lambda x: x[0])

        deduped = []
        seen_epochs = set()
        for item in combined:
            if item[0] not in seen_epochs:
                seen_epochs.add(item[0])
                deduped.append(item)

        hourly_epochs = np.array([item[0] for item in deduped], dtype=np.float64)
        temp_arr = np.array([item[1] for item in deduped], dtype=np.float64)
        pressure_hpa_arr = np.array([item[2] for item in deduped], dtype=np.float64)
        wind_speed_arr = np.array([item[3] for item in deduped], dtype=np.float64)
        wind_dir_arr = np.array([item[4] for item in deduped], dtype=np.float64)
        humidity_vals = [item[5] for item in deduped]
        has_humidity = any(h is not None for h in humidity_vals)
        humidity_arr = np.array([h if h is not None else 50.0 for h in humidity_vals], dtype=np.float64) if has_humidity else None

        # Wind direction unit vectors
        wind_dir_rad = np.radians(wind_dir_arr)
        u_x = np.cos(wind_dir_rad)
        u_y = np.sin(wind_dir_rad)

        # Target epochs
        target_epochs = np.array([t.timestamp() for t in target_timestamps], dtype=np.float64)

        # Interpolate scalar quantities
        interp_temp = np.interp(target_epochs, hourly_epochs, temp_arr)
        interp_pressure_hpa = np.interp(target_epochs, hourly_epochs, pressure_hpa_arr)
        interp_wind_speed_10m = np.interp(target_epochs, hourly_epochs, wind_speed_arr)
        interp_wind_speed_10m = np.maximum(interp_wind_speed_10m, 0.0)

        interp_humidity = (
            np.interp(target_epochs, hourly_epochs, humidity_arr)
            if humidity_arr is not None
            else None
        )

        # Interpolate wind direction unit vectors and reconstruct angle
        interp_u_x = np.interp(target_epochs, hourly_epochs, u_x)
        interp_u_y = np.interp(target_epochs, hourly_epochs, u_y)
        interp_dir_rad = np.arctan2(interp_u_y, interp_u_x)
        interp_wind_dir_deg = (np.degrees(interp_dir_rad) + 360.0) % 360.0

        # Construct WeatherPoint list
        weather_points: List[WeatherPoint] = []
        densities: List[float] = []
        cyclist_wind_speeds: List[float] = []

        for i in range(len(target_timestamps)):
            p_hpa = float(interp_pressure_hpa[i])
            p_pa = p_hpa * 100.0  # 1 hPa = 100 Pa
            t_c = float(interp_temp[i])
            rho = self.calculate_air_density(p_pa, t_c)
            w_10m = float(interp_wind_speed_10m[i])
            w_cyclist = self.scale_wind_speed(w_10m)
            w_dir = float(interp_wind_dir_deg[i])
            hum = float(interp_humidity[i]) if interp_humidity is not None else None

            densities.append(rho)
            cyclist_wind_speeds.append(w_cyclist)

            weather_points.append(
                WeatherPoint(
                    temp_c=t_c,
                    surface_pressure_hpa=p_hpa,
                    surface_pressure_pa=p_pa,
                    wind_speed_10m_mps=w_10m,
                    wind_speed_cyclist_mps=w_cyclist,
                    wind_direction_deg=w_dir,
                    relative_humidity_pct=hum,
                    air_density_kg_m3=rho,
                )
            )

        # Dominant wind direction across the activity (circular mean)
        mean_u_x = float(np.mean(interp_u_x))
        mean_u_y = float(np.mean(interp_u_y))
        dom_wind_dir = (math.degrees(math.atan2(mean_u_y, mean_u_x)) + 360.0) % 360.0

        effective_provider = weather_raw.get("_provider", weather_provider)

        summary = WeatherSummary(
            avg_temp_c=float(np.mean(interp_temp)),
            avg_pressure_hpa=float(np.mean(interp_pressure_hpa)),
            avg_air_density_kg_m3=float(np.mean(densities)),
            avg_wind_speed_10m_mps=float(np.mean(interp_wind_speed_10m)),
            avg_wind_speed_cyclist_mps=float(np.mean(cyclist_wind_speeds)),
            dominant_wind_dir_deg=float(dom_wind_dir),
            weather_provider=effective_provider,
            is_fallback=False,
            fallback_reason=None,
        )

        return weather_points, summary

    def generate_fallback_weather(
        self,
        target_timestamps: List[datetime],
        avg_elevation_m: float = 150.0,
        temp_c_override: Optional[float] = None,
        reason: str = "Wszystkie zewnętrzne serwisy pogodowe były niedostępne lub przekroczyły limity",
    ) -> Tuple[List[WeatherPoint], WeatherSummary]:
        """
        Generate realistic standard atmospheric weather profile when external APIs are unavailable.
        Uses ISA barometric formula for altitude-adjusted air pressure and density,
        with gentle baseline breeze (2.0 m/s) and measured temperature (if available).
        """
        n = len(target_timestamps)
        temp_c = float(temp_c_override) if temp_c_override is not None else 20.0
        # International Standard Atmosphere (ISA) barometric formula
        p_hpa = float(1013.25 * (1.0 - 2.25577e-5 * max(0.0, avg_elevation_m)) ** 5.25588)
        p_pa = p_hpa * 100.0
        rho = self.calculate_air_density(p_pa, temp_c)
        w_10m = 2.0
        w_cyclist = self.scale_wind_speed(w_10m)
        w_dir = 0.0

        if n == 0:
            empty_summary = WeatherSummary(
                avg_temp_c=temp_c,
                avg_pressure_hpa=p_hpa,
                avg_air_density_kg_m3=rho,
                avg_wind_speed_10m_mps=w_10m,
                avg_wind_speed_cyclist_mps=w_cyclist,
                dominant_wind_dir_deg=w_dir,
                weather_provider="Standard Atmosphere (ISA)",
                is_fallback=True,
                fallback_reason=reason,
            )
            return [], empty_summary

        weather_points = [
            WeatherPoint(
                temp_c=temp_c,
                surface_pressure_hpa=p_hpa,
                surface_pressure_pa=p_pa,
                wind_speed_10m_mps=w_10m,
                wind_speed_cyclist_mps=w_cyclist,
                wind_direction_deg=w_dir,
                relative_humidity_pct=50.0,
                air_density_kg_m3=rho,
            )
            for _ in range(n)
        ]

        summary = WeatherSummary(
            avg_temp_c=temp_c,
            avg_pressure_hpa=p_hpa,
            avg_air_density_kg_m3=rho,
            avg_wind_speed_10m_mps=w_10m,
            avg_wind_speed_cyclist_mps=w_cyclist,
            dominant_wind_dir_deg=w_dir,
            weather_provider="Standard Atmosphere (ISA)",
            is_fallback=True,
            fallback_reason=reason,
        )

        return weather_points, summary

    async def get_weather_for_track(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
        target_timestamps: List[datetime],
        avg_elevation_m: float = 150.0,
        temp_c_hint: Optional[float] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[List[WeatherPoint], WeatherSummary]:
        """
        Fetch weather for track with multi-tier provider failover and automatic caching:
        1. Open-Meteo (Primary: ERA5 reanalysis or forecast)
        2. Bright Sky (Secondary: DWD / SYNOP meteorological station network)
        3. MET Norway (Tertiary: Norwegian Met Institute global operational forecast)
        4. ISA Standard Atmosphere (Safety net: barometric formula + on-board sensor temp)

        Guarantees that rate limits or external outages will NEVER crash the application.
        """
        cache_key = (round(lat, 2), round(lon, 2), start_date, end_date)
        if cache_key in _WEATHER_CACHE:
            cached = _WEATHER_CACHE[cache_key]
            logger.info(f"Weather cache hit for {cache_key} (provider: {cached.get('_provider', 'Open-Meteo')})")
            try:
                return self.interpolate_to_timestamps(
                    cached,
                    target_timestamps,
                    weather_provider=cached.get("_provider", "Open-Meteo"),
                )
            except Exception as e:
                logger.warning(f"Failed to interpolate from cache: {e}")

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=15.0)
            should_close = True

        fail_reasons = []

        try:
            # 1. Primary: Open-Meteo
            try:
                raw_open_meteo = await self.fetch_weather_raw(
                    lat=lat,
                    lon=lon,
                    start_date=start_date,
                    end_date=end_date,
                    client=client,
                )
                raw_open_meteo["_provider"] = "Open-Meteo"
                _WEATHER_CACHE[cache_key] = raw_open_meteo
                return self.interpolate_to_timestamps(
                    raw_open_meteo,
                    target_timestamps,
                    weather_provider="Open-Meteo",
                )
            except Exception as e:
                logger.warning(f"Open-Meteo query failed ({e}); switching to fallback provider Bright Sky.")
                fail_reasons.append(f"Open-Meteo: {e}")

            # 2. Secondary: Bright Sky (DWD/SYNOP open station network)
            try:
                bright_data = await self.fetch_brightsky(
                    lat=lat,
                    lon=lon,
                    date_str=start_date,
                    last_date_str=end_date,
                    client=client,
                )
                if bright_data is not None:
                    pts, summary = self.interpolate_to_timestamps(
                        bright_data,
                        target_timestamps,
                        weather_provider="Bright Sky (DWD/SYNOP)",
                    )
                    _WEATHER_CACHE[cache_key] = bright_data
                    logger.info("Successfully retrieved and interpolated real weather from Bright Sky.")
                    return pts, summary
                else:
                    fail_reasons.append("Bright Sky: no observations returned")
            except Exception as e:
                logger.warning(f"Bright Sky fallback failed ({e}); switching to MET Norway.")
                fail_reasons.append(f"Bright Sky: {e}")

            # 3. Tertiary: MET Norway (Norwegian Met Institute)
            try:
                met_data = await self.fetch_met_norway(
                    lat=lat,
                    lon=lon,
                    client=client,
                )
                if met_data is not None:
                    pts, summary = self.interpolate_to_timestamps(
                        met_data,
                        target_timestamps,
                        weather_provider="MET Norway",
                    )
                    _WEATHER_CACHE[cache_key] = met_data
                    logger.info("Successfully retrieved and interpolated weather from MET Norway.")
                    return pts, summary
                else:
                    fail_reasons.append("MET Norway: no forecast data returned")
            except Exception as e:
                logger.warning(f"MET Norway fallback failed ({e}); engaging ISA model.")
                fail_reasons.append(f"MET Norway: {e}")

        finally:
            if should_close:
                await client.aclose()

        # 4. Final Safety Net: International Standard Atmosphere (ISA)
        joined_reasons = "; ".join(fail_reasons)
        logger.warning(f"All weather providers failed ({joined_reasons}); using ISA standard atmosphere.")
        return self.generate_fallback_weather(
            target_timestamps=target_timestamps,
            avg_elevation_m=avg_elevation_m,
            temp_c_override=temp_c_hint,
            reason=f"Zewnętrzne serwisy pogodowe były niedostępne ({joined_reasons})",
        )
