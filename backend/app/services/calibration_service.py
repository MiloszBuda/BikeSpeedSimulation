"""Multi-activity parameter auto-calibration service (CdA, Crr, drivetrain efficiency eta).

Implements constrained regularized energy-window least-squares optimization
and leave-one-out cross-validation across multiple cycling activities.
"""

import logging
import math
from typing import Any, Dict, List, Optional, Tuple
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


class CalibrationService:
    """Estimates aerodynamic drag area (CdA), rolling resistance (Crr),

    and mechanical drivetrain efficiency (eta) using energy conservation balance
    over 5-15 minute moving windows across 1 to N outdoor cycling activities.
    """

    @staticmethod
    def extract_activity_windows(
        points: List[EnrichedPoint],
        activity_id: str,
        mass_kg: float,
        window_duration_s: int = 300,
        min_speed_mps: float = 3.0,
        min_power_w: float = 25.0,
    ) -> List[EnergyWindow]:
        """
        Extract clean, non-braking, moving energy balance windows from an enriched activity.
        Each window computes the work terms and mechanical energy change:
        m*g*Delta_h + 0.5*m*Delta(v^2) = eta*int(P dt) - CdA*int(0.5*rho*v_app*v_head*v dt) - Crr*m*g*int(v dt)
        """
        if len(points) < window_duration_s:
            return []

        # 1. Warm-up exclusion: discard first 300 seconds (5 minutes)
        warmup_skip = min(300, len(points) // 6)
        active_points = points[warmup_skip:]
        if len(active_points) < window_duration_s:
            return []

        # Extract numpy arrays
        v = np.array([p.speed_mps for p in active_points], dtype=np.float64)
        p = np.array([p.power_w for p in active_points], dtype=np.float64)
        h_raw = np.array([p.elevation_m for p in active_points], dtype=np.float64)
        rho = np.array([p.air_density_kg_m3 for p in active_points], dtype=np.float64)
        v_app = np.array([p.apparent_wind_speed_mps for p in active_points], dtype=np.float64)
        v_head = np.array([p.speed_mps + p.headwind_comp_mps for p in active_points], dtype=np.float64)
        dist = np.array([p.distance_m for p in active_points], dtype=np.float64)
        bearing = np.array([p.bearing_deg for p in active_points], dtype=np.float64)
        wind_speed = np.array([p.wind_speed_cyclist_mps for p in active_points], dtype=np.float64)
        wind_dir = np.array([p.wind_direction_deg for p in active_points], dtype=np.float64)

        # Smooth elevation profile and compute gradient
        h_smooth = ElevationService.smooth_elevation_savgol(h_raw)
        slope = ElevationService.calculate_slope_from_distance(h_smooth, dist)
        slope = ElevationService.smooth_slope(slope, window_length=11, polyorder=2)

        # Baseline braking force estimation
        f_brake_base = SimulationEngine._compute_baseline_braking_force(
            v_base=v,
            p_base=p,
            s=slope,
            bearing_deg=bearing,
            wind_speed=wind_speed,
            wind_dir_deg=wind_dir,
            dx=5.0,
            m=mass_kg,
            cda=settings.DEFAULT_CDA,
            crr=settings.DEFAULT_CRR,
            rho=rho,
            eta=settings.DEFAULT_ETA,
            g=settings.GRAVITY,
        )

        n_pts = len(active_points)
        step_s = max(150, window_duration_s // 2)  # 50% overlapping windows
        windows: List[EnergyWindow] = []

        g = settings.GRAVITY

        for start_idx in range(0, n_pts - window_duration_s + 1, step_s):
            end_idx = start_idx + window_duration_s

            v_win = v[start_idx:end_idx]
            p_win = p[start_idx:end_idx]
            slope_win = slope[start_idx:end_idx]
            brake_win = f_brake_base[start_idx:end_idx]

            # 2. Window selection filters:
            # - No extended stops: >= 80% moving above min_speed_mps
            moving_ratio = float(np.mean(v_win >= min_speed_mps))
            if moving_ratio < 0.80:
                continue

            # - Real pedaling: >= 75% above min_power_w
            pedal_ratio = float(np.mean(p_win >= min_power_w))
            if pedal_ratio < 0.75:
                continue

            # - Braking filter: avg braking force < 6.0 N, max braking < 35.0 N
            if float(np.mean(brake_win)) > 6.0 or float(np.max(brake_win)) > 35.0:
                continue

            # - Descent filter: average slope must not be steep downhill
            avg_slope = float(np.mean(slope_win))
            if avg_slope < -0.025:
                continue

            # - Drafting filter: high speed but low power on flat/uphill
            flat_or_up = slope_win >= 0.0
            suspicious_drafting = (v_win > 9.5) & (p_win < 75.0) & flat_or_up
            if float(np.mean(suspicious_drafting)) > 0.12:
                continue

            # 3. Energy balance integrals over 1 Hz window (trapezoidal integration)
            delta_h = float(h_smooth[end_idx - 1] - h_smooth[start_idx])
            delta_v2 = float(v_win[-1] ** 2 - v_win[0] ** 2)

            trapz_fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
            work_power = float(trapz_fn(p_win, dx=1.0))

            # Aero integrand: 0.5 * rho * v_app * v_head * v
            aero_integrand = (
                0.5
                * rho[start_idx:end_idx]
                * v_app[start_idx:end_idx]
                * v_head[start_idx:end_idx]
                * v_win
            )
            aero_integral = float(trapz_fn(aero_integrand, dx=1.0))

            # Rolling resistance integrand: m * g * v
            rr_integrand = mass_kg * g * v_win
            rr_integral = float(trapz_fn(rr_integrand, dx=1.0))

            # Must have positive propulsive work and reasonable aero work
            if work_power <= 1000.0 or aero_integral <= 1000.0 or rr_integral <= 1000.0:
                continue

            windows.append(
                EnergyWindow(
                    activity_id=activity_id,
                    start_s=active_points[start_idx].time_offset_s,
                    end_s=active_points[end_idx - 1].time_offset_s,
                    duration_s=float(window_duration_s),
                    delta_h_m=delta_h,
                    delta_v2_mps2=delta_v2,
                    work_power_j=work_power,
                    aero_integral=aero_integral,
                    rr_integral=rr_integral,
                    avg_speed_kmh=float(np.mean(v_win) * 3.6),
                    avg_power_w=float(np.mean(p_win)),
                    avg_slope_pct=float(avg_slope * 100.0),
                )
            )

        return windows

    @staticmethod
    def solve_parameters(
        windows: List[EnergyWindow],
        mass_kg: float,
        prior_eta: float = 0.97,
        prior_cda: float = 0.32,
        prior_crr: float = 0.004,
        fixed_eta: Optional[float] = None,
    ) -> Tuple[float, float, float, float, float, float, float, bool, Optional[str]]:
        """
        Solve constrained regularized linear least squares for (eta, CdA, Crr).
        Returns: (cda, crr, eta, cda_std, crr_std, eta_std, condition_number, eta_fixed, eta_reason)
        """
        M = len(windows)
        if M < settings.MIN_CALIBRATION_WINDOWS:
            raise ValueError(
                f"Zbyt mało czystych okien energii ({M} znaleziono, wymagane min. {settings.MIN_CALIBRATION_WINDOWS}). "
                "Wybierz dłuższą aktywność z powermeterem i mniejszą ilością postojów."
            )

        g = settings.GRAVITY
        # Mechanical energy delta: m*g*Delta_h + 0.5*m*Delta(v^2)
        y = np.array(
            [mass_kg * g * w.delta_h_m + 0.5 * mass_kg * w.delta_v2_mps2 for w in windows],
            dtype=np.float64,
        )

        A = np.zeros((M, 3), dtype=np.float64)
        for i, w in enumerate(windows):
            A[i, 0] = w.work_power_j  # eta * W_p
            A[i, 1] = -w.aero_integral  # -CdA * int(0.5*rho*v_app*v_head*v)
            A[i, 2] = -w.rr_integral  # -Crr * m*g*int(v)

        # Identifiability check for drivetrain efficiency eta:
        # eta is identifiable primarily from climb gravity work vs power.
        # If total climb variation is tiny (< 35m across windows or std of delta_h < 1.0m),
        # eta is collinear with powermeter gain / flat rolling.
        delta_h_vals = np.array([w.delta_h_m for w in windows])
        climb_variation = float(np.std(delta_h_vals))
        total_abs_climb = float(np.sum(np.abs(delta_h_vals)))

        eta_is_fixed = False
        eta_reason = None
        if fixed_eta is not None:
            eta_is_fixed = True
            eta_val = float(fixed_eta)
            eta_reason = f"Wymuszono eta={eta_val:.3f} na życzenie użytkownika"
        elif climb_variation < 1.2 or total_abs_climb < 35.0:
            eta_is_fixed = True
            eta_val = prior_eta
            eta_reason = "Zbyt mało zróżnicowanych podjazdów do pewnego wyznaczenia sprawności η (użyto domyślnego 0.97)"

        # Physical bounds
        lb = np.array([settings.CALIBRATION_ETA_BOUNDS[0], settings.CALIBRATION_CDA_BOUNDS[0], settings.CALIBRATION_CRR_BOUNDS[0]])
        ub = np.array([settings.CALIBRATION_ETA_BOUNDS[1], settings.CALIBRATION_CDA_BOUNDS[1], settings.CALIBRATION_CRR_BOUNDS[1]])

        # Prior and regularization:
        # Scale regularization weights so that prior doesn't dominate large datasets,
        # but anchors the solution when speed variation is narrow.
        prior_x = np.array([prior_eta, prior_cda, prior_crr], dtype=np.float64)
        # Prior uncertainties: eta: +/- 0.015, CdA: +/- 0.04, Crr: +/- 0.0012
        sigma_priors = np.array([0.015, 0.040, 0.0012], dtype=np.float64)

        # Scale regularization with data magnitude
        rms_y = max(1000.0, float(np.sqrt(np.mean(y**2))))
        reg_factor = rms_y * 0.015  # 1.5% regularization penalty on prior deviations
        reg_weights = reg_factor / sigma_priors

        if eta_is_fixed:
            # 2-parameter optimization for [CdA, Crr]
            y_sub = y - eta_val * A[:, 0]
            A_sub = A[:, 1:3]  # Aero & RR columns

            lb_sub = lb[1:3]
            ub_sub = ub[1:3]
            prior_sub = prior_x[1:3]
            weights_sub = reg_weights[1:3]

            A_aug = np.vstack([A_sub, np.diag(weights_sub)])
            y_aug = np.concatenate([y_sub, weights_sub * prior_sub])

            res = lsq_linear(A_aug, y_aug, bounds=(lb_sub, ub_sub), lsmr_tol="auto")
            opt_cda = float(res.x[0])
            opt_crr = float(res.x[1])
            opt_eta = eta_val

            # Compute standard errors
            res_vec = y_sub - A_sub @ res.x
            s_res2 = float(np.sum(res_vec**2)) / max(1, M - 2)
            cov = s_res2 * np.linalg.pinv(A_sub.T @ A_sub + np.diag(weights_sub**2))
            cda_std = float(np.sqrt(max(1e-12, cov[0, 0])))
            crr_std = float(np.sqrt(max(1e-12, cov[1, 1])))
            eta_std = 0.005  # Nominal uncertainty

            cond_num = float(np.linalg.cond(A_sub))
        else:
            # Full 3-parameter optimization [eta, CdA, Crr]
            A_aug = np.vstack([A, np.diag(reg_weights)])
            y_aug = np.concatenate([y, reg_weights * prior_x])

            res = lsq_linear(A_aug, y_aug, bounds=(lb, ub), lsmr_tol="auto")
            opt_eta = float(res.x[0])
            opt_cda = float(res.x[1])
            opt_crr = float(res.x[2])

            res_vec = y - A @ res.x
            s_res2 = float(np.sum(res_vec**2)) / max(1, M - 3)
            cov = s_res2 * np.linalg.pinv(A.T @ A + np.diag(reg_weights**2))
            eta_std = float(np.sqrt(max(1e-12, cov[0, 0])))
            cda_std = float(np.sqrt(max(1e-12, cov[1, 1])))
            crr_std = float(np.sqrt(max(1e-12, cov[2, 2])))

            cond_num = float(np.linalg.cond(A))

        return (
            opt_cda,
            opt_crr,
            opt_eta,
            cda_std,
            crr_std,
            eta_std,
            cond_num,
            eta_is_fixed,
            eta_reason,
        )

    @staticmethod
    def validate_leave_one_out(
        activity_points_dict: Dict[str, List[EnrichedPoint]],
        activity_windows_dict: Dict[str, List[EnergyWindow]],
        mass_kg: float,
        prior_eta: float = 0.97,
        prior_cda: float = 0.32,
        prior_crr: float = 0.004,
        fixed_eta: Optional[float] = None,
    ) -> Tuple[Optional[float], Optional[float], Dict[str, Tuple[float, float, float]]]:
        """
        Run Leave-One-Out (LOO) cross-validation across N activities.
        For each activity a:
        1. Calibrate on the N-1 remaining activities.
        2. Simulate activity a using pure Heun physics with the calibrated (CdA, Crr, eta).
        3. Measure speed RMSE (km/h) and total duration error (s, %) on clean segments.
        Returns: (mean_rmse_kmh, mean_time_err_pct, per_activity_metrics)
        """
        act_ids = list(activity_windows_dict.keys())
        if len(act_ids) < 2:
            return None, None, {}

        per_activity: Dict[str, Tuple[float, float, float]] = {}
        all_rmses = []
        all_time_pcts = []

        for holdout_id in act_ids:
            # Combine windows from remaining N-1 activities
            train_windows: List[EnergyWindow] = []
            for other_id in act_ids:
                if other_id != holdout_id:
                    train_windows.extend(activity_windows_dict[other_id])

            if len(train_windows) < settings.MIN_CALIBRATION_WINDOWS:
                continue

            try:
                cda_loo, crr_loo, eta_loo, _, _, _, _, _, _ = CalibrationService.solve_parameters(
                    train_windows,
                    mass_kg=mass_kg,
                    prior_eta=prior_eta,
                    prior_cda=prior_cda,
                    prior_crr=prior_crr,
                    fixed_eta=fixed_eta,
                )
            except Exception as e:
                logger.warning(f"LOO solve failed for holdout {holdout_id}: {e}")
                continue

            holdout_pts = activity_points_dict.get(holdout_id)
            if not holdout_pts or len(holdout_pts) < 60:
                continue

            # Simulate holdout ride with calibrated parameters using Heun solver
            try:
                rmse_kmh, time_err_s, time_err_pct = CalibrationService._evaluate_activity_simulation(
                    points=holdout_pts,
                    cda=cda_loo,
                    crr=crr_loo,
                    eta=eta_loo,
                    mass_kg=mass_kg,
                )
                per_activity[holdout_id] = (rmse_kmh, time_err_s, time_err_pct)
                all_rmses.append(rmse_kmh)
                all_time_pcts.append(time_err_pct)
            except Exception as e:
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
        """Simulate an activity with Heun physics engine and compare speed RMSE & total duration."""
        dx = 5.0
        total_dist = points[-1].distance_m
        if total_dist <= dx * 2:
            raise ValueError("Distance too short for simulation")

        x_grid = np.arange(0.0, total_dist + dx / 2.0, dx, dtype=np.float64)
        src_dist = np.array([p.distance_m for p in points], dtype=np.float64)

        unique_mask = np.concatenate(([True], np.diff(src_dist) > 1e-4))
        src_dist = src_dist[unique_mask]
        clean_pts = [p for i, p in enumerate(points) if unique_mask[i]]

        src_speed = np.array([p.speed_mps for p in clean_pts], dtype=np.float64)
        src_power = np.array([p.power_w for p in clean_pts], dtype=np.float64)
        src_elev = np.array([p.elevation_m for p in clean_pts], dtype=np.float64)
        src_bearing = np.array([p.bearing_deg for p in clean_pts], dtype=np.float64)
        src_w_spd = np.array([p.wind_speed_cyclist_mps for p in clean_pts], dtype=np.float64)
        src_w_dir = np.array([p.wind_direction_deg for p in clean_pts], dtype=np.float64)
        src_rho = np.array([p.air_density_kg_m3 for p in clean_pts], dtype=np.float64)

        x_speed_base = np.interp(x_grid, src_dist, src_speed)
        x_power = np.interp(x_grid, src_dist, src_power)
        x_elev_raw = np.interp(x_grid, src_dist, src_elev)
        x_w_spd = np.interp(x_grid, src_dist, src_w_spd)
        x_rho = np.interp(x_grid, src_dist, src_rho)

        rad_bearing = np.radians(src_bearing)
        bx = np.interp(x_grid, src_dist, np.cos(rad_bearing))
        by = np.interp(x_grid, src_dist, np.sin(rad_bearing))
        x_bearing = (np.degrees(np.arctan2(by, bx)) + 360.0) % 360.0

        rad_wind = np.radians(src_w_dir)
        wx = np.interp(x_grid, src_dist, np.cos(rad_wind))
        wy = np.interp(x_grid, src_dist, np.sin(rad_wind))
        x_wind_dir = (np.degrees(np.arctan2(wy, wx)) + 360.0) % 360.0

        x_elev = ElevationService.smooth_elevation_savgol(x_elev_raw)
        x_slope = ElevationService.calculate_slope_from_distance(x_elev, x_grid)
        x_slope = ElevationService.smooth_slope(x_slope, window_length=11, polyorder=2)

        v_base_clean = np.maximum(x_speed_base, 0.5)
        v_base_seg = 0.5 * (v_base_clean[:-1] + v_base_clean[1:])
        dt_base = dx / np.maximum(v_base_seg, 0.5)
        t_base_cum = np.concatenate(([0.0], np.cumsum(dt_base)))
        total_base_time = float(t_base_cum[-1])

        x_power_eff = PhysicsSolver.smooth_power_response(
            power=x_power,
            time_s=t_base_cum,
            tau_up=1.2,
            tau_down=2.2,
        )
        x_power_eff[x_speed_base < 0.5] = 0.0

        f_brake_base = SimulationEngine._compute_baseline_braking_force(
            v_base=v_base_clean,
            p_base=x_power,
            s=x_slope,
            bearing_deg=x_bearing,
            wind_speed=x_w_spd,
            wind_dir_deg=x_wind_dir,
            dx=dx,
            m=mass_kg,
            cda=cda,
            crr=crr,
            rho=x_rho,
            eta=eta,
            g=settings.GRAVITY,
        )

        v_sim = PhysicsSolver.simulate_speed_arbitrary_wind(
            P=x_power_eff,
            s=x_slope,
            bearing_deg=x_bearing,
            wind_speed=x_w_spd,
            wind_dir_deg=x_wind_dir,
            m=mass_kg,
            CdA=cda,
            Crr=crr,
            rho=x_rho,
            eta=eta,
            g=settings.GRAVITY,
            initial_speed=float(v_base_clean[0]),
            distance_step_m=dx,
            substeps=4,
            max_speed_mps=30.0,
            f_brake_base=f_brake_base,
        )

        v_sim_clean = np.maximum(v_sim, 0.5)
        v_sim_seg = 0.5 * (v_sim_clean[:-1] + v_sim_clean[1:])
        dt_sim = dx / np.maximum(v_sim_seg, 0.5)
        total_sim_time = float(np.sum(dt_sim))

        # Speed RMSE on clean moving segments (speed > 3 m/s, minimal braking)
        clean_mask = (v_base_clean > 3.0) & (f_brake_base < 10.0)
        if np.any(clean_mask):
            speed_err_mps = v_sim_clean[clean_mask] - v_base_clean[clean_mask]
            rmse_kmh = float(np.sqrt(np.mean(speed_err_mps**2)) * 3.6)
        else:
            speed_err_mps = v_sim_clean - v_base_clean
            rmse_kmh = float(np.sqrt(np.mean(speed_err_mps**2)) * 3.6)

        time_err_s = total_sim_time - total_base_time
        time_err_pct = float(abs(time_err_s) / max(1.0, total_base_time) * 100.0)

        return rmse_kmh, time_err_s, time_err_pct

    @staticmethod
    def run_multi_activity_calibration(
        activities: List[Tuple[str, Optional[str], Optional[str], List[EnrichedPoint]]],
        request: CalibrationRequest,
    ) -> CalibrationResponse:
        """
        Main entry point for multi-activity calibration.
        activities: list of (activity_id, name, date, enriched_points)
        """
        if not activities:
            raise ValueError("Brak aktywności do kalibracji.")

        all_windows: List[EnergyWindow] = []
        act_windows_dict: Dict[str, List[EnergyWindow]] = {}
        act_points_dict: Dict[str, List[EnrichedPoint]] = {}
        act_meta_list: List[ActivityCalibrationMeta] = []
        diagnostics: List[str] = []

        total_pts = 0
        for act_id, name, date_str, pts in activities:
            if len(pts) < 60:
                continue
            total_pts += len(pts)
            act_points_dict[act_id] = pts

            wins = CalibrationService.extract_activity_windows(
                points=pts,
                activity_id=act_id,
                mass_kg=request.mass_kg,
                window_duration_s=request.window_duration_s,
            )
            act_windows_dict[act_id] = wins
            all_windows.extend(wins)

            dist_km = float(pts[-1].distance_m / 1000.0)
            dur_min = float(pts[-1].time_offset_s / 60.0)
            avg_p = float(np.mean([p.power_w for p in pts]))
            avg_v = float(np.mean([p.speed_mps for p in pts]) * 3.6)

            act_meta_list.append(
                ActivityCalibrationMeta(
                    activity_id=act_id,
                    name=name or f"Aktywność {act_id}",
                    date=date_str,
                    distance_km=round(dist_km, 2),
                    duration_min=round(dur_min, 1),
                    avg_power_w=round(avg_p, 1),
                    avg_speed_kmh=round(avg_v, 1),
                    windows_count=len(wins),
                )
            )

        if len(all_windows) < settings.MIN_CALIBRATION_WINDOWS:
            raise ValueError(
                f"Wyodrębniono tylko {len(all_windows)} czystych okien energii z {len(activities)} aktywności "
                f"(wymagane min. {settings.MIN_CALIBRATION_WINDOWS}). "
                "Upewnij się, że aktywności mają dane z miernika mocy (power > 0) i nie składają się wyłącznie z postojów."
            )

        # 1. Solve optimal parameters
        (
            cda_opt,
            crr_opt,
            eta_opt,
            cda_std,
            crr_std,
            eta_std,
            cond_num,
            eta_fixed,
            eta_reason,
        ) = CalibrationService.solve_parameters(
            windows=all_windows,
            mass_kg=request.mass_kg,
            prior_eta=request.prior_eta,
            prior_cda=request.prior_cda,
            prior_crr=request.prior_crr,
            fixed_eta=request.fixed_eta,
        )

        if eta_fixed and eta_reason:
            diagnostics.append(eta_reason)

        if cond_num > 150.0:
            diagnostics.append(f"Wysokie uwarunkowanie macierzy ({cond_num:.1f}) - ograniczony zakres prędkości w jazdach.")
        else:
            diagnostics.append(f"Uwarunkowanie macierzy optymalne ({cond_num:.1f}).")

        # 2. Leave-One-Out validation if multiple activities
        mean_rmse, mean_time_pct, per_act_metrics = CalibrationService.validate_leave_one_out(
            activity_points_dict=act_points_dict,
            activity_windows_dict=act_windows_dict,
            mass_kg=request.mass_kg,
            prior_eta=request.prior_eta,
            prior_cda=request.prior_cda,
            prior_crr=request.prior_crr,
            fixed_eta=request.fixed_eta,
        )

        # Update activity metadata with LOO results
        for meta in act_meta_list:
            if meta.activity_id in per_act_metrics:
                rmse_val, time_err_s, time_pct = per_act_metrics[meta.activity_id]
                meta.loo_speed_rmse_kmh = round(rmse_val, 2)
                meta.loo_time_error_s = round(time_err_s, 1)
                meta.loo_time_error_pct = round(time_pct, 2)

        if mean_rmse is not None:
            diagnostics.append(f"Walidacja krzyżowa LOO: średni błąd prędkości RMSE={mean_rmse:.2f} km/h, błąd czasu={mean_time_pct:.1f}%.")

        n_act = len(activities)
        badge_text = f"auto, n={n_act}, CdA {cda_opt:.3f} ±{cda_std:.3f}"

        return CalibrationResponse(
            cda=round(cda_opt, 4),
            crr=round(crr_opt, 5),
            eta=round(eta_opt, 4),
            cda_std=round(cda_std, 4),
            crr_std=round(crr_std, 5),
            eta_std=round(eta_std, 4),
            mass_kg=request.mass_kg,
            n_activities=n_act,
            total_windows=len(all_windows),
            gear_id=request.gear_id,
            eta_fixed=eta_fixed,
            eta_reason=eta_reason,
            condition_number=round(cond_num, 1),
            validation_mean_rmse_kmh=round(mean_rmse, 2) if mean_rmse is not None else None,
            validation_mean_time_error_pct=round(mean_time_pct, 2) if mean_time_pct is not None else None,
            activities=act_meta_list,
            diagnostics=diagnostics,
            badge_text=badge_text,
        )
