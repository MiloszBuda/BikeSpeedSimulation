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
        x_slope = ElevationService.smooth_slope(x_slope, window_length=11, polyorder=2)

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
            # Original pacing from file: preserve exact point-by-point power from FIT
            x_power = x_power_base.copy()
            stopped_mask = x_speed_base < 0.5
            x_power[stopped_mask] = 0.0

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

        # Baseline segment durations: N points define N-1 segments
        v_base_seg = 0.5 * (v_base_clean[:-1] + v_base_clean[1:])
        dt_base = dx / np.maximum(v_base_seg, 0.5)
        t_base_cum = np.concatenate(([0.0], np.cumsum(dt_base)))
        total_base_time = float(t_base_cum[-1])

        # 5. Effective Power Response Model:
        # Time-domain asymmetric neuromuscular lag filter (tau_up=1.2s, tau_down=2.2s).
        # Models physical drivetrain and muscular inertia, eliminating unphysical instantaneous force spikes.
        x_power_effective = PhysicsSolver.smooth_power_response(
            power=x_power,
            time_s=t_base_cum,
            tau_up=1.2,
            tau_down=2.2,
        )
        stopped_mask = x_speed_base < 0.5
        x_power_effective[stopped_mask] = 0.0

        # 6. Baseline Descent Braking Recovery:
        # Reconstruct the braking force the rider applied on descents to control speed,
        # preventing 0W coasting from artificially accelerating to 50-60 km/h.
        f_brake_base = SimulationEngine._compute_baseline_braking_force(
            v_base=v_base_clean,
            p_base=x_power_base,
            s=x_slope,
            bearing_deg=x_bearing,
            wind_speed=x_wind_speed,
            wind_dir_deg=x_wind_dir,
            dx=dx,
            m=request.mass_kg,
            cda=request.cda,
            crr=request.crr,
            rho=x_rho,
            eta=request.drivetrain_efficiency,
            g=settings.GRAVITY,
        )

        if is_baseline:
            # 1. Baseline scenario: identical conditions to the recorded ride.
            # Deltas must be exactly zero, simulated speed matches baseline speed.
            v_sim = v_base_clean.copy()
            v_sim_clean = v_base_clean.copy()
            dt_sim = dt_base.copy()
            t_sim_cum = t_base_cum.copy()
            delta_t_cum = np.zeros_like(t_base_cum)
            total_sim_time = total_base_time
            time_delta_s = 0.0
            eq_power = float(np.mean([p.power_w for p in clean_points])) if request.calculate_equivalent_power else None
        elif not request.reverse_route and request.pacing_mode == PacingMode.ORIGINAL:
            # 2. Original recorded ride What-If: aerodynamic perturbation model.
            # The athlete's recorded trajectory already embodies their power output,
            # grade, braking, cornering, and physical cadence limits.
            # Only the aerodynamic resistance delta modifies the baseline trajectory.
            v_sim = PhysicsSolver.simulate_original_pacing(
                baseline_speed=v_base_clean,
                bearing_deg=x_bearing,
                base_wind_speed=x_wind_speed,
                base_wind_dir_deg=x_wind_dir,
                sim_wind_speed=sim_wind_speed,
                sim_wind_dir_deg=sim_wind_dir,
                rho=x_rho,
                mass=request.mass_kg,
                cda=request.cda,
                dx=dx,
                max_deviation_kmh=8.0,
                max_accel_mps2=0.6,
                deviation_response_time_s=4.0,
            )

            v_sim_clean = np.maximum(v_sim, 0.5)
            v_sim_seg = 0.5 * (v_sim_clean[:-1] + v_sim_clean[1:])
            dt_sim = dx / np.maximum(v_sim_seg, 0.5)
            t_sim_cum = np.concatenate(([0.0], np.cumsum(dt_sim)))
            delta_t_cum = t_base_cum - t_sim_cum
            total_sim_time = float(t_sim_cum[-1])
            time_delta_s = total_base_time - total_sim_time

            eq_power = None
            if request.calculate_equivalent_power:
                # Closed-form aero work delta calculation:
                # Delta W_aero = sum( (F_aero_sim - F_aero_base) * dx )
                # Delta P = Delta W_aero / (eta * T_base)
                # P_eq = P_base + Delta P
                rad_b = np.radians(x_bearing)
                b_beta = np.radians(x_wind_dir) - rad_b
                s_beta = np.radians(sim_wind_dir) - rad_b
                b_w_par = x_wind_speed * np.cos(b_beta)
                b_w_perp = x_wind_speed * np.sin(b_beta)
                s_w_par = sim_wind_speed * np.cos(s_beta)
                s_w_perp = sim_wind_speed * np.sin(s_beta)

                b_head = v_base_clean + b_w_par
                b_app = np.sqrt(b_head**2 + b_w_perp**2)
                f_aero_base_arr = 0.5 * x_rho * request.cda * b_app * b_head

                s_head = v_base_clean + s_w_par
                s_app = np.sqrt(s_head**2 + s_w_perp**2)
                f_aero_sim_arr = 0.5 * x_rho * request.cda * s_app * s_head

                delta_f_arr = f_aero_sim_arr - f_aero_base_arr
                delta_w_aero = float(np.sum(delta_f_arr * dx))
                delta_p = delta_w_aero / (request.drivetrain_efficiency * max(1.0, total_base_time))
                p_base_mean = float(np.mean([p.power_w for p in clean_points]))
                eq_power = max(0.0, p_base_mean + delta_p)
        else:
            # 3. Synthetic pacing or reverse route: continuous distance-domain physical simulation
            v_initial = float(v_base_clean[0])
            v_sim = PhysicsSolver.simulate_speed_arbitrary_wind(
                P=x_power_effective,
                s=x_slope,
                bearing_deg=x_bearing,
                wind_speed=sim_wind_speed,
                wind_dir_deg=sim_wind_dir,
                m=request.mass_kg,
                CdA=request.cda,
                Crr=request.crr,
                rho=x_rho,
                eta=request.drivetrain_efficiency,
                initial_speed=v_initial,
                distance_step_m=dx,
                substeps=4,
                max_speed_mps=30.0,
                f_brake_base=f_brake_base,
                v_base=v_base_clean,
                reverse_route=request.reverse_route,
            )

            v_sim_clean = np.maximum(v_sim, 0.5)
            v_sim_seg = 0.5 * (v_sim_clean[:-1] + v_sim_clean[1:])
            dt_sim = dx / np.maximum(v_sim_seg, 0.5)
            t_sim_cum = np.concatenate(([0.0], np.cumsum(dt_sim)))
            delta_t_cum = t_base_cum - t_sim_cum
            total_sim_time = float(t_sim_cum[-1])
            time_delta_s = total_base_time - total_sim_time

            # Equivalent Power Calculation using identical continuous physics model
            eq_power = None
            if request.calculate_equivalent_power:
                eq_power = SimulationEngine._solve_equivalent_power(
                    target_time_s=total_base_time,
                    base_power=x_power_effective,
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
                    v_initial=v_initial,
                    f_brake_base=f_brake_base,
                    v_base=v_base_clean,
                    reverse_route=request.reverse_route,
                )

        # Compute trajectory acceleration for diagnostic inspection
        accel_mps2 = np.zeros_like(v_sim_clean)
        ref_dt = dt_base if is_baseline else dt_sim
        ref_v = v_base_clean if is_baseline else v_sim_clean
        for i in range(1, len(ref_v)):
            seg_dt = max(1e-3, float(ref_dt[i - 1]))
            accel_mps2[i] = (ref_v[i] - ref_v[i - 1]) / seg_dt

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
                    power_effective_w=round(float(x_power_effective[i]), 1),
                    acceleration_mps2=round(float(accel_mps2[i]), 2),
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
    def _compute_baseline_braking_force(
        v_base: np.ndarray,
        p_base: np.ndarray,
        s: np.ndarray,
        bearing_deg: np.ndarray,
        wind_speed: np.ndarray,
        wind_dir_deg: np.ndarray,
        dx: float,
        m: float,
        cda: float,
        crr: float,
        rho: np.ndarray,
        eta: float,
        g: float,
    ) -> np.ndarray:
        """
        Recover the baseline braking force profile applied by the cyclist during descents.
        When a cyclist coasts/freewheels down a steep hill at moderate speed (e.g. 20 km/h),
        they are actively holding brakes. Recovering this force prevents What-If simulations
        from treating the descent as an uncontrolled 60+ km/h freefall.
        """
        n = len(v_base)
        if n == 0:
            return np.array([], dtype=np.float64)

        v_clean = np.maximum(v_base, 0.5)
        v_seg = 0.5 * (v_clean[:-1] + v_clean[1:])
        dt = dx / np.maximum(v_seg, 0.5)

        a_base = np.zeros(n, dtype=np.float64)
        for i in range(1, n):
            a_base[i] = (v_clean[i] - v_clean[i - 1]) / max(1e-3, float(dt[i - 1]))

        bearing_rad = np.radians(bearing_deg)
        wind_dir_rad = np.radians(wind_dir_deg)
        beta = wind_dir_rad - bearing_rad
        w_par = wind_speed * np.cos(beta)
        w_perp = wind_speed * np.sin(beta)

        rel_head = v_clean + w_par
        app_wind = np.sqrt(rel_head * rel_head + w_perp * w_perp)
        f_aero = 0.5 * rho * cda * app_wind * rel_head
        f_rr = m * g * crr
        f_gravity = -m * g * s

        p_mech = np.maximum(p_base * eta, 0.0)
        f_pedal = np.minimum(p_mech / v_clean, 750.0)

        # Net forward driving force in baseline
        f_drive = f_pedal + f_gravity - f_aero - f_rr
        # Surplus force that was held back by the rider's brakes:
        f_brake_base = np.maximum(0.0, f_drive - m * a_base)

        # Braking force only applies on descents (s < -0.005)
        f_brake_base[s >= -0.005] = 0.0
        f_brake_base = np.clip(f_brake_base, 0.0, 400.0)

        return f_brake_base

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
        v_initial: float = 8.0,
        f_brake_base: np.ndarray = None,
        v_base: np.ndarray = None,
        reverse_route: bool = False,
    ) -> float:
        """
        Binary search to determine scaled power P_eq = k * P such that simulated time matches target_time_s.
        Uses the exact same continuous distance-domain integrator as normal simulation.
        """
        low_k = 0.2
        high_k = 3.5

        def compute_time(k_factor: float) -> float:
            p_trial = base_power * k_factor
            v_trial = PhysicsSolver.simulate_speed_arbitrary_wind(
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
                initial_speed=v_initial,
                distance_step_m=dx,
                substeps=4,
                max_speed_mps=30.0,
                f_brake_base=f_brake_base,
                v_base=v_base,
                reverse_route=reverse_route,
            )
            v_clean = np.maximum(v_trial, 0.5)
            v_seg = 0.5 * (v_clean[:-1] + v_clean[1:])
            dt = dx / np.maximum(v_seg, 0.5)
            return float(np.sum(dt))

        # 12 iterations of bisection gives ~0.05% precision
        for _ in range(12):
            mid_k = (low_k + high_k) / 2.0
            t_mid = compute_time(mid_k)

            # Higher power -> shorter time
            if t_mid > target_time_s:
                low_k = mid_k
            else:
                high_k = mid_k

        final_k = (low_k + high_k) / 2.0
        return float(np.mean(base_power) * final_k)
