"""Chung's Virtual Elevation (VE) method for estimating aerodynamic drag CdA and rolling resistance Crr."""

from typing import Dict, List, Optional, Tuple
import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize

from app.config import settings
from app.services.elevation_service import ElevationService


class ChungService:
    """Virtual Elevation (VE) parameter fitting and integration engine."""

    @staticmethod
    def compute_virtual_elevation(
        P: np.ndarray,
        v: np.ndarray,
        v_app: np.ndarray,
        rho: np.ndarray,
        m: float,
        CdA: float,
        Crr: float,
        v_head: Optional[np.ndarray] = None,
        dt: float = 1.0,
        eta: float = settings.DEFAULT_ETA,
        g: float = settings.GRAVITY,
    ) -> np.ndarray:
        """
        Integrate power balance equation over discrete time steps to produce virtual elevation profile h_virt(t).
        Uses the exact aerodynamic drag force formulation matching PhysicsSolver:
        P_aero = 0.5 * rho * CdA * v_app * v_head * v
        where v_head is the relative headwind component along the direction of travel (v + w_parallel).
        """
        P = np.asarray(P, dtype=np.float64)
        v = np.asarray(v, dtype=np.float64)
        v_app = np.asarray(v_app, dtype=np.float64)
        rho = np.asarray(rho, dtype=np.float64)

        if len(v) == 0:
            return np.array([], dtype=np.float64)

        if v_head is None:
            v_head_arr = v_app
        else:
            v_head_arr = np.asarray(v_head, dtype=np.float64)

        # Kinetic energy term: (v(t)^2 - v(0)^2) / (2 * g)
        v0 = v[0]
        kinetic_term = (v**2 - v0**2) / (2.0 * g)

        power_term = (P * eta) / (m * g)
        aero_term = (0.5 * rho * CdA * v_app * v_head_arr * v) / (m * g)
        crr_term = Crr * v

        integrand = power_term - aero_term - crr_term
        integral = cumulative_trapezoid(integrand, dx=dt, initial=0.0)
        h_virt = integral - kinetic_term

        return h_virt

    @staticmethod
    def fit_parameters(
        P: np.ndarray,
        v: np.ndarray,
        v_app: np.ndarray,
        rho: np.ndarray,
        m: float,
        h_real: np.ndarray,
        v_head: Optional[np.ndarray] = None,
        dt: float = 1.0,
        eta: float = settings.DEFAULT_ETA,
        initial_cda: float = settings.DEFAULT_CDA,
        initial_crr: float = settings.DEFAULT_CRR,
        fixed_crr: Optional[float] = None,
        g: float = settings.GRAVITY,
    ) -> Dict[str, any]:
        """
        Optimize CdA and (optionally) Crr using least squares to minimize squared residuals
        between virtual elevation and real smoothed elevation.
        """
        # Smooth h_real with Savitzky-Golay filter first
        h_real_smooth = ElevationService.smooth_elevation_savgol(h_real)

        if fixed_crr is not None:
            # Only optimize CdA
            def objective(params):
                cda_val = params[0]
                h_virt = ChungService.compute_virtual_elevation(
                    P, v, v_app, rho, m, CdA=cda_val, Crr=fixed_crr, v_head=v_head, dt=dt, eta=eta, g=g
                )
                h_virt_offset = h_virt - (h_virt[0] - h_real_smooth[0])
                return np.sum((h_virt_offset - h_real_smooth)**2)

            res = minimize(
                objective,
                x0=[initial_cda],
                bounds=[(0.12, 0.65)],
                method="L-BFGS-B",
            )
            opt_cda = float(res.x[0])
            opt_crr = float(fixed_crr)
        else:
            # Optimize both CdA and Crr
            def objective(params):
                cda_val, crr_val = params
                h_virt = ChungService.compute_virtual_elevation(
                    P, v, v_app, rho, m, CdA=cda_val, Crr=crr_val, v_head=v_head, dt=dt, eta=eta, g=g
                )
                h_virt_offset = h_virt - (h_virt[0] - h_real_smooth[0])
                return np.sum((h_virt_offset - h_real_smooth)**2)

            res = minimize(
                objective,
                x0=[initial_cda, initial_crr],
                bounds=[(0.15, 0.60), (0.001, 0.015)],
                method="L-BFGS-B",
            )
            opt_cda = float(res.x[0])
            opt_crr = float(res.x[1])

        # Final virtual elevation curve
        final_h_virt = ChungService.compute_virtual_elevation(
            P, v, v_app, rho, m, CdA=opt_cda, Crr=opt_crr, v_head=v_head, dt=dt, eta=eta, g=g
        )
        final_h_virt_aligned = final_h_virt - (final_h_virt[0] - h_real_smooth[0])

        residuals = final_h_virt_aligned - h_real_smooth
        ss_res = float(np.sum(residuals**2))
        ss_tot = float(np.sum((h_real_smooth - np.mean(h_real_smooth))**2))
        r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
        rmse = float(np.sqrt(np.mean(residuals**2)))

        return {
            "cda": opt_cda,
            "crr": opt_crr,
            "r_squared": max(0.0, min(1.0, r_squared)),
            "rmse_m": rmse,
            "virtual_elevation": final_h_virt_aligned.tolist(),
            "real_elevation": h_real_smooth.tolist(),
        }
