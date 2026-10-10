import {
  ChungEstimateResponse,
  FitProcessResponse,
  WhatIfSimulationResponse,
  CalibrationResponse,
  StravaActivitiesResponse,
  StravaAuthStatusResponse,
} from '../types/simulation';

export const DEFAULT_API_URL = 'https://bikespeedsimulation.onrender.com';
export const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export interface HealthStatus {
  online: boolean;
  blockedByClient: boolean;
  error?: string;
}

export async function checkBackendHealth(timeoutMs: number = 10000): Promise<HealthStatus> {
  // Try /health first, then /ping if failed
  for (const endpoint of ['/health', '/ping']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return { online: true, blockedByClient: false };
      }
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[Backend Health Check (${API_BASE}${endpoint})] error:`, err);
    }
  }

  return {
    online: false,
    blockedByClient: true,
  };
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

// --- Auto-Calibration API ---

export async function calibrateFromFitFiles(
  files: File[],
  options?: {
    massKg?: number;
    windowDurationS?: number;
    gearId?: string;
    priorEta?: number;
    priorCda?: number;
    priorCrr?: number;
    fixedEta?: number;
  }
): Promise<CalibrationResponse> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  if (options?.massKg !== undefined) formData.append('mass_kg', options.massKg.toString());
  if (options?.windowDurationS !== undefined) formData.append('window_duration_s', options.windowDurationS.toString());
  if (options?.gearId) formData.append('gear_id', options.gearId);
  if (options?.priorEta !== undefined) formData.append('prior_eta', options.priorEta.toString());
  if (options?.priorCda !== undefined) formData.append('prior_cda', options.priorCda.toString());
  if (options?.priorCrr !== undefined) formData.append('prior_crr', options.priorCrr.toString());
  if (options?.fixedEta !== undefined) formData.append('fixed_eta', options.fixedEta.toString());

  const res = await fetch(`${API_BASE}/api/calibration/calibrate-fit`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Błąd kalibracji plików .fit');
  }

  return res.json();
}

export async function calibrateFromStrava(
  activityIds: number[],
  options?: {
    massKg?: number;
    windowDurationS?: number;
    gearId?: string;
  }
): Promise<CalibrationResponse> {
  const payload = {
    activity_ids: activityIds,
    mass_kg: options?.massKg ?? 78.0,
    window_duration_s: options?.windowDurationS ?? 300,
    gear_id: options?.gearId,
  };

  const res = await fetch(`${API_BASE}/api/calibration/calibrate-strava`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Błąd kalibracji ze Stravy');
  }

  return res.json();
}

export async function getLatestCalibration(): Promise<{ calibrated: boolean; result: CalibrationResponse | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/calibration/latest`);
    if (!res.ok) return { calibrated: false, result: null };
    return res.json();
  } catch {
    return { calibrated: false, result: null };
  }
}

// --- Strava Integration API ---

export async function getStravaAuthUrl(clientId?: string, redirectUri?: string): Promise<{ auth_url: string; client_id: string }> {
  const params = new URLSearchParams();
  if (clientId) params.append('client_id', clientId);
  if (redirectUri) params.append('redirect_uri', redirectUri);

  const res = await fetch(`${API_BASE}/api/strava/auth-url?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Nie udało się wygenerować adresu logowania Strava');
  }
  return res.json();
}

export async function exchangeStravaToken(
  code: string,
  clientId?: string,
  clientSecret?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/strava/exchange-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Błąd wymiany kodu autoryzacyjnego Strava');
  }

  return res.json();
}

export async function getStravaAuthStatus(): Promise<StravaAuthStatusResponse> {
  const res = await fetch(`${API_BASE}/api/strava/status`);
  if (!res.ok) {
    throw new Error('Błąd sprawdzania statusu połączenia ze Stravą');
  }
  return res.json();
}

export async function disconnectStrava(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/strava/disconnect`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Błąd rozłączania konta Strava');
  }
  return res.json();
}

export async function getStravaActivities(params?: {
  before?: number;
  after?: number;
  page?: number;
  perPage?: number;
  forceRefresh?: boolean;
}): Promise<StravaActivitiesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.before) searchParams.append('before', params.before.toString());
  if (params?.after) searchParams.append('after', params.after.toString());
  if (params?.page) searchParams.append('page', params.page.toString());
  if (params?.perPage) searchParams.append('per_page', params.perPage.toString());
  if (params?.forceRefresh) searchParams.append('force_refresh', 'true');

  const res = await fetch(`${API_BASE}/api/strava/activities?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Nie udało się pobrać listy aktywności ze Stravy');
  }
  return res.json();
}

export async function processStravaActivity(
  activityId: number,
  params?: {
    windScale?: number;
    windRotation?: number;
  }
): Promise<FitProcessResponse> {
  const searchParams = new URLSearchParams();
  if (params?.windScale !== undefined) searchParams.append('wind_scale_factor', params.windScale.toString());
  if (params?.windRotation !== undefined) searchParams.append('wind_rotation_deg', params.windRotation.toString());

  const res = await fetch(`${API_BASE}/api/strava/activities/${activityId}/process?${searchParams.toString()}`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Błąd przetwarzania aktywności ze Stravy');
  }

  return res.json();
}
