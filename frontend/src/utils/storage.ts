export interface SavedAdvancedParams {
  massKg: number;
  cda: number;
  crr: number;
  eta: number;
}

const STORAGE_KEY = 'aerobike_advanced_params';

export const DEFAULT_ADVANCED_PARAMS: SavedAdvancedParams = {
  massKg: 78.0,
  cda: 0.32,
  crr: 0.004,
  eta: 0.97,
};

export const loadSavedAdvancedParams = (): SavedAdvancedParams => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ADVANCED_PARAMS };
    const parsed = JSON.parse(raw);
    return {
      massKg:
        typeof parsed.massKg === 'number' && parsed.massKg >= 35 && parsed.massKg <= 220
          ? parsed.massKg
          : DEFAULT_ADVANCED_PARAMS.massKg,
      cda:
        typeof parsed.cda === 'number' && parsed.cda >= 0.15 && parsed.cda <= 0.9
          ? parsed.cda
          : DEFAULT_ADVANCED_PARAMS.cda,
      crr:
        typeof parsed.crr === 'number' && parsed.crr >= 0.001 && parsed.crr <= 0.025
          ? parsed.crr
          : DEFAULT_ADVANCED_PARAMS.crr,
      eta:
        typeof parsed.eta === 'number' && parsed.eta >= 0.75 && parsed.eta <= 1.0
          ? parsed.eta
          : DEFAULT_ADVANCED_PARAMS.eta,
    };
  } catch {
    return { ...DEFAULT_ADVANCED_PARAMS };
  }
};

export const saveAdvancedParams = (params: Partial<SavedAdvancedParams>): void => {
  try {
    const current = loadSavedAdvancedParams();
    const updated: SavedAdvancedParams = {
      ...current,
      ...params,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save advanced parameters to localStorage:', err);
  }
};

export const resetAdvancedParams = (): SavedAdvancedParams => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT_ADVANCED_PARAMS };
};
