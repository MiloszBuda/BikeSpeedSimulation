"""Distance-domain simulation engine for What-If aerodynamic and wind scenario analyses."""

import math
from typing import List, Optional, Tuple
import numpy as np

from app.config import settings
from app.schemas.fit import (
    EnrichedPoint,
    PacingMode,
    SimulationSummary,
    SpatialPoint,
    WhatIfSimulationRequest,
    WhatIfSimulationResponse,
)
from app.services.elevation_service import ElevationService
from app.services.physics_solver import PhysicsSolver


class SimulationEngine:
    """Simulates cycling performance over a spatial distance grid under varying environmental conditions."""

    @staticmethod
    def run_simulation(
        points: List[EnrichedPoint],
        request: WhatIfSimulationRequest,
    ) -> WhatIfSimulationResponse:
        """Run full What-If simulation on enriched activity points."""
        if len(points) < 2:
            raise ValueError("Activity requires at least 2 points for simulation.")

        dx = max(1.0, request.spatial_step_m)
        total_distance = points[-1].distance_m

        if total_distance <= dx:
            raise ValueError(f"Total distance ({total_distance}m) is shorter than spatial step ({dx}m).")

        # 1. Resample to uniform distance grid
        x_grid = np.arange(0.0, total_distance + dx / 2.0, dx, dtype=np.float64)
        src_dist = np.array([p.distance_m for p in points], dtype=np.float64)

        # Ensure monotonically increasing source distances
        unique_mask = np.concatenate(([True], np.diff(src_dist) > 1e-4))
        src_dist = src_dist[unique_mask]
        clean_points = [p for i, p in enumerate(points) if unique_mask[i]]

        src_lat = np.array([p.lat for p in clean_points], dtype=np.float64)
        src_lon = np.array([p.lon for p in clean_points], dtype=np.float64)
        src_elev = np.array([p.elevation_m for p in clean_points], dtype=np.float64)
        src_speed = np.array([p.speed_mps for p in clean_points], dtype=np.float64)
        src_power = np.array([p.power_w for p in clean_points], dtype=np.float64)
        src_bearing = np.array([p.bearing_deg for p in clean_points], dtype=np.float64)
        src_wind_speed = np.array([p.wind_speed_cyclist_mps for p in clean_points], dtype=np.float64)
        src_wind_dir = np.array([p.wind_direction_deg for p in clean_points], dtype=np.float64)
        src_rho = np.array([p.air_density_kg_m3 for p in clean_points], dtype=np.float64)

        # Interpolate spatial features
        x_lat = np.interp(x_grid, src_dist, src_lat)
        x_lon = np.interp(x_grid, src_dist, src_lon)
        x_elev_raw = np.interp(x_grid, src_dist, src_elev)
        x_speed_base = np.interp(x_grid, src_dist, src_speed)
        x_power_base = np.interp(x_grid, src_dist, src_power)
        x_wind_speed = np.interp(x_grid, src_dist, src_wind_speed)
        x_rho = np.interp(x_grid, src_dist, src_rho)

        # Circular interpolation for bearing & wind direction
        rad_bearing = np.radians(src_bearing)
        bx = np.interp(x_grid, src_dist, np.cos(rad_bearing))
        by = np.interp(x_grid, src_dist, np.sin(rad_bearing))
        x_bearing = (np.degrees(np.arctan2(by, bx)) + 360.0) % 360.0

        rad_wind = np.radians(src_wind_dir)
        wx = np.interp(x_grid, src_dist, np.cos(rad_wind))
        wy = np.interp(x_grid, src_dist, np.sin(rad_wind))
        x_wind_dir = (np.degrees(np.arctan2(wy, wx)) + 360.0) % 360.0

        # Smooth elevation and calculate slope
        x_elev = ElevationService.smooth_elevation_savgol(x_elev_raw)
        x_slope = ElevationService.calculate_slope_from_distance(x_elev, x_grid)

        # 2. Route Reversal ("Jazda pod prąd")
        if request.reverse_route:
            x_lat = x_lat[::-1]
            x_lon = x_lon[::-1]
            x_elev = x_elev[::-1]
            x_bearing = (x_bearing[::-1] + 180.0) % 360.0
            x_slope = -x_slope[::-1]  # Climbs become descents, descents become climbs
            x_speed_base = x_speed_base[::-1]
            x_wind_speed = x_wind_speed[::-1]
            x_wind_dir = x_wind_dir[::-1]
            x_rho = x_rho[::-1]
            # Power assignment handled below by pacing mode

        # 3. Pacing Profile
        p_avg = float(np.mean(x_power_base))
        if request.pacing_mode == PacingMode.CONSTANT_AVG:
            x_power = np.full_like(x_power_base, p_avg)
        elif request.pacing_mode == PacingMode.ADAPTIVE_SLOPE:
            # Adaptive slope pacing: decrease power on steep descents (s < -2%),
            # increase power on steep climbs (s > 3%)
            factors = np.ones_like(x_slope)
            # Climbs: s > 0.03
            climb_mask = x_slope > 0.03
            factors[climb_mask] = 1.0 + np.minimum(0.35, 3.0 * (x_slope[climb_mask] - 0.03))
            # Descents: s < -0.02
            desc_mask = x_slope < -0.02
            factors[desc_mask] = np.maximum(0.15, 1.0 - 15.0 * (-x_slope[desc_mask] - 0.02))

            # Normalize so mean power equals target p_avg
            mean_f = np.mean(factors)
            x_power = (p_avg * (factors / mean_f)) if mean_f > 0 else np.full_like(x_slope, p_avg)
        else:
            # Original pacing from file: smooth out momentary 0W cadence drops (gear shifts/pauses)
            # using a rolling average over ~30m (approx 6 samples for dx=5m)
            w = min(6, len(x_power_base))
            if w > 1:
                kernel = np.ones(w) / float(w)
                x_power = np.convolve(x_power_base, kernel, mode="same")
                # Where the rider was truly at a standstill in baseline, keep 0W
                stopped_mask = x_speed_base < 1.0
                x_power[stopped_mask] = 0.0
            else:
                x_power = x_power_base.copy()

        # 4. Wind Scenario Modifications
        if request.zero_wind:
            sim_wind_speed = np.zeros_like(x_wind_speed)
            sim_wind_dir = x_wind_dir.copy()
            wind_scenario_desc = "Zero Wind (Calm)"
        else:
            sim_wind_speed = x_wind_speed * request.wind_scale_factor
            sim_wind_dir = (x_wind_dir + request.wind_rotation_deg) % 360.0
            wind_scenario_desc = f"Scale {request.wind_scale_factor}x, Rotated {request.wind_rotation_deg} deg"

        # Check if the user is running the exact baseline scenario
        rot_norm = float(request.wind_rotation_deg) % 360.0
        is_rot_zero = math.isclose(rot_norm, 0.0, abs_tol=3.0) or math.isclose(rot_norm, 360.0, abs_tol=3.0)
        is_baseline = (
            not request.zero_wind
            and math.isclose(request.wind_scale_factor, 1.0, rel_tol=0.05)
            and is_rot_zero
            and not request.reverse_route
            and request.pacing_mode == PacingMode.ORIGINAL
        )

        # Baseline speeds (prevent division by zero)
        v_base_clean = np.maximum(x_speed_base, 0.5)

        # Baseline segment durations
        dt_base = dx / v_base_clean
        t_base_cum = np.cumsum(dt_base)
        total_base_time = float(t_base_cum[-1])

        if is_baseline:
            # 1. Baseline scenario: identical conditions to the recorded ride.
            # Deltas must be exactly zero, simulated speed matches baseline speed.
            v_sim = v_base_clean.copy()
            dt_sim = dt_base.copy()
            t_sim_cum = t_base_cum.copy()
            delta_t_cum = np.zeros_like(t_base_cum)
            total_sim_time = total_base_time
            time_delta_s = 0.0
            eq_power = float(np.mean([p.power_w for p in clean_points])) if request.calculate_equivalent_power else None
        else:
            # 2. What-If scenario: conditions differ from baseline
            # Solve steady-state speeds
            v_sim_raw = PhysicsSolver.solve_speed_arbitrary_wind(
                P=x_power,
                s=x_slope,
                bearing_deg=x_bearing,
                wind_speed=sim_wind_speed,
                wind_dir_deg=sim_wind_dir,
                m=request.mass_kg,
                CdA=request.cda,
                Crr=request.crr,
                rho=x_rho,
                eta=request.drivetrain_efficiency,
            )

            # Precalculate apparent wind vectors for dynamic work-energy calculations
            rad_bearing = np.radians(x_bearing)
            rad_sim_wind = np.radians(sim_wind_dir)
            beta_sim = rad_sim_wind - rad_bearing
            sim_w_par = sim_wind_speed * np.cos(beta_sim)
            sim_w_perp = sim_wind_speed * np.sin(beta_sim)

            # Apply double-bounded kinetic energy continuity pass:
            # Cyclist has mass (m ~ 78kg) and cannot instantaneously accelerate or decelerate!
            v_sim = np.zeros_like(v_sim_raw)
            v_last = max(float(v_base_clean[0]), 2.0)
            m_kg = request.mass_kg
            g_acc = settings.GRAVITY

            for i in range(len(v_sim_raw)):
                # Driving force (pedaling + downhill gravity component)
                p_eff = float(x_power[i]) * request.drivetrain_efficiency
                f_pedal = p_eff / max(v_last, 1.5)
                f_downhill = max(0.0, -m_kg * g_acc * float(x_slope[i]))
                f_drive = f_pedal + f_downhill

                # Opposing resistances (aero + rolling + uphill gravity)
                v_head = v_last + float(sim_w_par[i])
                v_app = math.sqrt(v_head**2 + float(sim_w_perp[i])**2)
                f_aero = 0.5 * float(x_rho[i]) * request.cda * v_app * v_head
                f_rr = m_kg * g_acc * request.crr
                f_uphill = max(0.0, m_kg * g_acc * float(x_slope[i]))
                f_resist = f_aero + f_rr + f_uphill

                # Net work done over distance step dx:
                # Delta(v^2) = (2 * dx / m) * (F_drive - F_resist)
                net_work = (2.0 * dx / m_kg) * (f_drive - f_resist)

                # Upper bound on acceleration (cannot exceed work done):
                v_max_step = math.sqrt(max(0.25, v_last**2 + max(0.0, net_work)))
                # Lower bound on deceleration (cannot stop faster than total resistance work):
                v_min_step = math.sqrt(max(0.25, v_last**2 + min(0.0, net_work)))

                # Steady-state target speed from physics solver:
                v_target = float(v_sim_raw[i])

                # Downhill braking / cornering safety ceiling:
                # If on a steep descent (s < -1.5%) and coasting (P < 30W), cyclists control speed via brakes.
                # In non-reversed original pacing, the rider's baseline speed v_base reflects their safe road handling.
                if not request.reverse_route and request.pacing_mode == PacingMode.ORIGINAL and x_slope[i] < -0.015 and x_power[i] < 30.0:
                    # Allow slight aero perturbation around baseline descent speed (+/- 1.5 m/s), capped at 65 km/h (18 m/s)
                    v_safe_descent = min(18.0, float(v_base_clean[i]) + 1.5)
                    v_target = min(v_target, v_safe_descent)
                else:
                    # General road safety ceiling for bicycles (72 km/h = 20 m/s)
                    v_target = min(v_target, 20.0)

                # Bounded speed evolution
                v_curr = min(v_max_step, max(v_min_step, v_target))
                v_sim[i] = v_curr
                v_last = v_curr

            v_sim_clean = np.maximum(v_sim, 0.5)
            dt_sim = dx / v_sim_clean
            t_sim_cum = np.cumsum(dt_sim)
            delta_t_cum = t_base_cum - t_sim_cum
            total_sim_time = float(t_sim_cum[-1])
            time_delta_s = total_base_time - total_sim_time

            # Equivalent Power Calculation
            eq_power = None
            if request.calculate_equivalent_power:
                eq_power = SimulationEngine._solve_equivalent_power(
                    target_time_s=total_base_time,
                    base_power=x_power,
                    s=x_slope,
                    bearing_deg=x_bearing,
                    wind_speed=sim_wind_speed,
                    wind_dir_deg=sim_wind_dir,
                    mass_kg=request.mass_kg,
                    cda=request.cda,
                    crr=request.crr,
                    rho=x_rho,
                    eta=request.drivetrain_efficiency,
                    dx=dx,
                    v_base_clean=v_base_clean,
                )

        # Build Response
        spatial_points: List[SpatialPoint] = []
        for i in range(len(x_grid)):
            spatial_points.append(
                SpatialPoint(
                    distance_m=float(x_grid[i]),
                    lat=float(x_lat[i]),
                    lon=float(x_lon[i]),
                    elevation_m=float(x_elev[i]),
                    slope=float(x_slope[i]),
                    bearing_deg=float(x_bearing[i]),
                    power_w=float(x_power[i]),
                    wind_speed_mps=float(sim_wind_speed[i]),
                    wind_dir_deg=float(sim_wind_dir[i]),
                    simulated_speed_mps=float(v_sim[i]),
                    simulated_speed_kmh=float(v_sim[i] * 3.6),
                    baseline_speed_mps=float(v_base_clean[i]),
                    baseline_speed_kmh=float(v_base_clean[i] * 3.6),
                    delta_time_s=float(delta_t_cum[i]),
                )
            )

        summary = SimulationSummary(
            total_distance_m=float(total_distance),
            baseline_time_s=total_base_time,
            simulated_time_s=total_sim_time,
            time_delta_s=time_delta_s,
            baseline_avg_speed_kmh=(total_distance / total_base_time) * 3.6,
            simulated_avg_speed_kmh=(total_distance / total_sim_time) * 3.6,
            equivalent_power_w=eq_power,
            pacing_mode=request.pacing_mode,
            reverse_route=request.reverse_route,
            wind_scenario=wind_scenario_desc,
        )

        return WhatIfSimulationResponse(summary=summary, spatial_points=spatial_points)

    @staticmethod
    def _solve_equivalent_power(
        target_time_s: float,
        base_power: np.ndarray,
        s: np.ndarray,
        bearing_deg: np.ndarray,
        wind_speed: np.ndarray,
        wind_dir_deg: np.ndarray,
        mass_kg: float,
        cda: float,
        crr: float,
        rho: np.ndarray,
        eta: float,
        dx: float,
        v_base_clean: Optional[np.ndarray] = None,
    ) -> float:
        """
        Binary search to determine scaled power P_eq = k * P such that simulated time matches target_time_s.
        """
        low_k = 0.2
        high_k = 3.5

        rad_b = np.radians(bearing_deg)
        rad_w = np.radians(wind_dir_deg)
        beta = rad_w - rad_b
        w_par = wind_speed * np.cos(beta)
        w_perp = wind_speed * np.sin(beta)
        g_acc = settings.GRAVITY

        def compute_time(k_factor: float) -> float:
            p_trial = base_power * k_factor
            v_raw = PhysicsSolver.solve_speed_arbitrary_wind(
                P=p_trial,
                s=s,
                bearing_deg=bearing_deg,
                wind_speed=wind_speed,
                wind_dir_deg=wind_dir_deg,
                m=mass_kg,
                CdA=cda,
                Crr=crr,
                rho=rho,
                eta=eta,
            )
            v_dyn = np.zeros_like(v_raw)
            v_last = max(float(v_base_clean[0]) if v_base_clean is not None else float(v_raw[0]), 2.0)

            for i in range(len(v_raw)):
                p_eff = float(p_trial[i]) * eta
                f_pedal = p_eff / max(v_last, 1.5)
                f_downhill = max(0.0, -mass_kg * g_acc * float(s[i]))
                f_drive = f_pedal + f_downhill

                v_head = v_last + float(w_par[i])
                v_app = math.sqrt(v_head**2 + float(w_perp[i])**2)
                f_aero = 0.5 * float(rho[i]) * cda * v_app * v_head
                f_rr = mass_kg * g_acc * crr
                f_uphill = max(0.0, mass_kg * g_acc * float(s[i]))
                f_resist = f_aero + f_rr + f_uphill

                net_work = (2.0 * dx / mass_kg) * (f_drive - f_resist)
                v_max_step = math.sqrt(max(0.25, v_last**2 + max(0.0, net_work)))
                v_min_step = math.sqrt(max(0.25, v_last**2 + min(0.0, net_work)))

                v_target = min(float(v_raw[i]), 20.0)
                if v_base_clean is not None and s[i] < -0.015 and p_trial[i] < 30.0:
                    v_target = min(v_target, min(18.0, float(v_base_clean[i]) + 1.5))

                v_curr = min(v_max_step, max(v_min_step, v_target))
                v_dyn[i] = v_curr
                v_last = v_curr

            v_clean = np.maximum(v_dyn, 0.5)
            return float(np.sum(dx / v_clean))

        # 12 iterations of bisection gives ~0.05% precision
        for _ in range(12):
            mid_k = (low_k + high_k) / 2.0
            t_mid = compute_time(mid_k)

            # Higher power -> shorter time
            if t_mid > target_time_s:
                # Need more power
                low_k = mid_k
            else:
                # Too fast, need less power
                high_k = mid_k

        final_k = (low_k + high_k) / 2.0
        return float(np.mean(base_power) * final_k)
