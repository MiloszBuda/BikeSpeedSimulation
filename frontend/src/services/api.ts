import {
  ChungEstimateResponse,
  FitProcessResponse,
  WhatIfSimulationResponse,
} from '../types/simulation';

export const DEFAULT_API_URL = 'https://bikespeedsimulation.onrender.com';
export const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export async function checkBackendHealth(timeoutMs: number = 10000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[Backend Health Check (${API_BASE})] error:`, err);
    return false;
  }
}

export async function processFitFile(
  file: File,
  params?: {
    windScale?: number;
    windRotation?: number;
    windSpeedOverride?: number;
    windDirOverride?: number;
  }
): Promise<FitProcessResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (params?.windScale !== undefined) formData.append('wind_scale_factor', params.windScale.toString());
  if (params?.windRotation !== undefined) formData.append('wind_rotation_deg', params.windRotation.toString());
  if (params?.windSpeedOverride !== undefined) formData.append('wind_speed_override_mps', params.windSpeedOverride.toString());
  if (params?.windDirOverride !== undefined) formData.append('wind_dir_override_deg', params.windDirOverride.toString());

  const res = await fetch(`${API_BASE}/api/fit/process`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to process FIT file');
  }

  return res.json();
}

export async function runSimulation(
  file: File,
  options: {
    massKg?: number;
    cda?: number;
    crr?: number;
    drivetrainEfficiency?: number;
    spatialStepM?: number;
    zeroWind?: boolean;
    windScaleFactor?: number;
    windRotationDeg?: number;
    reverseRoute?: boolean;
    pacingMode?: string;
    calculateEquivalentPower?: boolean;
  }
): Promise<WhatIfSimulationResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.massKg !== undefined) formData.append('mass_kg', options.massKg.toString());
  if (options.cda !== undefined) formData.append('cda', options.cda.toString());
  if (options.crr !== undefined) formData.append('crr', options.crr.toString());
  if (options.drivetrainEfficiency !== undefined) formData.append('drivetrain_efficiency', options.drivetrainEfficiency.toString());
  if (options.spatialStepM !== undefined) formData.append('spatial_step_m', options.spatialStepM.toString());
  if (options.zeroWind !== undefined) formData.append('zero_wind', options.zeroWind ? 'true' : 'false');
  if (options.windScaleFactor !== undefined) formData.append('wind_scale_factor', options.windScaleFactor.toString());
  if (options.windRotationDeg !== undefined) formData.append('wind_rotation_deg', options.windRotationDeg.toString());
  if (options.reverseRoute !== undefined) formData.append('reverse_route', options.reverseRoute ? 'true' : 'false');
  if (options.pacingMode !== undefined) formData.append('pacing_mode', options.pacingMode);
  if (options.calculateEquivalentPower !== undefined) formData.append('calculate_equivalent_power', options.calculateEquivalentPower ? 'true' : 'false');

  const res = await fetch(`${API_BASE}/api/simulation/what-if`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to run simulation');
  }

  return res.json();
}

export async function estimateChungCdA(
  file: File,
  options?: {
    massKg?: number;
    drivetrainEfficiency?: number;
    fixedCrr?: number;
    initialCda?: number;
    initialCrr?: number;
  }
): Promise<ChungEstimateResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.massKg !== undefined) formData.append('mass_kg', options.massKg.toString());
  if (options?.drivetrainEfficiency !== undefined) formData.append('drivetrain_efficiency', options.drivetrainEfficiency.toString());
  if (options?.fixedCrr !== undefined) formData.append('fixed_crr', options.fixedCrr.toString());
  if (options?.initialCda !== undefined) formData.append('initial_cda', options.initialCda.toString());
  if (options?.initialCrr !== undefined) formData.append('initial_crr', options.initialCrr.toString());

  const res = await fetch(`${API_BASE}/api/physics/estimate-cda`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to estimate CdA');
  }

  return res.json();
}
