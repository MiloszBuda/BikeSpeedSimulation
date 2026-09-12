"""Physics-based cycling speed simulation and power balance solvers."""

import math
import numpy as np

from app.config import settings


class PhysicsSolver:
    """Numerical solver for continuous distance-domain cycling simulation and power balance equations."""

    @staticmethod
    def smooth_power_response(
        power: np.ndarray,
        time_s: np.ndarray,
        tau_up: float = 1.2,
        tau_down: float = 2.2,
    ) -> np.ndarray:
        """
        Apply asymmetric first-order power response model to suppress unrealistic instantaneous power spikes.
        Models neuromuscular torque ramp-up (~1.2s) and drivetrain/cadence momentum decay (~2.2s).
        Preserves total physical work (integral of P dt) while eliminating unphysical square-wave force spikes.
        """
        power = np.asarray(power, dtype=np.float64)
        time_s = np.asarray(time_s, dtype=np.float64)
        n = len(power)
        if n == 0:
            return power.copy()

        result = np.zeros_like(power)
        result[0] = max(0.0, float(power[0]))

        for i in range(1, n):
            dt = max(1e-3, float(time_s[i] - time_s[i - 1]))
            tau = tau_up if power[i] > result[i - 1] else tau_down
            alpha = 1.0 - math.exp(-dt / tau)
            result[i] = result[i - 1] + alpha * (power[i] - result[i - 1])

        return result

    @staticmethod
    def _net_force(
        speed: float,
        power: float,
        slope: float,
        wind_parallel: float,
        wind_perpendicular: float,
        mass: float,
        cda: float,
        crr: float,
        rho: float,
        eta: float,
        g: float,
    ) -> float:
        """
        Calculate instantaneous net force acting on the bicycle along the road.
        Positive force accelerates the bicycle forward; negative force decelerates it.
        Includes standing sprint aerodynamics, cadence efficiency limits, and acceleration capping.
        """
        speed = max(speed, 0.5)

        # Out-of-the-saddle sprint aerodynamics:
        # High-power sprints (>400W) involve standing out of the saddle, rocking the bike,
        # and presenting a significantly larger frontal area (+20% to +25% CdA).
        effective_cda = cda
        if power > 400.0:
            sprint_factor = min(0.25, 0.25 * ((power - 400.0) / 450.0))
            effective_cda = cda * (1.0 + sprint_factor)

        # Power converted to mechanical driving force at the wheel
        p_mech = max(power * eta, 0.0)

        # High-speed cadence efficiency drop:
        # At speeds above 52 km/h (14.5 m/s) on flat/tailwind, cyclists spin out their top gear
        # (e.g. 52x11 or 50x11 requires cadence > 115-125 RPM where neuromuscular force drops).
        if speed > 14.5 and slope > -0.02:
            cadence_efficiency = max(0.60, 1.0 - (speed - 14.5) * 0.08)
            p_mech *= cadence_efficiency

        f_pedal = min(p_mech / speed, 750.0)  # Max crank torque / traction limit

        # Downhill gravity component (slope < 0 accelerates forward)
        f_gravity = -mass * g * slope

        # Aerodynamic drag opposing motion
        relative_headwind = speed + wind_parallel
        apparent_wind = math.sqrt(
            relative_headwind * relative_headwind
            + wind_perpendicular * wind_perpendicular
        )
        f_aero = 0.5 * rho * effective_cda * apparent_wind * relative_headwind

        # Rolling resistance opposing motion
        f_rr = mass * g * crr

        # Road descent safety braking:
        # Cyclists control descent speed via braking on steep grades when coasting/low power
        f_brake = 0.0
        if slope < -0.015 and power < 30.0 and speed > 17.0:
            f_brake = (speed - 17.0) * 40.0

        f_net = f_pedal + f_gravity - f_aero - f_rr - f_brake

        # Acceleration cap: road cyclist on a bicycle cannot exceed realistic physiological forward acceleration
        # Higher at low speeds (standing starts ~1.25 m/s^2), lower at high sprint speeds (~0.55-0.75 m/s^2)
        a_max = max(0.55, min(1.25, 32.0 / max(speed, 8.0)))
        if f_net > 0:
            f_net = min(f_net, mass * a_max)

        return f_net

    @staticmethod
    def simulate_speed_arbitrary_wind(
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
        initial_speed: float = 8.0,
        distance_step_m: float = 5.0,
        substeps: int = 4,
        max_speed_mps: float = 30.0,
    ) -> np.ndarray:
        """
        Simulate continuous bicycle speed along a distance grid using predictor-corrector
        (Heun's method) in v^2 kinetic energy space: d(v^2)/dx = 2/m * F_net(v).
        Guarantees smooth, continuous physics and eliminates independent point artifacts.
        """
        P = np.asarray(P, dtype=np.float64)
        s = np.asarray(s, dtype=np.float64)
        bearing_deg = np.asarray(bearing_deg, dtype=np.float64)
        wind_speed = np.asarray(wind_speed, dtype=np.float64)
        wind_dir_deg = np.asarray(wind_dir_deg, dtype=np.float64)

        if rho is None:
            rho = np.full_like(P, settings.DEFAULT_RHO)
        else:
            rho = np.asarray(rho, dtype=np.float64)

        n = len(P)
        if n == 0:
            return np.array([], dtype=np.float64)
        if n == 1:
            return np.array([max(0.5, min(initial_speed, max_speed_mps))])

        bearing_rad = np.radians(bearing_deg)
        wind_dir_rad = np.radians(wind_dir_deg)
        beta = wind_dir_rad - bearing_rad
        wind_parallel = wind_speed * np.cos(beta)
        wind_perpendicular = wind_speed * np.sin(beta)

        speed = np.zeros(n, dtype=np.float64)
        speed[0] = max(0.5, min(initial_speed, max_speed_mps))

        h = distance_step_m / max(1, substeps)

        for i in range(1, n):
            v2 = speed[i - 1] ** 2

            for step_idx in range(substeps):
                alpha = step_idx / substeps
                alpha_next = (step_idx + 1) / substeps

                p_curr = float(P[i - 1] * (1 - alpha) + P[i] * alpha)
                s_curr = float(s[i - 1] * (1 - alpha) + s[i] * alpha)
                w_par_curr = float(wind_parallel[i - 1] * (1 - alpha) + wind_parallel[i] * alpha)
                w_perp_curr = float(wind_perpendicular[i - 1] * (1 - alpha) + wind_perpendicular[i] * alpha)
                rho_curr = float(rho[i - 1] * (1 - alpha) + rho[i] * alpha)

                p_next = float(P[i - 1] * (1 - alpha_next) + P[i] * alpha_next)
                s_next = float(s[i - 1] * (1 - alpha_next) + s[i] * alpha_next)
                w_par_next = float(wind_parallel[i - 1] * (1 - alpha_next) + wind_parallel[i] * alpha_next)
                w_perp_next = float(wind_perpendicular[i - 1] * (1 - alpha_next) + wind_perpendicular[i] * alpha_next)
                rho_next = float(rho[i - 1] * (1 - alpha_next) + rho[i] * alpha_next)

                v_curr = math.sqrt(max(v2, 0.25))

                # Force at current speed
                force_curr = PhysicsSolver._net_force(
                    speed=v_curr,
                    power=p_curr,
                    slope=s_curr,
                    wind_parallel=w_par_curr,
                    wind_perpendicular=w_perp_curr,
                    mass=m,
                    cda=CdA,
                    crr=Crr,
                    rho=rho_curr,
                    eta=eta,
                    g=g,
                )

                # Predictor
                v2_pred = v2 + (2.0 * h / m) * force_curr
                v2_pred = max(0.25, min(max_speed_mps**2, v2_pred))
                v_pred = math.sqrt(v2_pred)

                # Force at predicted speed
                force_pred = PhysicsSolver._net_force(
                    speed=v_pred,
                    power=p_next,
                    slope=s_next,
                    wind_parallel=w_par_next,
                    wind_perpendicular=w_perp_next,
                    mass=m,
                    cda=CdA,
                    crr=Crr,
                    rho=rho_next,
                    eta=eta,
                    g=g,
                )

                # Corrector (Heun average force)
                force_avg = 0.5 * (force_curr + force_pred)
                v2 = v2 + (2.0 * h / m) * force_avg
                v2 = max(0.25, min(max_speed_mps**2, v2))

            speed[i] = math.sqrt(v2)

        return speed

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
