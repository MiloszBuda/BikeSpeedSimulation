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
