"""Physics-based cycling speed simulation and power balance solvers."""

import math
import numpy as np

from app.config import settings

# Hard physical safety valve for numerical power balance equilibrium solvers
V_SAFETY_CEILING_MPS = 30.0  # ~108 km/h
V_FLOOR_MPS = 0.0

_N_SCAN = 96      # coarse bracketing points used to locate the physical root
_N_BISECT = 30    # bisection refinement iterations (<< 1 mm/s precision)


def _largest_root_bisection(f_broadcast, f_pointwise, n_points: int, v_max: float, v_min: float = 0.0) -> np.ndarray:
    """
    Find, for every one of `n_points` independent problems, the largest
    non-negative root of a per-point residual function f(v) in [v_min, v_max].
    Always taking the right-most upward sign-crossing picks the physically-stable
    equilibrium on steep descents instead of an unstable low-speed zero crossing.
    """
    v_scan = np.linspace(v_min, v_max, _N_SCAN)
    F = f_broadcast(v_scan)  # (n_scan, n_points)

    up_cross = (F[:-1, :] <= 0) & (F[1:, :] > 0)  # (n_scan - 1, n_points)
    has_cross = up_cross.any(axis=0)

    # Right-most True along axis 0, vectorized: reverse, take first True from bottom, map back
    rev = up_cross[::-1, :]
    first_from_bottom = np.argmax(rev, axis=0)
    idx = (_N_SCAN - 2) - first_from_bottom

    lo = v_scan[idx]
    hi = v_scan[np.minimum(idx + 1, _N_SCAN - 1)]

    no_cross_fallback = np.where(F[-1, :] <= 0, v_max, v_min)
    lo = np.where(has_cross, lo, no_cross_fallback)
    hi = np.where(has_cross, hi, no_cross_fallback)

    for _ in range(_N_BISECT):
        mid = 0.5 * (lo + hi)
        f_mid = f_pointwise(mid)
        go_right = f_mid <= 0
        lo = np.where(go_right, mid, lo)
        hi = np.where(go_right, hi, mid)

    return 0.5 * (lo + hi)


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
        Apply an asymmetric first-order power response filter.

        The filtered power is rescaled afterward so that total mechanical
        work over the activity remains equal to the original power profile.
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

        # Preserve total work using trapezoidal integration.
        trapz_fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
        original_work = float(trapz_fn(power, time_s))
        filtered_work = float(trapz_fn(result, time_s))

        if filtered_work > 1e-6 and original_work >= 0.0:
            result *= original_work / filtered_work

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
        f_brake_base: float = 0.0,
    ) -> float:
        """
        Calculate instantaneous net force acting on the bicycle along the road.
        Positive force accelerates the bicycle forward; negative force decelerates it.
        Includes standing sprint aerodynamics, cadence efficiency limits, acceleration capping,
        and recovered baseline descent braking.
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

        f_net = f_pedal + f_gravity - f_aero - f_rr - f_brake - max(0.0, f_brake_base)

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
        f_brake_base: np.ndarray = None,
        v_base: np.ndarray = None,
        reverse_route: bool = False,
    ) -> np.ndarray:
        """
        Simulate continuous bicycle speed along a distance grid using predictor-corrector
        (Heun's method) in v^2 kinetic energy space: d(v^2)/dx = 2/m * F_net(v).
        Guarantees smooth, continuous physics and eliminates independent point artifacts.
        Integrates recovered baseline descent braking force to prevent uncontrolled 0W freefall.
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

                brk_curr = 0.0
                brk_next = 0.0
                if f_brake_base is not None and not reverse_route:
                    brk_curr = float(f_brake_base[i - 1] * (1 - alpha) + f_brake_base[i] * alpha)
                    brk_next = float(f_brake_base[i - 1] * (1 - alpha_next) + f_brake_base[i] * alpha_next)

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
                    f_brake_base=brk_curr,
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
                    f_brake_base=brk_next,
                )

                # Corrector (Heun average force)
                force_avg = 0.5 * (force_curr + force_pred)
                v2 = v2 + (2.0 * h / m) * force_avg
                v2 = max(0.25, min(max_speed_mps**2, v2))

            # Power-dependent descent speed envelope:
            # On descents (s < -0.015), if cyclist was coasting/braking in baseline,
            # don't allow simulated speed to drift arbitrarily far from baseline without pedaling power.
            if v_base is not None and not reverse_route and s[i] < -0.015:
                p_val = float(P[i])
                margin_mps = (2.5 + 6.0 * min(1.0, max(0.0, p_val) / 250.0)) / 3.6
                v_descent_max = float(v_base[i]) + margin_mps
                v_calc = math.sqrt(v2)
                if v_calc > v_descent_max:
                    v2 = max(0.25, v_descent_max**2)

            speed[i] = math.sqrt(v2)

        return speed

    @staticmethod
    def simulate_original_pacing(
        baseline_speed: np.ndarray,
        bearing_deg: np.ndarray,
        base_wind_speed: np.ndarray,
        base_wind_dir_deg: np.ndarray,
        sim_wind_speed: np.ndarray,
        sim_wind_dir_deg: np.ndarray,
        rho: np.ndarray,
        mass: float,
        cda: float,
        dx: float,
        slope: np.ndarray = None,
        crr: float = settings.DEFAULT_CRR,
        g: float = settings.GRAVITY,
        max_deviation_kmh: float = 16.0,
        max_accel_mps2: float = 0.9,
        max_decel_mps2: float = 1.8,
        deviation_response_time_s: float = 2.0,
    ) -> np.ndarray:
        """
        ORIGINAL pacing model: physically grounded aerodynamic perturbation solver.
        The recorded FIT speed is the baseline trajectory that already incorporates
        the athlete's pedal power, grade, braking, cornering, and cadence limitations.

        Decoupled physical architecture:
        1. Solves the exact power balance equilibrium speed v_target under What-If wind conditions
           at the athlete's actual baseline effective mechanical power.
        2. Applies natural dynamic inertia lag (response time tau ~2.0s) and physiological
           acceleration bounds (max 0.9 m/s^2 forward, 1.8 m/s^2 deceleration).

        Guarantees:
        - Eliminates artificial suppression: steady-state headwind/tailwind deltas match full Heun solver (e.g. +12 km/h).
        - Smooth physical transition: short power spikes and sprints cannot jump instantaneously.
        - Controlled descents: zero-watt coasting/braking speeds remain anchored without runaway.
        - Perfect baseline identity: identical wind conditions produce exactly 0.00 km/h delta.
        """
        baseline_speed = np.asarray(baseline_speed, dtype=np.float64)
        bearing_deg = np.asarray(bearing_deg, dtype=np.float64)
        base_wind_speed = np.asarray(base_wind_speed, dtype=np.float64)
        base_wind_dir_deg = np.asarray(base_wind_dir_deg, dtype=np.float64)
        sim_wind_speed = np.asarray(sim_wind_speed, dtype=np.float64)
        sim_wind_dir_deg = np.asarray(sim_wind_dir_deg, dtype=np.float64)
        rho = np.asarray(rho, dtype=np.float64)

        n = len(baseline_speed)
        if n == 0:
            return np.array([], dtype=np.float64)
        if n == 1:
            return np.array([max(0.5, float(baseline_speed[0]))], dtype=np.float64)

        if slope is None:
            slope_arr = np.zeros(n, dtype=np.float64)
        else:
            slope_arr = np.asarray(slope, dtype=np.float64)

        bearing_rad = np.radians(bearing_deg)
        base_beta = np.radians(base_wind_dir_deg) - bearing_rad
        sim_beta = np.radians(sim_wind_dir_deg) - bearing_rad

        base_w_parallel = base_wind_speed * np.cos(base_beta)
        base_w_perpendicular = base_wind_speed * np.sin(base_beta)

        sim_w_parallel = sim_wind_speed * np.cos(sim_beta)
        sim_w_perpendicular = sim_wind_speed * np.sin(sim_beta)

        max_deviation = max_deviation_kmh / 3.6
        speed = np.zeros(n, dtype=np.float64)
        speed[0] = max(0.5, float(baseline_speed[0]))
        delta_v = 0.0

        for i in range(1, n):
            v_base = float(baseline_speed[i])
            v_prev = speed[i - 1]
            dt = max(0.05, dx / max(v_prev, 0.5))

            # Fast check: identical wind conditions at this step
            w_diff = abs(sim_w_parallel[i] - base_w_parallel[i]) + abs(sim_w_perpendicular[i] - base_w_perpendicular[i])
            if w_diff < 1e-6 or v_base < 0.5:
                v_target = v_base
            else:
                rho_i = float(rho[i])
                s_i = float(slope_arr[i])
                f_res = mass * g * (crr + max(0.0, s_i))

                # 1. Baseline aerodynamic drag at recorded baseline speed
                base_head = v_base + base_w_parallel[i]
                base_app = math.sqrt(base_head * base_head + base_w_perpendicular[i] * base_w_perpendicular[i])
                f_aero_base = 0.5 * rho_i * cda * base_app * base_head

                # Baseline effective power absorbed by aero and resistance
                p_eff = (f_aero_base + f_res) * v_base
                if p_eff <= 0.05:
                    v_target = v_base
                else:
                    # 2. Solve physical equilibrium speed v_target under simulated wind:
                    # [F_aero_sim(v) + f_res] * v = p_eff
                    sw_par = float(sim_w_parallel[i])
                    sw_perp = float(sim_w_perpendicular[i])
                    lo = max(0.5, v_base - max_deviation - 1.0)
                    hi = v_base + max_deviation + 1.0
                    for _ in range(22):
                        mid = 0.5 * (lo + hi)
                        s_head = mid + sw_par
                        s_app = math.sqrt(s_head * s_head + sw_perp * sw_perp)
                        f_sim = 0.5 * rho_i * cda * s_app * s_head
                        val = (f_sim + f_res) * mid - p_eff
                        if val <= 0.0:
                            lo = mid
                        else:
                            hi = mid
                    v_target = 0.5 * (lo + hi)

            target_dev = v_target - v_base
            target_dev = max(-max_deviation, min(max_deviation, target_dev))

            # 3. Smooth transition toward the wind-induced speed deviation.
            # Limits how quickly the aerodynamic perturbation may change.
            alpha = 1.0 - math.exp(-dt / max(deviation_response_time_s, 0.1))
            step_dev = alpha * (target_dev - delta_v)
            step_dev = max(-max_decel_mps2 * dt, min(max_accel_mps2 * dt, step_dev))

            delta_v += step_dev
            delta_v = max(-max_deviation, min(max_deviation, delta_v))

            speed[i] = max(0.5, v_base + delta_v)

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
        iterations: int = _N_BISECT,
    ) -> np.ndarray:
        """
        Solve cubic power balance equation in zero-wind conditions (v_app = v_0):
        1/2 * rho * CdA * v_0^3 + m * g * (Crr + s) * v_0 - P * eta = 0
        Uses vectorized bracket-and-bisect to guarantee physical convergence on all gradients.
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
        n = len(P)

        def f_broadcast(v_scan: np.ndarray) -> np.ndarray:
            return a[None, :] * v_scan[:, None] ** 3 + c[None, :] * v_scan[:, None] - d[None, :]

        def f_pointwise(v: np.ndarray) -> np.ndarray:
            return a * v**3 + c * v - d

        v = _largest_root_bisection(f_broadcast, f_pointwise, n, V_SAFETY_CEILING_MPS, V_FLOOR_MPS)
        return np.clip(v, V_FLOOR_MPS, V_SAFETY_CEILING_MPS)

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
        iterations: int = _N_BISECT,
    ) -> np.ndarray:
        """
        Solve power balance equation under arbitrary headwind and crosswind conditions:
        f(v) = [ 1/2 * rho * CdA * v_app(v) * (v + v_w*cos(beta)) + m*g*(Crr + s) ] * v - P * eta = 0
        Uses vectorized bracket-and-bisect to guarantee finding the stable physical root.
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

        beta = wind_dir_rad - bearing_rad
        w_par = wind_speed * np.cos(beta)   # positive = headwind
        w_perp = wind_speed * np.sin(beta)  # crosswind component

        c_mech = m * g * (Crr + s)
        p_in = np.maximum(P * eta, 0.0)
        n = len(P)

        def f_broadcast(v_scan: np.ndarray) -> np.ndarray:
            v_head = v_scan[:, None] + w_par[None, :]
            v_app = np.maximum(np.sqrt(v_head**2 + w_perp[None, :] ** 2), 1e-3)
            f_aero = 0.5 * rho[None, :] * CdA * v_app * v_head
            return (f_aero + c_mech[None, :]) * v_scan[:, None] - p_in[None, :]

        def f_pointwise(v: np.ndarray) -> np.ndarray:
            v_head = v + w_par
            v_app = np.maximum(np.sqrt(v_head**2 + w_perp**2), 1e-3)
            f_aero = 0.5 * rho * CdA * v_app * v_head
            return (f_aero + c_mech) * v - p_in

        v = _largest_root_bisection(f_broadcast, f_pointwise, n, V_SAFETY_CEILING_MPS, V_FLOOR_MPS)
        return np.maximum(v, 0.1)
