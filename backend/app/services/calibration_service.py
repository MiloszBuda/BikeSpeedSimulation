"""Multi-activity parameter auto-calibration service (CdA, Crr, drivetrain efficiency eta).

Energy-window regularized least squares + leave-one-out cross-validation across
multiple cycling activities.

Per-window energy balance (cos(theta) ~ 1):
    m*g*dh + 0.5*m*d(v^2) = eta*Wp - CdA*A_aero - Crr*A_rr
with  Wp = int P dt,  A_aero = int 0.5*rho*v_app*v_head*v dt,  A_rr = m*g*int v dt.
The balance is linear in (eta, CdA, Crr).

What changed compared to the first version (see comments at each spot):
  * priors are now weighted correctly (relative parametrization u = x / prior and
    prior rows with weight 1/sigma_rel). Before, the weight was proportional to the
    relative sigma (inverted) and worth ~0.0004-0.13 of a window, i.e. the priors did
    nothing and only the bounds stopped CdA/Crr/eta from running away;
  * windows are weighted by their expected error in joules (mostly the wind error in
    the aero integral), with a Huber IRLS pass against outlier windows;
  * the braking mask is computed in the time domain (the old call fed 1 Hz data to a
    function that expects a 5 m distance grid, so accelerations were wrong by v/5);
  * eta is no longer switched off by hand-tuned climb thresholds; it has a tight prior
    and "fixed" simply means the data added (almost) no information about it;
  * reported sigmas are max(posterior, leave-one-ACTIVITY-out jackknife) and an
    identifiability report (shrinkage vs. prior, CdA-Crr correlation, scaled
    condition number) is written to `diagnostics`.
"""

import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from scipy.optimize import lsq_linear

from app.config import settings
from app.schemas.calibration import (
    ActivityCalibrationMeta,
    CalibrationRequest,
    CalibrationResponse,
    EnergyWindow,
)
from app.schemas.fit import EnrichedPoint, TrackPoint
from app.services.elevation_service import ElevationService
from app.services.physics_solver import PhysicsSolver
from app.services.simulation_engine import SimulationEngine

logger = logging.getLogger(__name__)


def _cfg(name: str, default: Any) -> Any:
    return getattr(settings, name, default)


# --- tunables (all overridable from settings) ---------------------------------
# Relative 1-sigma of the priors: eta (power-meter gain x transmission), CdA, Crr.
PRIOR_SIGMA_REL = tuple(_cfg("CALIBRATION_PRIOR_SIGMA_REL", (0.012, 0.15, 0.20)))
# Error of the wind at cyclist height taken from hourly 10 m reanalysis (m/s),
# plus a part that grows with the wind itself.
WIND_SIGMA_MPS = float(_cfg("CALIBRATION_WIND_SIGMA_MPS", 1.5))
WIND_SIGMA_REL = float(_cfg("CALIBRATION_WIND_SIGMA_REL", 0.25))
ELEV_SIGMA_M = float(_cfg("CALIBRATION_ELEV_SIGMA_M", 1.0))
SPEED_SIGMA_MPS = float(_cfg("CALIBRATION_SPEED_SIGMA_MPS", 0.08))
MODEL_REL_SIGMA = float(_cfg("CALIBRATION_MODEL_REL_SIGMA", 0.01))
# Windows overlap by 50 %, so M windows carry ~M/2 independent pieces of information.
OVERLAP_VAR_INFLATION = 2.0
# Braking mask (time domain)
BRAKE_DEADBAND_N = 15.0
# The mask must not depend on the parameters we are estimating. It uses UPPER-bound resistance
# (CdA/Crr) and a LOWER-bound eta, so a window is only flagged when the rider decelerated harder
# than even a very draggy bike would coast - i.e. real braking, not model mismatch.
BRAKE_MASK_CDA = float(_cfg("CALIBRATION_BRAKE_MASK_CDA", 0.50))
BRAKE_MASK_CRR = float(_cfg("CALIBRATION_BRAKE_MASK_CRR", 0.008))
BRAKE_MASK_ETA = float(_cfg("CALIBRATION_BRAKE_MASK_ETA", 0.93))
BRAKE_ENERGY_FRAC_MAX = 0.01
BRAKE_PEAK_N = 80.0
# Identifiability: shrinkage = posterior variance / prior variance
WEAK_INFO_SHRINKAGE = 0.70


def _moving_average(x: np.ndarray, w: int) -> np.ndarray:
    if w <= 1 or len(x) < w:
        return x.copy()
    pad = w // 2
    xp = np.pad(x, (pad, w - 1 - pad), mode="edge")
    return np.convolve(xp, np.ones(w) / w, mode="valid")


def _trapz(y: np.ndarray, dx: float = 1.0) -> float:
    fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
    return float(fn(y, dx=dx))


class CalibrationService:
    """Estimates aerodynamic drag area (CdA), rolling resistance (Crr) and the
    effective mechanical efficiency (eta) over 5-15 minute energy windows across
    1..N outdoor cycling activities."""

    # ------------------------------------------------------------------ windows
    @staticmethod
    def _braking_force_time_domain(
        v: np.ndarray,
        p: np.ndarray,
        slope: np.ndarray,
        rho: np.ndarray,
        v_app: np.ndarray,
        v_head: np.ndarray,
        mass_kg: float,
    ) -> np.ndarray:
        """Held-back (braking) force in N from a 1 Hz time series.

        m*a = F_pedal - F_aero - F_rr - m*g*s - F_brake  =>  F_brake = rest, >= 0.
        The old implementation called SimulationEngine._compute_baseline_braking_force
        with dx=5.0 on 1 Hz data; that function derives dt = dx / v, so dt was 5/v
        instead of 1 s and every acceleration came out too large by v/5.
        """
        g = settings.GRAVITY
        v_s = _moving_average(v, 5)
        a = np.gradient(v_s)  # dt = 1 s
        f_pedal = np.minimum(np.maximum(p, 0.0) * BRAKE_MASK_ETA / np.maximum(v_s, 1.5), 800.0)
        f_aero = 0.5 * rho * BRAKE_MASK_CDA * v_app * v_head
        f_rr = mass_kg * g * BRAKE_MASK_CRR
        f_g = mass_kg * g * slope
        f_brake = f_pedal - f_aero - f_rr - f_g - mass_kg * a
        return _moving_average(np.maximum(f_brake, 0.0), 5)

    @staticmethod
    def _extract_windows(
        points: List[EnrichedPoint],
        activity_id: str,
        mass_kg: float,
        window_duration_s: int = 300,
        min_speed_mps: float = 3.0,
        min_power_w: float = 25.0,
    ) -> Tuple[List[Tuple[EnergyWindow, float]], Dict[str, int]]:
        """Returns ([(window, sigma_J)], reject_counts). sigma_J is the expected 1-sigma
        error of the window's energy balance in joules."""
        rejects = {"postoje": 0, "brak pedałowania": 0, "hamowanie": 0, "zjazd": 0,
                   "jazda w grupie": 0, "za mała praca": 0}
        if len(points) < window_duration_s:
            return [], rejects

        warmup_skip = min(300, len(points) // 6)  # discard warm-up
        active = points[warmup_skip:]
        if len(active) < window_duration_s:
            return [], rejects

        g = settings.GRAVITY
        v = np.array([q.speed_mps for q in active], dtype=np.float64)
        p = np.array([q.power_w for q in active], dtype=np.float64)
        h_raw = np.array([q.elevation_m for q in active], dtype=np.float64)
        rho = np.array([q.air_density_kg_m3 for q in active], dtype=np.float64)
        v_app = np.array([q.apparent_wind_speed_mps for q in active], dtype=np.float64)
        v_head = np.array([q.speed_mps + q.headwind_comp_mps for q in active], dtype=np.float64)
        dist = np.array([q.distance_m for q in active], dtype=np.float64)
        wind_spd = np.array([q.wind_speed_cyclist_mps for q in active], dtype=np.float64)

        h_smooth = ElevationService.smooth_elevation_savgol(h_raw)
        slope = ElevationService.calculate_slope_from_distance(h_smooth, dist)
        slope = ElevationService.smooth_slope(slope, window_length=11, polyorder=2)
        v_s = _moving_average(v, 5)

        f_brake = CalibrationService._braking_force_time_domain(v, p, slope, rho, v_app, v_head, mass_kg)

        n_pts = len(active)
        step_s = max(150, window_duration_s // 2)  # 50 % overlapping windows
        out: List[Tuple[EnergyWindow, float]] = []

        for s0 in range(0, n_pts - window_duration_s + 1, step_s):
            e0 = s0 + window_duration_s
            v_w, p_w, sl_w = v[s0:e0], p[s0:e0], slope[s0:e0]

            if float(np.mean(v_w >= min_speed_mps)) < 0.80:
                rejects["postoje"] += 1
                continue
            if float(np.mean(p_w >= min_power_w)) < 0.75:
                rejects["brak pedałowania"] += 1
                continue

            work_power = _trapz(p_w)
            fb = f_brake[s0:e0]
            brake_energy = _trapz(np.maximum(fb - BRAKE_DEADBAND_N, 0.0) * v_w)
            if brake_energy > BRAKE_ENERGY_FRAC_MAX * max(work_power, 1.0) or float(np.max(fb)) > BRAKE_PEAK_N:
                rejects["hamowanie"] += 1
                continue

            avg_slope = float(np.mean(sl_w))
            if avg_slope < -0.025:
                rejects["zjazd"] += 1
                continue

            drafting = (v_w > 9.5) & (p_w < 75.0) & (sl_w >= 0.0)
            if float(np.mean(drafting)) > 0.12:
                rejects["jazda w grupie"] += 1
                continue

            rho_w, vapp_w, vhead_w = rho[s0:e0], v_app[s0:e0], v_head[s0:e0]
            aero_integral = _trapz(0.5 * rho_w * vapp_w * vhead_w * v_w)
            rr_integral = _trapz(mass_kg * g * v_w)
            if work_power <= 1000.0 or aero_integral <= 1000.0 or rr_integral <= 1000.0:
                rejects["za mała praca"] += 1
                continue

            delta_h = float(h_smooth[e0 - 1] - h_smooth[s0])
            delta_v2 = float(v_s[e0 - 1] ** 2 - v_s[s0] ** 2)  # 5 s averaged end points
            v_mean = float(np.mean(v_w))

            # Expected 1-sigma error of the balance in joules.
            #  wind: dA1/dw ~ int rho*|v_head|*v dt, fully correlated inside a window
            sig_w = math.sqrt(WIND_SIGMA_MPS ** 2 + (WIND_SIGMA_REL * float(np.mean(wind_spd[s0:e0]))) ** 2)
            dA1_dw = _trapz(rho_w * np.abs(vhead_w) * v_w)
            sig_wind = settings.DEFAULT_CDA * dA1_dw * sig_w
            sig_elev = mass_kg * g * ELEV_SIGMA_M * math.sqrt(2.0)
            sig_kin = mass_kg * v_mean * SPEED_SIGMA_MPS * math.sqrt(2.0)
            sig_model = MODEL_REL_SIGMA * work_power
            sigma = math.sqrt(sig_wind ** 2 + sig_elev ** 2 + sig_kin ** 2 + sig_model ** 2)

            out.append((
                EnergyWindow(
                    activity_id=activity_id,
                    start_s=active[s0].time_offset_s,
                    end_s=active[e0 - 1].time_offset_s,
                    duration_s=float(window_duration_s),
                    delta_h_m=delta_h,
                    delta_v2_mps2=delta_v2,
                    work_power_j=work_power,
                    aero_integral=aero_integral,
                    rr_integral=rr_integral,
                    avg_speed_kmh=v_mean * 3.6,
                    avg_power_w=float(np.mean(p_w)),
                    avg_slope_pct=avg_slope * 100.0,
                ),
                sigma,
            ))
        return out, rejects

    @staticmethod
    def extract_activity_windows(
        points: List[EnrichedPoint],
        activity_id: str,
        mass_kg: float,
        window_duration_s: int = 300,
        min_speed_mps: float = 3.0,
        min_power_w: float = 25.0,
    ) -> List[EnergyWindow]:
        """Clean, non-braking, moving energy-balance windows (public API unchanged)."""
        wins, _ = CalibrationService._extract_windows(
            points, activity_id, mass_kg, window_duration_s, min_speed_mps, min_power_w
        )
        return [w for w, _ in wins]

    # ------------------------------------------------------------------- solver
    @staticmethod
    def _fallback_sigma(windows: Sequence[EnergyWindow], mass_kg: float, prior_cda: float) -> np.ndarray:
        """Window error in joules when only the EnergyWindow fields are known."""
        g = settings.GRAVITY
        sig = []
        for w in windows:
            v_avg = max(1.0, w.avg_speed_kmh / 3.6)
            sig_wind = prior_cda * 2.0 * w.aero_integral / v_avg * WIND_SIGMA_MPS
            sig_elev = mass_kg * g * ELEV_SIGMA_M * math.sqrt(2.0)
            sig_kin = mass_kg * v_avg * SPEED_SIGMA_MPS * math.sqrt(2.0)
            sig_model = MODEL_REL_SIGMA * w.work_power_j
            sig.append(math.sqrt(sig_wind ** 2 + sig_elev ** 2 + sig_kin ** 2 + sig_model ** 2))
        return np.array(sig, dtype=np.float64)

    @staticmethod
    def _solve_core(
        windows: Sequence[EnergyWindow],
        mass_kg: float,
        prior_eta: float,
        prior_cda: float,
        prior_crr: float,
        fixed_eta: Optional[float] = None,
        sigma_j: Optional[Sequence[float]] = None,
    ) -> Dict[str, Any]:
        M = len(windows)
        if M < int(_cfg("MIN_CALIBRATION_WINDOWS", 6)):
            raise ValueError(
                f"Zbyt mało czystych okien energii ({M} znaleziono, wymagane min. {_cfg('MIN_CALIBRATION_WINDOWS', 6)}). "
                "Wybierz dłuższą aktywność z powermeterem i mniejszą ilością postojów."
            )
        g = settings.GRAVITY
        y = np.array([mass_kg * g * w.delta_h_m + 0.5 * mass_kg * w.delta_v2_mps2 for w in windows])
        A = np.column_stack([
            [w.work_power_j for w in windows],
            [-w.aero_integral for w in windows],
            [-w.rr_integral for w in windows],
        ]).astype(np.float64)

        prior_x = np.array([prior_eta, prior_cda, prior_crr], dtype=np.float64)
        sig_rel = np.array(PRIOR_SIGMA_REL, dtype=np.float64)
        sigma = (np.asarray(sigma_j, dtype=np.float64) if sigma_j is not None
                 else CalibrationService._fallback_sigma(windows, mass_kg, prior_cda))
        sigma = np.maximum(sigma, 1.0)

        # Relative parametrization: x = prior * u, prior of u is 1 +- sig_rel.
        B = A * prior_x
        free = np.array([True, True, True])
        u_fixed = np.ones(3)
        if fixed_eta is not None:
            free[0] = False
            u_fixed[0] = float(fixed_eta) / prior_eta
        y_eff = y - B[:, ~free] @ u_fixed[~free]
        Bf = B[:, free]
        sig_rel_f = sig_rel[free]
        lb = (np.array([_cfg("CALIBRATION_ETA_BOUNDS", (0.93, 1.0))[0],
                        _cfg("CALIBRATION_CDA_BOUNDS", (0.15, 0.60))[0],
                        _cfg("CALIBRATION_CRR_BOUNDS", (0.002, 0.015))[0]]) / prior_x)[free]
        ub = (np.array([_cfg("CALIBRATION_ETA_BOUNDS", (0.93, 1.0))[1],
                        _cfg("CALIBRATION_CDA_BOUNDS", (0.15, 0.60))[1],
                        _cfg("CALIBRATION_CRR_BOUNDS", (0.002, 0.015))[1]]) / prior_x)[free]
        k_free = int(free.sum())

        w_rob = np.ones(M)
        infl = 1.0
        u = np.ones(k_free)
        for _ in range(4):  # IRLS: Huber weights + error-scale inflation
            rowW = np.sqrt(w_rob) / (sigma * infl)
            Ba = np.vstack([Bf * rowW[:, None], np.diag(1.0 / sig_rel_f)])
            ya = np.concatenate([y_eff * rowW, 1.0 / sig_rel_f])
            u = lsq_linear(Ba, ya, bounds=(lb, ub)).x
            r = (y_eff - Bf @ u) / sigma
            chi2_red = float(np.sum(w_rob * r ** 2)) / max(1.0, M / 2.0 - k_free)  # M/2: overlap
            infl = max(1.0, math.sqrt(chi2_red))
            z = np.abs(r) / infl
            w_rob = np.where(z <= 1.5, 1.0, 1.5 / np.maximum(z, 1e-9))

        rowW = np.sqrt(w_rob) / (sigma * infl)
        info = (Bf * rowW[:, None]).T @ (Bf * rowW[:, None])
        prec_prior = np.diag(1.0 / sig_rel_f ** 2)
        cov_u = np.linalg.inv(info + prec_prior)               # posterior (all windows independent)
        shrink = np.diag(cov_u) / sig_rel_f ** 2                # 1 = data told us nothing
        cov_u_rep = np.linalg.inv(info / OVERLAP_VAR_INFLATION + prec_prior)  # overlap-aware

        x = prior_x.copy()
        x[free] = u * prior_x[free]
        if fixed_eta is not None:
            x[0] = float(fixed_eta)
        sd = np.zeros(3)
        sd[free] = np.sqrt(np.maximum(np.diag(cov_u_rep), 1e-18)) * prior_x[free]
        shrink_full = np.zeros(3)
        shrink_full[free] = shrink

        corr = None
        if free[1] and free[2]:
            idx = np.cumsum(free) - 1
            i, j = idx[1], idx[2]
            corr = float(cov_u_rep[i, j] / math.sqrt(cov_u_rep[i, i] * cov_u_rep[j, j]))

        Bn = Bf * rowW[:, None]
        Bn = Bn / np.maximum(np.linalg.norm(Bn, axis=0), 1e-12)
        cond_scaled = float(np.linalg.cond(Bn))

        return dict(x=x, sd=sd, shrink=shrink_full, corr=corr, cond=cond_scaled,
                    chi2_red=infl ** 2, n_robust_down=int(np.sum(w_rob < 0.5)), free=free,
                    fixed_eta=fixed_eta is not None)

    @staticmethod
    def solve_parameters(
        windows: List[EnergyWindow],
        mass_kg: float,
        prior_eta: float = 0.97,
        prior_cda: float = 0.34,
        prior_crr: float = 0.0042,
        fixed_eta: Optional[float] = None,
        sigma_j: Optional[Sequence[float]] = None,
    ) -> Tuple[float, float, float, float, float, float, float, bool, Optional[str]]:
        """Returns: (cda, crr, eta, cda_std, crr_std, eta_std, condition_number, eta_fixed, eta_reason)
        (same tuple as before)."""
        core = CalibrationService._solve_core(
            windows, mass_kg, prior_eta, prior_cda, prior_crr, fixed_eta, sigma_j
        )
        x, sd = core["x"], core["sd"]
        eta_fixed, eta_reason = False, None
        if core["fixed_eta"]:
            eta_fixed = True
            eta_reason = f"Wymuszono η={x[0]:.3f} na życzenie użytkownika"
            eta_std = 0.005
        else:
            eta_std = float(sd[0])
            if core["shrink"][0] > WEAK_INFO_SHRINKAGE:
                eta_fixed = True
                eta_reason = (
                    f"Dane nie niosą informacji o η (za mało zmienności wysokości; η jest też nierozróżnialne od "
                    f"wzmocnienia powermetra) - wynik ≈ prior η={prior_eta:.3f} ±{prior_eta * PRIOR_SIGMA_REL[0]:.3f}"
                )
        return (float(x[1]), float(x[2]), float(x[0]), float(sd[1]), float(sd[2]), eta_std,
                core["cond"], eta_fixed, eta_reason)

    @staticmethod
    def jackknife_spread(
        activity_windows_dict: Dict[str, List[EnergyWindow]],
        activity_sigma_dict: Dict[str, List[float]],
        mass_kg: float,
        prior_eta: float,
        prior_cda: float,
        prior_crr: float,
        fixed_eta: Optional[float],
    ) -> Optional[np.ndarray]:
        """Leave-one-ACTIVITY-out spread of (eta, CdA, Crr). Wind errors are shared inside a
        ride, so the number of independent pieces of information is the number of rides,
        not the number of windows."""
        ids = [a for a, w in activity_windows_dict.items() if w]
        if len(ids) < 3:
            return None
        fits = []
        for hold in ids:
            wins, sig = [], []
            for a in ids:
                if a != hold:
                    wins.extend(activity_windows_dict[a])
                    sig.extend(activity_sigma_dict.get(a, []))
            if len(wins) < int(_cfg("MIN_CALIBRATION_WINDOWS", 6)):
                continue
            try:
                core = CalibrationService._solve_core(
                    wins, mass_kg, prior_eta, prior_cda, prior_crr, fixed_eta,
                    sig if len(sig) == len(wins) else None,
                )
                fits.append(core["x"])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Jackknife fit failed for {hold}: {e}")
        if len(fits) < 3:
            return None
        F = np.array(fits)
        n = len(F)
        return np.sqrt((n - 1) / n * np.sum((F - F.mean(axis=0)) ** 2, axis=0))

    # ------------------------------------------------------------ validation
    @staticmethod
    def validate_leave_one_out(
        activity_points_dict: Dict[str, List[EnrichedPoint]],
        activity_windows_dict: Dict[str, List[EnergyWindow]],
        mass_kg: float,
        prior_eta: float = 0.97,
        prior_cda: float = 0.32,
        prior_crr: float = 0.004,
        fixed_eta: Optional[float] = None,
        activity_sigma_dict: Optional[Dict[str, List[float]]] = None,
    ) -> Tuple[Optional[float], Optional[float], Dict[str, Tuple[float, float, float]]]:
        """Calibrate on N-1 activities, simulate the held-out one with the Heun engine and
        compare speed RMSE / total time. Note: this validates the *total* resistance at the
        ride's speeds; a wrong CdA/Crr split can still pass it (see jackknife for that)."""
        act_ids = list(activity_windows_dict.keys())
        if len(act_ids) < 2:
            return None, None, {}

        per_activity: Dict[str, Tuple[float, float, float]] = {}
        all_rmses, all_time_pcts = [], []
        for holdout_id in act_ids:
            train_w: List[EnergyWindow] = []
            train_s: List[float] = []
            for other in act_ids:
                if other != holdout_id:
                    train_w.extend(activity_windows_dict[other])
                    if activity_sigma_dict:
                        train_s.extend(activity_sigma_dict.get(other, []))
            if len(train_w) < int(_cfg("MIN_CALIBRATION_WINDOWS", 6)):
                continue
            try:
                core = CalibrationService._solve_core(
                    train_w, mass_kg, prior_eta, prior_cda, prior_crr, fixed_eta,
                    train_s if len(train_s) == len(train_w) else None,
                )
                eta_l, cda_l, crr_l = float(core["x"][0]), float(core["x"][1]), float(core["x"][2])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"LOO solve failed for holdout {holdout_id}: {e}")
                continue

            pts = activity_points_dict.get(holdout_id)
            if not pts or len(pts) < 60:
                continue
            try:
                rmse, terr_s, terr_pct = CalibrationService._evaluate_activity_simulation(
                    points=pts, cda=cda_l, crr=crr_l, eta=eta_l, mass_kg=mass_kg
                )
                per_activity[holdout_id] = (rmse, terr_s, terr_pct)
                all_rmses.append(rmse)
                all_time_pcts.append(terr_pct)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"LOO simulation failed for holdout {holdout_id}: {e}")

        mean_rmse = float(np.mean(all_rmses)) if all_rmses else None
        mean_time_pct = float(np.mean(all_time_pcts)) if all_time_pcts else None
        return mean_rmse, mean_time_pct, per_activity

    @staticmethod
    def _evaluate_activity_simulation(
        points: List[EnrichedPoint],
        cda: float,
        crr: float,
        eta: float,
        mass_kg: float,
    ) -> Tuple[float, float, float]:
        """Simulate an activity with the Heun physics engine and compare speed RMSE & total duration."""
        dx = 5.0
        total_dist = points[-1].distance_m
        if total_dist <= dx * 2:
            raise ValueError("Distance too short for simulation")

        x_grid = np.arange(0.0, total_dist + dx / 2.0, dx, dtype=np.float64)
        src_dist = np.array([p.distance_m for p in points], dtype=np.float64)
        unique_mask = np.concatenate(([True], np.diff(src_dist) > 1e-4))
        src_dist = src_dist[unique_mask]
        clean_pts = [p for i, p in enumerate(points) if unique_mask[i]]

        def col(attr: str) -> np.ndarray:
            return np.array([getattr(p, attr) for p in clean_pts], dtype=np.float64)

        x_speed_base = np.interp(x_grid, src_dist, col("speed_mps"))
        x_power = np.interp(x_grid, src_dist, col("power_w"))
        x_elev_raw = np.interp(x_grid, src_dist, col("elevation_m"))
        x_w_spd = np.interp(x_grid, src_dist, col("wind_speed_cyclist_mps"))
        x_rho = np.interp(x_grid, src_dist, col("air_density_kg_m3"))

        rb = np.radians(col("bearing_deg"))
        x_bearing = (np.degrees(np.arctan2(np.interp(x_grid, src_dist, np.sin(rb)),
                                           np.interp(x_grid, src_dist, np.cos(rb)))) + 360.0) % 360.0
        rw = np.radians(col("wind_direction_deg"))
        x_wind_dir = (np.degrees(np.arctan2(np.interp(x_grid, src_dist, np.sin(rw)),
                                            np.interp(x_grid, src_dist, np.cos(rw)))) + 360.0) % 360.0

        x_elev = ElevationService.smooth_elevation_savgol(x_elev_raw)
        x_slope = ElevationService.calculate_slope_from_distance(x_elev, x_grid)
        x_slope = ElevationService.smooth_slope(x_slope, window_length=11, polyorder=2)

        v_base_clean = np.maximum(x_speed_base, 0.5)
        v_base_seg = 0.5 * (v_base_clean[:-1] + v_base_clean[1:])
        dt_base = dx / np.maximum(v_base_seg, 0.5)
        t_base_cum = np.concatenate(([0.0], np.cumsum(dt_base)))
        total_base_time = float(t_base_cum[-1])

        x_power_eff = PhysicsSolver.smooth_power_response(power=x_power, time_s=t_base_cum, tau_up=1.2, tau_down=2.2)
        x_power_eff[x_speed_base < 0.5] = 0.0

        f_brake_base = SimulationEngine._compute_baseline_braking_force(
            v_base=v_base_clean, p_base=x_power, s=x_slope, bearing_deg=x_bearing,
            wind_speed=x_w_spd, wind_dir_deg=x_wind_dir, dx=dx, m=mass_kg, cda=cda, crr=crr,
            rho=x_rho, eta=eta, g=settings.GRAVITY,
        )

        v_sim = PhysicsSolver.simulate_speed_arbitrary_wind(
            P=x_power_eff, s=x_slope, bearing_deg=x_bearing, wind_speed=x_w_spd, wind_dir_deg=x_wind_dir,
            m=mass_kg, CdA=cda, Crr=crr, rho=x_rho, eta=eta, g=settings.GRAVITY,
            initial_speed=float(v_base_clean[0]), distance_step_m=dx, substeps=4, max_speed_mps=30.0,
            f_brake_base=f_brake_base,
        )

        v_sim_clean = np.maximum(v_sim, 0.5)
        v_sim_seg = 0.5 * (v_sim_clean[:-1] + v_sim_clean[1:])
        total_sim_time = float(np.sum(dx / np.maximum(v_sim_seg, 0.5)))

        clean_mask = (v_base_clean > 3.0) & (f_brake_base < 10.0)
        sel = clean_mask if np.any(clean_mask) else np.ones_like(clean_mask, dtype=bool)
        rmse_kmh = float(np.sqrt(np.mean((v_sim_clean[sel] - v_base_clean[sel]) ** 2)) * 3.6)

        time_err_s = total_sim_time - total_base_time
        time_err_pct = float(abs(time_err_s) / max(1.0, total_base_time) * 100.0)
        return rmse_kmh, time_err_s, time_err_pct

    # ------------------------------------------------------------ entry point
    @staticmethod
    def run_multi_activity_calibration(
        activities: List[Tuple[str, Optional[str], Optional[str], List[EnrichedPoint]]],
        request: CalibrationRequest,
    ) -> CalibrationResponse:
        """activities: list of (activity_id, name, date, enriched_points)"""
        if not activities:
            raise ValueError("Brak aktywności do kalibracji.")

        all_windows: List[EnergyWindow] = []
        all_sigmas: List[float] = []
        act_windows: Dict[str, List[EnergyWindow]] = {}
        act_sigmas: Dict[str, List[float]] = {}
        act_points: Dict[str, List[EnrichedPoint]] = {}
        meta_list: List[ActivityCalibrationMeta] = []
        diagnostics: List[str] = []

        for act_id, name, date_str, pts in activities:
            if len(pts) < 60:
                continue
            act_points[act_id] = pts
            wins_sig, rejects = CalibrationService._extract_windows(
                pts, act_id, request.mass_kg, request.window_duration_s
            )
            wins = [w for w, _ in wins_sig]
            sigs = [s for _, s in wins_sig]
            act_windows[act_id], act_sigmas[act_id] = wins, sigs
            all_windows.extend(wins)
            all_sigmas.extend(sigs)

            label = name or f"Aktywność {act_id}"
            if len(wins) < 3:
                why = ", ".join(f"{k}: {v}" for k, v in rejects.items() if v) or "za krótka aktywność"
                diagnostics.append(f"{label}: tylko {len(wins)} czystych okien (odrzucone - {why}).")

            meta_list.append(ActivityCalibrationMeta(
                activity_id=act_id, name=label, date=date_str,
                distance_km=round(float(pts[-1].distance_m / 1000.0), 2),
                duration_min=round(float(pts[-1].time_offset_s / 60.0), 1),
                avg_power_w=round(float(np.mean([p.power_w for p in pts])), 1),
                avg_speed_kmh=round(float(np.mean([p.speed_mps for p in pts]) * 3.6), 1),
                windows_count=len(wins),
            ))

        min_w = int(_cfg("MIN_CALIBRATION_WINDOWS", 6))
        if len(all_windows) < min_w:
            raise ValueError(
                f"Wyodrębniono tylko {len(all_windows)} czystych okien energii z {len(activities)} aktywności "
                f"(wymagane min. {min_w}). Upewnij się, że aktywności mają dane z miernika mocy (power > 0) "
                "i nie składają się wyłącznie z postojów."
            )

        used_ids = [a for a, w in act_windows.items() if w]
        n_used = len(used_ids)

        core = CalibrationService._solve_core(
            all_windows, request.mass_kg, request.prior_eta, request.prior_cda, request.prior_crr,
            request.fixed_eta, all_sigmas,
        )
        eta_opt, cda_opt, crr_opt = (float(v) for v in core["x"])
        eta_sd, cda_sd, crr_sd = (float(v) for v in core["sd"])
        shrink = core["shrink"]

        eta_fixed, eta_reason = False, None
        if request.fixed_eta is not None:
            eta_fixed, eta_reason, eta_sd = True, f"Wymuszono η={eta_opt:.3f} na życzenie użytkownika", 0.005
        elif shrink[0] > WEAK_INFO_SHRINKAGE:
            eta_fixed = True
            eta_reason = (
                f"Dane nie niosą informacji o η (za mało zmienności wysokości; η jest też nierozróżnialne od "
                f"wzmocnienia powermetra) - wynik ≈ prior η={request.prior_eta:.3f} "
                f"±{request.prior_eta * PRIOR_SIGMA_REL[0]:.3f}"
            )
            diagnostics.append(eta_reason)

        # Uncertainty: posterior (overlap-aware) vs leave-one-activity-out jackknife -> take the larger.
        jk = CalibrationService.jackknife_spread(
            act_windows, act_sigmas, request.mass_kg, request.prior_eta, request.prior_cda,
            request.prior_crr, request.fixed_eta,
        )
        if jk is not None:
            if request.fixed_eta is None:
                eta_sd = max(eta_sd, float(jk[0]))
            cda_sd, crr_sd = max(cda_sd, float(jk[1])), max(crr_sd, float(jk[2]))
            diagnostics.append(
                f"Niepewność = max(posterior, jackknife po aktywnościach): rozrzut między jazdami "
                f"CdA ±{jk[1]:.3f}, Crr ±{jk[2]:.4f}."
            )
        else:
            diagnostics.append("Mniej niż 3 aktywności z oknami - brak niezależnej oceny niepewności (tylko posterior).")

        # Identifiability report
        names = ["η", "CdA", "Crr"]
        for i in (1, 2):
            s = float(shrink[i])
            if s > WEAK_INFO_SHRINKAGE:
                diagnostics.append(
                    f"{names[i]}: wynik zdominowany przez prior (dane zawężają niepewność tylko do {s:.0%} priora) - "
                    "za mało zróżnicowania prędkości/wiatru w wybranych jazdach."
                )
            else:
                diagnostics.append(f"{names[i]}: dane zawężają niepewność do {s:.0%} priora.")
        if core["corr"] is not None:
            msg = f"Korelacja CdA-Crr: {core['corr']:+.2f}"
            if abs(core["corr"]) > 0.9:
                msg += " (bardzo silna - rozdział oporu na aero i toczenie jest niepewny, suma jest pewniejsza)"
            diagnostics.append(msg)
        cond = float(core["cond"])
        diagnostics.append(
            f"Uwarunkowanie (macierz znormalizowana): {cond:.1f}" + (" - wysokie." if cond > 30 else " - ok.")
        )
        if core["chi2_red"] > 1.5:
            diagnostics.append(
                f"Reszty są {math.sqrt(core['chi2_red']):.1f}× większe niż zakładany błąd (wiatr/model) - "
                "niepewności zostały proporcjonalnie powiększone."
            )
        if core["n_robust_down"]:
            diagnostics.append(f"{core['n_robust_down']} okien zostało silnie zdławionych jako odstające (Huber).")

        mean_rmse, mean_time_pct, per_act = CalibrationService.validate_leave_one_out(
            activity_points_dict=act_points, activity_windows_dict={a: act_windows[a] for a in used_ids},
            mass_kg=request.mass_kg, prior_eta=request.prior_eta, prior_cda=request.prior_cda,
            prior_crr=request.prior_crr, fixed_eta=request.fixed_eta, activity_sigma_dict=act_sigmas,
        )
        for meta in meta_list:
            if meta.activity_id in per_act:
                rmse_v, terr_s, terr_pct = per_act[meta.activity_id]
                meta.loo_speed_rmse_kmh = round(rmse_v, 2)
                meta.loo_time_error_s = round(terr_s, 1)
                meta.loo_time_error_pct = round(terr_pct, 2)
        if mean_rmse is not None:
            diagnostics.append(
                f"Walidacja krzyżowa LOO: średni błąd prędkości RMSE={mean_rmse:.2f} km/h, błąd czasu={mean_time_pct:.1f}% "
                "(sprawdza łączny opór, nie podział na CdA i Crr)."
            )

        badge = f"auto, n={n_used}, CdA {cda_opt:.3f} ±{cda_sd:.3f}"
        if shrink[1] > WEAK_INFO_SHRINKAGE:
            badge += " (zdominowane przez prior)"

        return CalibrationResponse(
            cda=round(cda_opt, 4), crr=round(crr_opt, 5), eta=round(eta_opt, 4),
            cda_std=round(cda_sd, 4), crr_std=round(crr_sd, 5), eta_std=round(eta_sd, 4),
            mass_kg=request.mass_kg, n_activities=n_used, total_windows=len(all_windows),
            gear_id=request.gear_id, eta_fixed=eta_fixed, eta_reason=eta_reason,
            condition_number=round(cond, 1),
            validation_mean_rmse_kmh=round(mean_rmse, 2) if mean_rmse is not None else None,
            validation_mean_time_error_pct=round(mean_time_pct, 2) if mean_time_pct is not None else None,
            activities=meta_list, diagnostics=diagnostics, badge_text=badge,
        )