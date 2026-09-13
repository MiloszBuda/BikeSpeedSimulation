"""Elevation filtering, barometric drift compensation, and distance-based slope estimation."""

import numpy as np
from scipy.signal import savgol_filter

from app.config import settings


class ElevationService:
    """Service for processing topography, elevation smoothing, and grade calculation."""

    @staticmethod
    def smooth_elevation_savgol(
        elevation_m: np.ndarray,
        window_length: int = 15,
        polyorder: int = 2,
    ) -> np.ndarray:
        """
        Smooth elevation profile using Savitzky-Golay filter to preserve local extrema
        while removing high-frequency noise from barometric/GPS sensors.
        """
        n = len(elevation_m)
        if n <= 3:
            return elevation_m.copy()

        # Window length must be odd and <= array length
        w = min(window_length, n)
        if w % 2 == 0:
            w -= 1
        if w <= polyorder:
            w = polyorder + 1 if (polyorder + 1) % 2 != 0 else polyorder + 2

        if w > n:
            return elevation_m.copy()

        return savgol_filter(elevation_m, window_length=w, polyorder=polyorder)

    @staticmethod
    def compensate_barometric_drift(
        elevation_m: np.ndarray,
        surface_pressure_hpa: np.ndarray,
        temp_c: np.ndarray,
        g: float = settings.GRAVITY,
        r_dry: float = settings.R_DRY_AIR,
    ) -> np.ndarray:
        """
        Compensate barometric altimeter drift caused by weather pressure changes during the ride.
        Uses barometric hypsometric formula:
        delta_h_drift = - (R_dry * T_kelvin / g) * ln(P(t) / P(0))
        """
        if len(elevation_m) == 0 or len(surface_pressure_hpa) == 0:
            return elevation_m.copy()

        p0 = surface_pressure_hpa[0]
        if p0 <= 0:
            return elevation_m.copy()

        p_ratio = np.maximum(surface_pressure_hpa / p0, 1e-5)
        temp_k = temp_c + 273.15

        # Weather pressure drift elevation offset
        delta_h_drift = - (r_dry * temp_k / g) * np.log(p_ratio)

        # True altitude removes the weather-induced pressure shift
        corrected_elevation = elevation_m - delta_h_drift
        return corrected_elevation

    @staticmethod
    def calculate_slope_from_distance(
        elevation_m: np.ndarray,
        distance_m: np.ndarray,
        max_slope: float = 0.25,
    ) -> np.ndarray:
        """
        Calculate ground slope s = dh / dx with respect to cumulative wheel distance x.
        Clips extreme unrealistic slope spikes.
        """
        n = len(elevation_m)
        if n < 2:
            return np.zeros_like(elevation_m)

        dh = np.gradient(elevation_m)
        dx = np.gradient(distance_m)

        # Protect against stationary points / division by zero
        dx = np.where(np.abs(dx) < 0.1, 0.1, dx)
        slope = dh / dx

        # Clip to realistic road cycling slope (-35% to +35%)
        return np.clip(slope, -max_slope, max_slope)

    @staticmethod
    def smooth_slope(
        slope: np.ndarray,
        window_length: int = 11,
        polyorder: int = 2,
    ) -> np.ndarray:
        """
        Smooth slope profile using Savitzky-Golay filter to eliminate high-frequency
        gradient micro-artifacts from discrete sensor noise without flattening real hills.
        """
        n = len(slope)
        if n <= 3:
            return slope.copy()

        w = min(window_length, n)
        if w % 2 == 0:
            w -= 1
        if w <= polyorder:
            return slope.copy()

        return savgol_filter(slope, window_length=w, polyorder=polyorder)

