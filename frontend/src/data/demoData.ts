import { FitProcessResponse, WhatIfSimulationResponse, ChungEstimateResponse } from '../types/simulation';

// Generate a realistic 12 km loop around Kampinos / Warsaw
const generateDemoPoints = () => {
  const points = [];
  const n = 360; // 360 points (~12 km, 33m step)
  const centerLat = 52.28;
  const centerLon = 20.85;
  const radius = 0.025; // ~2.8 km radius

  let cumDist = 0;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI;
    const lat = centerLat + radius * Math.sin(angle);
    const lon = centerLon + radius * 1.6 * Math.cos(angle);
    
    // Bearing tangential to circle (heading)
    const bearing = ((angle + Math.PI / 2) * (180 / Math.PI) + 360) % 360;

    // Terrain profile: two hills along loop
    const elev = 85.0 + 18.0 * Math.sin(angle * 2) + 4.0 * Math.cos(angle * 4);

    const speedMps = 8.8 + 1.2 * Math.sin(angle); // ~32 km/h
    const powerW = 240.0 + 40.0 * Math.sin(angle * 2) + (Math.random() * 10 - 5);

    cumDist += 33.3;

    // Wind from East (90 deg), 4.5 m/s at 10m -> 2.85 m/s at cyclist
    const windSpeed10m = 4.5;
    const windSpeedCyclist = 2.85;
    const windDir = 90.0;

    const beta = (windDir - bearing + 360) % 360;
    const betaRad = (beta * Math.PI) / 180;
    const headwind = windSpeedCyclist * Math.cos(betaRad);
    const crosswind = windSpeedCyclist * Math.sin(betaRad);
    const vHead = speedMps + headwind;
    const vApp = Math.sqrt(vHead * vHead + crosswind * crosswind);
    const psi = Math.atan2(crosswind, vHead) * (180 / Math.PI);

    points.push({
      time_offset_s: i * 3,
      timestamp: new Date(Date.now() - (n - i) * 3000).toISOString(),
      lat,
      lon,
      elevation_m: parseFloat(elev.toFixed(1)),
      distance_m: parseFloat(cumDist.toFixed(1)),
      speed_mps: parseFloat(speedMps.toFixed(2)),
      speed_kmh: parseFloat((speedMps * 3.6).toFixed(1)),
      power_w: parseFloat(powerW.toFixed(1)),
      bearing_deg: parseFloat(bearing.toFixed(1)),
      cadence_rpm: 88,
      heart_rate_bpm: 152,
      temp_c: 19.5,
      surface_pressure_hpa: 1014.2,
      surface_pressure_pa: 101420.0,
      wind_speed_10m_mps: windSpeed10m,
      wind_speed_cyclist_mps: windSpeedCyclist,
      wind_direction_deg: windDir,
      relative_humidity_pct: 58.0,
      air_density_kg_m3: 1.205,
      yaw_angle_deg: parseFloat(beta.toFixed(1)),
      headwind_comp_mps: parseFloat(headwind.toFixed(2)),
      crosswind_comp_mps: parseFloat(crosswind.toFixed(2)),
      apparent_wind_speed_mps: parseFloat(vApp.toFixed(2)),
      apparent_wind_angle_deg: parseFloat(psi.toFixed(1)),
    });
  }
  return points;
};

export const demoEnrichedPoints = generateDemoPoints();

export const demoProcessResponse: FitProcessResponse = {
  summary: {
    start_time: demoEnrichedPoints[0].timestamp,
    end_time: demoEnrichedPoints[demoEnrichedPoints.length - 1].timestamp,
    duration_s: demoEnrichedPoints[demoEnrichedPoints.length - 1].time_offset_s,
    total_distance_m: demoEnrichedPoints[demoEnrichedPoints.length - 1].distance_m,
    avg_speed_kmh: 32.4,
    max_speed_kmh: 42.1,
    avg_power_w: 242.0,
    normalized_power_w: 251.0,
    total_elevation_gain_m: 86.0,
    total_elevation_loss_m: 86.0,
    bbox: {
      min_lat: 52.255,
      max_lat: 52.305,
      min_lon: 20.81,
      max_lon: 20.89,
      center_lat: 52.28,
      center_lon: 20.85,
    },
    points_count: demoEnrichedPoints.length,
  },
  weather_summary: {
    avg_temp_c: 19.5,
    avg_pressure_hpa: 1014.2,
    avg_air_density_kg_m3: 1.205,
    avg_wind_speed_10m_mps: 4.5,
    avg_wind_speed_cyclist_mps: 2.85,
    dominant_wind_dir_deg: 90.0,
  },
  points: demoEnrichedPoints,
};

export const demoSimulationResponse: WhatIfSimulationResponse = {
  summary: {
    total_distance_m: 11988.0,
    baseline_time_s: 1332.0,
    simulated_time_s: 1332.0,
    time_delta_s: 0.0,
    baseline_avg_speed_kmh: 32.4,
    simulated_avg_speed_kmh: 32.4,
    equivalent_power_w: 242.0,
    pacing_mode: 'original',
    reverse_route: false,
    wind_scenario: 'Warunki bazowe (zgodne z plikiem)',
  },
  spatial_points: demoEnrichedPoints.map((p) => ({
    distance_m: p.distance_m,
    lat: p.lat,
    lon: p.lon,
    elevation_m: p.elevation_m,
    slope: 0.0,
    bearing_deg: p.bearing_deg,
    power_w: p.power_w,
    wind_speed_mps: p.wind_speed_cyclist_mps,
    wind_dir_deg: p.wind_direction_deg,
    simulated_speed_mps: p.speed_mps,
    simulated_speed_kmh: p.speed_kmh,
    baseline_speed_mps: p.speed_mps,
    baseline_speed_kmh: p.speed_kmh,
    delta_time_s: 0.0,
  })),
};

export const demoChungResponse: ChungEstimateResponse = {
  cda: 0.318,
  crr: 0.0039,
  r_squared: 0.994,
  rmse_m: 0.62,
  virtual_elevation_m: demoEnrichedPoints.map((p) => p.elevation_m + Math.sin(p.time_offset_s / 50) * 0.4),
  real_elevation_m: demoEnrichedPoints.map((p) => p.elevation_m),
  time_offset_s: demoEnrichedPoints.map((p) => p.time_offset_s),
};
