"""Weather data fetching, temporal/spatial interpolation, and atmospheric physics service."""

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np

from app.config import settings
from app.schemas.fit import WeatherPoint, WeatherSummary


class WeatherService:
    """Service to fetch Open-Meteo weather reanalysis and interpolate along ride track."""

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
        Fetch hourly weather variables from Open-Meteo Historical Archive API,
        with fallback to forecast API for very recent dates (within last 5 days).
        """
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
            # First try historical archive API
            res = await client.get(self.archive_url, params=params)
            if res.status_code == 200:
                data = res.json()
                if "hourly" in data and "time" in data["hourly"] and len(data["hourly"]["time"]) > 0:
                    return data

            # Fallback to forecast endpoint with past_days if recent or if archive fails
            fallback_res = await client.get(self.forecast_url, params=params)
            fallback_res.raise_for_status()
            return fallback_res.json()
        finally:
            if should_close:
                await client.aclose()

    def interpolate_to_timestamps(
        self,
        weather_raw: Dict[str, Any],
        target_timestamps: List[datetime],
    ) -> Tuple[List[WeatherPoint], WeatherSummary]:
        """
        Interpolate hourly Open-Meteo weather data to target second-by-second timestamps.
        Uses linear interpolation for continuous variables and trigonometric circular
        interpolation for wind direction (to avoid 0/360 discontinuities).
        """
        hourly = weather_raw.get("hourly", {})
        time_strs = hourly.get("time", [])
        if not time_strs:
            raise ValueError("No hourly time series in weather response.")

        # Parse hourly timestamps into epoch seconds
        hourly_epochs = []
        for t_str in time_strs:
            dt = datetime.fromisoformat(t_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            hourly_epochs.append(dt.timestamp())

        hourly_epochs = np.array(hourly_epochs, dtype=np.float64)

        # Target epochs
        target_epochs = np.array([t.timestamp() for t in target_timestamps], dtype=np.float64)

        # Scalar arrays
        temp_arr = np.array(hourly["temperature_2m"], dtype=np.float64)
        pressure_hpa_arr = np.array(hourly["surface_pressure"], dtype=np.float64)
        wind_speed_arr = np.array(hourly["wind_speed_10m"], dtype=np.float64)
        humidity_arr = (
            np.array(hourly["relative_humidity_2m"], dtype=np.float64)
            if "relative_humidity_2m" in hourly and hourly["relative_humidity_2m"]
            else None
        )

        # Wind direction: decompose into unit vector (cos, sin) in radians
        wind_dir_arr = np.array(hourly["wind_direction_10m"], dtype=np.float64)
        wind_dir_rad = np.radians(wind_dir_arr)
        u_x = np.cos(wind_dir_rad)
        u_y = np.sin(wind_dir_rad)

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

        summary = WeatherSummary(
            avg_temp_c=float(np.mean(interp_temp)),
            avg_pressure_hpa=float(np.mean(interp_pressure_hpa)),
            avg_air_density_kg_m3=float(np.mean(densities)),
            avg_wind_speed_10m_mps=float(np.mean(interp_wind_speed_10m)),
            avg_wind_speed_cyclist_mps=float(np.mean(cyclist_wind_speeds)),
            dominant_wind_dir_deg=float(dom_wind_dir),
        )

        return weather_points, summary
