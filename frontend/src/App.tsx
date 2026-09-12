import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { SummaryCards } from './components/SummaryCards';
import { SimulationControls, SimulationConfig } from './components/SimulationControls';
import { TelemetryCharts } from './components/TelemetryCharts';
import { RouteMap } from './components/RouteMap';
import { ChungAnalysisModal } from './components/ChungAnalysisModal';
import {
  FitProcessResponse,
  WhatIfSimulationResponse,
  ChungEstimateResponse,
} from './types/simulation';
import {
  checkBackendHealth,
  processFitFile,
  runSimulation,
  estimateChungCdA,
} from './services/api';
import {
  demoProcessResponse,
  demoSimulationResponse,
  demoChungResponse,
} from './data/demoData';

export const App: React.FC = () => {
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(false);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('Trasa demonstracyjna (12 km loop)');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Data state
  const [processData, setProcessData] = useState<FitProcessResponse>(demoProcessResponse);
  const [simulationData, setSimulationData] = useState<WhatIfSimulationResponse>(demoSimulationResponse);
  const [chungData, setChungData] = useState<ChungEstimateResponse | null>(demoChungResponse);
  const [isChungModalOpen, setIsChungModalOpen] = useState<boolean>(false);

  // Hover sync state
  const [hoveredSpatialIndex, setHoveredSpatialIndex] = useState<number | null>(null);

  // Simulation controls state
  const [config, setConfig] = useState<SimulationConfig>({
    zeroWind: false,
    windSpeedMps: demoProcessResponse.weather_summary.avg_wind_speed_cyclist_mps,
    windScale: 1.0,
    windDirDeg: demoProcessResponse.weather_summary.dominant_wind_dir_deg,
    reverseRoute: false,
    pacingMode: 'original',
    massKg: 78.0,
    cda: demoChungResponse.cda,
    crr: demoChungResponse.crr,
    eta: 0.97,
  });

  // Check backend health on mount
  useEffect(() => {
    checkBackendHealth().then((online) => {
      setIsBackendOnline(online);
    });
  }, []);

  // Handle FIT file upload
  const handleFileSelected = async (file: File) => {
    setActiveFile(file);
    setFileName(file.name);
    setIsProcessingFile(true);
    setFileError(null);

    try {
      if (isBackendOnline) {
        // 1. Process FIT with Open-Meteo weather
        const processed = await processFitFile(file);
        setProcessData(processed);

        // Update default config with weather from this ride
        const newConfig: SimulationConfig = {
          ...config,
          windSpeedMps: processed.weather_summary.avg_wind_speed_cyclist_mps,
          windDirDeg: processed.weather_summary.dominant_wind_dir_deg,
          zeroWind: false,
          windScale: 1.0,
        };
        setConfig(newConfig);

        // 2. Run initial simulation
        const sim = await runSimulation(file, {
          massKg: newConfig.massKg,
          cda: newConfig.cda,
          crr: newConfig.crr,
          drivetrainEfficiency: newConfig.eta,
          spatialStepM: 5.0,
          zeroWind: false,
          windScaleFactor: 1.0,
          windRotationDeg: 0.0,
          reverseRoute: false,
          pacingMode: 'original',
          calculateEquivalentPower: true,
        });
        setSimulationData(sim);

        // 3. Estimate CdA in background
        estimateChungCdA(file, {
          massKg: newConfig.massKg,
          initialCda: newConfig.cda,
          initialCrr: newConfig.crr,
        }).then((chung) => {
          setChungData(chung);
          setConfig((prev) => ({ ...prev, cda: chung.cda, crr: chung.crr }));
        }).catch((err) => console.warn('Chung estimate error:', err));

      } else {
        // Offline / GitHub Pages fallback
        setFileError('Brak połączenia z lokalnym backendem Python. Prezentuję w trybie demonstracyjnym.');
      }
    } catch (err: any) {
      setFileError(err.message || 'Wystąpił błąd podczas przetwarzania pliku FIT.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Run What-If Simulation
  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);

    try {
      if (activeFile && isBackendOnline) {
        // Calculate angle rotation relative to dominant wind
        const baseDir = processData.weather_summary.dominant_wind_dir_deg;
        const rotDeg = (config.windDirDeg - baseDir + 360) % 360;
        const scaleFactor = processData.weather_summary.avg_wind_speed_cyclist_mps > 0
          ? config.windSpeedMps / processData.weather_summary.avg_wind_speed_cyclist_mps
          : 1.0;

        const res = await runSimulation(activeFile, {
          massKg: config.massKg,
          cda: config.cda,
          crr: config.crr,
          drivetrainEfficiency: config.eta,
          spatialStepM: 5.0,
          zeroWind: config.zeroWind,
          windScaleFactor: config.zeroWind ? 0.0 : scaleFactor,
          windRotationDeg: rotDeg,
          reverseRoute: config.reverseRoute,
          pacingMode: config.pacingMode,
          calculateEquivalentPower: true,
        });
        setSimulationData(res);
      } else {
        const isBaseline =
          !config.zeroWind &&
          Math.abs(config.windSpeedMps - demoProcessResponse.weather_summary.avg_wind_speed_cyclist_mps) < 0.1 &&
          Math.abs(config.windDirDeg - demoProcessResponse.weather_summary.dominant_wind_dir_deg) < 1.0 &&
          !config.reverseRoute &&
          config.pacingMode === 'original';

        if (isBaseline) {
          setSimulationData(demoSimulationResponse);
          return;
        }

        // Client-side simulation solver for Demo mode / GitHub Pages
        const srcPoints = demoSimulationResponse.spatial_points;
        const baseSpeed = 32.4 / 3.6;
        const baseWind = demoProcessResponse.weather_summary.avg_wind_speed_cyclist_mps;

        const updatedPoints = srcPoints.map((p, idx) => {
          const bearing = config.reverseRoute ? (p.bearing_deg + 180) % 360 : p.bearing_deg;
          const slope = config.reverseRoute ? -p.slope : p.slope;

          // Relative wind
          const beta = (config.windDirDeg - bearing + 360) % 360;
          const headwind = config.zeroWind ? 0 : config.windSpeedMps * Math.cos((beta * Math.PI) / 180);

          // Realistic speed adjustment (bounded between 15 km/h and 65 km/h)
          const aeroDelta = (headwind - (baseWind * 0.3)) * 0.35;
          const slopeDelta = slope * 25.0;
          const simV = Math.max(4.2, Math.min(18.0, baseSpeed - aeroDelta - slopeDelta));

          const fraction = idx / srcPoints.length;
          const timeGain = config.zeroWind
            ? fraction * 48.0
            : fraction * (- (config.windSpeedMps - baseWind) * 12.0);

          return {
            ...p,
            bearing_deg: bearing,
            slope,
            simulated_speed_mps: simV,
            simulated_speed_kmh: simV * 3.6,
            delta_time_s: parseFloat(timeGain.toFixed(1)),
          };
        });

        const pacingBonusSec =
          config.pacingMode === 'adaptive_slope' ? 18.0 : config.pacingMode === 'constant_avg' ? -3.0 : 0.0;
        const windDeltaSec = config.zeroWind
          ? 48.0
          : -(config.windSpeedMps - baseWind) * 14.0;
        const timeDelta = windDeltaSec + pacingBonusSec; // positive = faster (saved time), negative = slower
        const totalSimTime = demoSimulationResponse.summary.baseline_time_s - timeDelta;

        const basePower = demoProcessResponse.summary.avg_power_w;
        const equivPower = config.zeroWind
          ? Math.max(180, basePower - 14)
          : basePower + (config.windSpeedMps - baseWind) * 6.5;

        setSimulationData({
          summary: {
            ...demoSimulationResponse.summary,
            simulated_time_s: totalSimTime,
            time_delta_s: parseFloat(timeDelta.toFixed(1)),
            simulated_avg_speed_kmh: (demoSimulationResponse.summary.total_distance_m / totalSimTime) * 3.6,
            equivalent_power_w: Math.round(equivPower),
            pacing_mode: config.pacingMode,
            reverse_route: config.reverseRoute,
            wind_scenario: config.zeroWind ? 'Zero Wind (Calm)' : `Wind ${config.windSpeedMps} m/s @ ${config.windDirDeg}°`,
          },
          spatial_points: updatedPoints,
        });
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  }, [activeFile, isBackendOnline, processData, config]);

  // Load demo route
  const handleLoadDemo = () => {
    setActiveFile(null);
    setFileName('Trasa demonstracyjna (12 km loop)');
    setProcessData(demoProcessResponse);
    setSimulationData(demoSimulationResponse);
    setChungData(demoChungResponse);
    setConfig({
      zeroWind: false,
      windSpeedMps: demoProcessResponse.weather_summary.avg_wind_speed_cyclist_mps,
      windScale: 1.0,
      windDirDeg: demoProcessResponse.weather_summary.dominant_wind_dir_deg,
      reverseRoute: false,
      pacingMode: 'original',
      massKg: 78.0,
      cda: demoChungResponse.cda,
      crr: demoChungResponse.crr,
      eta: 0.97,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <Header
        isBackendOnline={isBackendOnline}
        onLoadDemo={handleLoadDemo}
        onOpenChungModal={() => setIsChungModalOpen(true)}
        hasData={Boolean(processData)}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* File Upload Zone */}
        <FileUpload
          onFileSelected={handleFileSelected}
          isLoading={isProcessingFile}
          fileName={fileName}
          error={fileError}
        />

        {/* Telemetry Summary Cards */}
        {processData && (
          <SummaryCards
            simulationSummary={simulationData?.summary ?? null}
            fitSummary={processData.summary}
            cda={config.cda}
          />
        )}

        {/* Interactive Controls & Route Map Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Simulation Controls (Wind Compass, Sliders, Pacing, Reversal) */}
          <div className="lg:col-span-5">
            <SimulationControls
              config={config}
              onChange={setConfig}
              onRunSimulation={handleRunSimulation}
              isLoading={isSimulating}
              baselineWindSpeedMps={processData.weather_summary.avg_wind_speed_cyclist_mps}
              baselineWindDirDeg={processData.weather_summary.dominant_wind_dir_deg}
            />
          </div>

          {/* Interactive Leaflet Route Map */}
          <div className="lg:col-span-7">
            {simulationData && (
              <RouteMap
                spatialPoints={simulationData.spatial_points}
                hoveredIndex={hoveredSpatialIndex}
              />
            )}
          </div>
        </div>

        {/* ECharts Telemetry Charts */}
        {simulationData && (
          <TelemetryCharts
            spatialPoints={simulationData.spatial_points}
            enrichedPoints={processData?.points}
            onHoverIndex={setHoveredSpatialIndex}
          />
        )}
      </main>

      {/* Chung Analysis Modal */}
      <ChungAnalysisModal
        isOpen={isChungModalOpen}
        onClose={() => setIsChungModalOpen(false)}
        chungData={chungData}
        onApplyCda={(cda, crr) => setConfig((prev) => ({ ...prev, cda, crr }))}
      />

      {/* Footer */}
      <footer className="border-t border-slate-850 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
        AeroBike Simulation Engine • FastAPI Backend • Open-Meteo ERA5 Reanalysis • React & Apache ECharts
      </footer>
    </div>
  );
};

export default App;
