"""Vectorized Newton-Raphson solvers for bike speed under windless and arbitrary wind conditions."""

import numpy as np

from app.config import settings


class PhysicsSolver:
    """Numerical solver for bike power balance equations."""

    @staticmethod
    def solve_v0_vectorized(
        P: np.ndarray,
        s: np.ndarray,
        m: float = settings.DEFAULT_MASS,
        CdA: float = settings.DEFAULT_CDA,
        Crr: float = settings.DEFAULT_CRR,
        rho: np.ndarray = None,
        eta: float = settings.DEFAULT_ETA,
        g: float = settings.GRAVITY,
        iterations: int = 7,
    ) -> np.ndarray:
        """
        Solve cubic power balance equation in zero-wind conditions (v_app = v_0):
        1/2 * rho * CdA * v_0^3 + m * g * (Crr + s) * v_0 - P * eta = 0
        """
        P = np.asarray(P, dtype=np.float64)
        s = np.asarray(s, dtype=np.float64)

        if rho is None:
            rho = np.full_like(P, settings.DEFAULT_RHO)
        else:
            rho = np.asarray(rho, dtype=np.float64)

        a = 0.5 * rho * CdA
        c = m * g * (Crr + s)
        d = np.maximum(P * eta, 0.0)

        # Initial guess (~30 km/h = 8.33 m/s)
        v = np.full_like(P, 8.0)

        for _ in range(iterations):
            f = a * v**3 + c * v - d
            f_prime = 3.0 * a * v**2 + c
            # Safeguard against zero or near-zero derivative on steep descents
            f_prime = np.where(np.abs(f_prime) < 1e-5, 1e-5, f_prime)
            v -= f / f_prime

        return np.maximum(v, 0.0)

    @staticmethod
    def solve_speed_arbitrary_wind(
        P: np.ndarray,
        s: np.ndarray,
        bearing_deg: np.ndarray,
        wind_speed: np.ndarray,
        wind_dir_deg: np.ndarray,
        m: float = settings.DEFAULT_MASS,
        CdA: float = settings.DEFAULT_CDA,
        Crr: float = settings.DEFAULT_CRR,
        rho: np.ndarray = None,
        eta: float = settings.DEFAULT_ETA,
        g: float = settings.GRAVITY,
        iterations: int = 7,
    ) -> np.ndarray:
        """
        Solve power balance equation under arbitrary headwind and crosswind conditions:
        f(v) = [ 1/2 * rho * CdA * v_app(v) * (v + v_w*cos(beta)) + m*g*(Crr + s) ] * v - P * eta = 0
        """
        P = np.asarray(P, dtype=np.float64)
        s = np.asarray(s, dtype=np.float64)
        bearing_rad = np.radians(np.asarray(bearing_deg, dtype=np.float64))
        wind_dir_rad = np.radians(np.asarray(wind_dir_deg, dtype=np.float64))
        wind_speed = np.asarray(wind_speed, dtype=np.float64)

        if rho is None:
            rho = np.full_like(P, settings.DEFAULT_RHO)
        else:
            rho = np.asarray(rho, dtype=np.float64)

        # Relative wind angle beta
        beta = wind_dir_rad - bearing_rad
        w_par = wind_speed * np.cos(beta)   # positive = headwind
        w_perp = wind_speed * np.sin(beta)  # crosswind component

        c_mech = m * g * (Crr + s)
        p_in = np.maximum(P * eta, 0.0)

        # Initial estimate (8.0 m/s ~ 29 km/h)
        v = np.full_like(P, 8.0)

        for _ in range(iterations):
            v_head = v + w_par
            v_app = np.sqrt(v_head**2 + w_perp**2)
            v_app = np.maximum(v_app, 1e-3)

            # Aerodynamic drag force opposing forward motion
            f_aero = 0.5 * rho * CdA * v_app * v_head
            # Force balance: F_aero + F_mech - P_in / v = 0
            f_val = f_aero + c_mech - (p_in / v)

            # Derivative dF / dv (unconditionally strictly positive for all v > 0)
            d_vapp_dv = v_head / v_app
            d_faero_dv = 0.5 * rho * CdA * (d_vapp_dv * v_head + v_app)
            df_dv = d_faero_dv + (p_in / (v**2))

            df_dv = np.where(np.abs(df_dv) < 1e-5, 1e-5, df_dv)
            v -= f_val / df_dv
            v = np.maximum(v, 0.1)

        return v
