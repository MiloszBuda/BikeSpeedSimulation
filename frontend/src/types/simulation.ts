export interface GeoBoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  center_lat: number;
  center_lon: number;
}

export interface FitSummary {
  start_time: string;
  end_time: string;
  duration_s: number;
  total_distance_m: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  avg_power_w: number;
  normalized_power_w: number | null;
  total_elevation_gain_m: number;
  total_elevation_loss_m: number;
  bbox: GeoBoundingBox;
  points_count: number;
}

export interface WeatherSummary {
  avg_temp_c: number;
  avg_pressure_hpa: number;
  avg_air_density_kg_m3: number;
  avg_wind_speed_10m_mps: number;
  avg_wind_speed_cyclist_mps: number;
  dominant_wind_dir_deg: number;
  weather_provider?: string;
  is_fallback?: boolean;
  fallback_reason?: string | null;
}

export interface EnrichedPoint {
  time_offset_s: number;
  timestamp: string;
  lat: number;
  lon: number;
  elevation_m: number;
  distance_m: number;
  speed_mps: number;
  speed_kmh: number;
  power_w: number;
  bearing_deg: number;
  cadence_rpm?: number | null;
  heart_rate_bpm?: number | null;

  temp_c: number;
  surface_pressure_hpa: number;
  surface_pressure_pa: number;
  wind_speed_10m_mps: number;
  wind_speed_cyclist_mps: number;
  wind_direction_deg: number;
  relative_humidity_pct?: number | null;
  air_density_kg_m3: number;

  yaw_angle_deg: number;
  headwind_comp_mps: number;
  crosswind_comp_mps: number;
  apparent_wind_speed_mps: number;
  apparent_wind_angle_deg: number;
}

export interface FitProcessResponse {
  summary: FitSummary;
  weather_summary: WeatherSummary;
  points: EnrichedPoint[];
}

export interface SpatialPoint {
  distance_m: number;
  lat: number;
  lon: number;
  elevation_m: number;
  slope: number;
  bearing_deg: number;
  power_w: number;
  wind_speed_mps: number;
  wind_dir_deg: number;
  simulated_speed_mps: number;
  simulated_speed_kmh: number;
  baseline_speed_mps: number;
  baseline_speed_kmh: number;
  delta_time_s: number;
  power_effective_w?: number;
  acceleration_mps2?: number;
}

export interface SimulationSummary {
  total_distance_m: number;
  baseline_time_s: number;
  simulated_time_s: number;
  time_delta_s: number;
  baseline_avg_speed_kmh: number;
  simulated_avg_speed_kmh: number;
  equivalent_power_w: number | null;
  pacing_mode: string;
  reverse_route: boolean;
  wind_scenario: string;
}

export interface WhatIfSimulationResponse {
  summary: SimulationSummary;
  spatial_points: SpatialPoint[];
}

export interface ChungEstimateResponse {
  cda: number;
  crr: number;
  r_squared: number;
  rmse_m: number;
  virtual_elevation_m: number[];
  real_elevation_m: number[];
  time_offset_s: number[];
}

export interface ActivityCalibrationMeta {
  activity_id: string;
  name?: string;
  date?: string;
  distance_km: number;
  duration_min: number;
  avg_power_w: number;
  avg_speed_kmh: number;
  windows_count: number;
  loo_speed_rmse_kmh?: number | null;
  loo_time_error_s?: number | null;
  loo_time_error_pct?: number | null;
}

export interface CalibrationResponse {
  cda: number;
  crr: number;
  eta: number;
  cda_std: number;
  crr_std: number;
  eta_std: number;
  mass_kg: number;
  n_activities: number;
  total_windows: number;
  gear_id?: string | null;
  eta_fixed: boolean;
  eta_reason?: string | null;
  condition_number: number;
  validation_mean_rmse_kmh?: number | null;
  validation_mean_time_error_pct?: number | null;
  activities: ActivityCalibrationMeta[];
  diagnostics: string[];
  badge_text: string;
}

export interface StravaAthlete {
  id: number;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  profile?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface StravaAuthStatusResponse {
  connected: boolean;
  athlete?: StravaAthlete | null;
  scopes: string[];
  expires_at?: number | null;
  has_credentials: boolean;
}

export interface StravaActivityMeta {
  id: number;
  name: string;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  total_elevation_gain_m: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone?: string | null;
  trainer: boolean;
  device_watts: boolean;
  gear_id?: string | null;
  gear_name?: string | null;
  average_speed_mps: number;
  max_speed_mps: number;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  has_streams: boolean;
  is_outdoor_with_power: boolean;
}

export interface StravaActivitiesResponse {
  activities: StravaActivityMeta[];
  total: number;
  page: number;
  per_page: number;
}
