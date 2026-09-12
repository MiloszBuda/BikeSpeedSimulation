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
            # Original pacing
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

        # 5. Solve simulated speeds
        v_sim = PhysicsSolver.solve_speed_arbitrary_wind(
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

        # Baseline speeds (prevent division by zero)
        v_base_clean = np.maximum(x_speed_base, 0.5)
        v_sim_clean = np.maximum(v_sim, 0.5)

        # Segment durations
        dt_base = dx / v_base_clean
        dt_sim = dx / v_sim_clean

        t_base_cum = np.cumsum(dt_base)
        t_sim_cum = np.cumsum(dt_sim)

        # Cumulative time difference (positive = simulated is faster than baseline)
        delta_t_cum = t_base_cum - t_sim_cum

        # 6. Equivalent Power Calculation
        eq_power = None
        if request.calculate_equivalent_power:
            eq_power = SimulationEngine._solve_equivalent_power(
                target_time_s=float(t_base_cum[-1]),
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
            )

        # 7. Build Response
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

        total_sim_time = float(t_sim_cum[-1])
        total_base_time = float(t_base_cum[-1])

        summary = SimulationSummary(
            total_distance_m=float(total_distance),
            baseline_time_s=total_base_time,
            simulated_time_s=total_sim_time,
            time_delta_s=total_base_time - total_sim_time,
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
    ) -> float:
        """
        Binary search to determine scaled power P_eq = k * P such that simulated time matches target_time_s.
        """
        low_k = 0.2
        high_k = 3.5

        def compute_time(k_factor: float) -> float:
            p_trial = base_power * k_factor
            v_trial = PhysicsSolver.solve_speed_arbitrary_wind(
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
            v_trial_clean = np.maximum(v_trial, 0.5)
            return float(np.sum(dx / v_trial_clean))

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
