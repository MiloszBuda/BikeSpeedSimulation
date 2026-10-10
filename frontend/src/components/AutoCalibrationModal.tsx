import React, { useState, useEffect } from 'react';
import {
  X,
  Gauge,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  Info,
  Calendar,
  Zap,
  Activity as ActivityIcon,
  ChevronRight,
  RefreshCw,
  Bike,
} from 'lucide-react';
import {
  CalibrationResponse,
  StravaActivityMeta,
} from '../types/simulation';
import {
  calibrateFromFitFiles,
  calibrateFromStrava,
  getStravaActivities,
  getStravaAuthStatus,
} from '../services/api';
import { Tooltip } from './Tooltip';

interface AutoCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCalibration: (result: {
    cda: number;
    crr: number;
    eta: number;
    massKg: number;
    badgeText: string;
  }) => void;
  initialMassKg: number;
  initialCda: number;
  initialCrr: number;
  initialEta: number;
  onOpenStravaConnect: () => void;
}

export const AutoCalibrationModal: React.FC<AutoCalibrationModalProps> = ({
  isOpen,
  onClose,
  onApplyCalibration,
  initialMassKg,
  initialCda,
  initialCrr,
  initialEta,
  onOpenStravaConnect,
}) => {
  const [tab, setTab] = useState<'fit' | 'strava'>('fit');
  const [massKg, setMassKg] = useState<number>(initialMassKg || 78.0);
  const [windowDurationS, setWindowDurationS] = useState<number>(300);

  // FIT Tab state
  const [selectedFitFiles, setSelectedFitFiles] = useState<File[]>([]);

  // Strava Tab state
  const [isStravaConnected, setIsStravaConnected] = useState<boolean>(false);
  const [stravaActivities, setStravaActivities] = useState<StravaActivityMeta[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<number[]>([]);
  const [isLoadingStrava, setIsLoadingStrava] = useState<boolean>(false);
  const [onlyPowerMeter, setOnlyPowerMeter] = useState<boolean>(true);

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check Strava status on open
  useEffect(() => {
    if (isOpen) {
      getStravaAuthStatus()
        .then((st) => {
          setIsStravaConnected(st.connected);
          if (st.connected) {
            loadStravaActivities();
          }
        })
        .catch(() => setIsStravaConnected(false));
    }
  }, [isOpen]);

  const loadStravaActivities = async () => {
    setIsLoadingStrava(true);
    setErrorMsg(null);
    try {
      const resp = await getStravaActivities({ perPage: 40 });
      setStravaActivities(resp.activities);
      // Auto-select activities that have device_watts and are outdoor rides (up to 7)
      const validIds = resp.activities
        .filter((a) => a.is_outdoor_with_power)
        .slice(0, 7)
        .map((a) => a.id);
      setSelectedActivityIds(validIds);
    } catch (err: any) {
      setErrorMsg(err.message || 'Nie udało się pobrać aktywności ze Stravy');
    } finally {
      setIsLoadingStrava(false);
    }
  };

  const handleFitFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).filter((f) =>
        f.name.toLowerCase().endsWith('.fit')
      );
      setSelectedFitFiles(filesArray);
      setCalibrationResult(null);
      setErrorMsg(null);
    }
  };

  const handleToggleSelectActivity = (id: number) => {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filtered = stravaActivities.filter(
      (a) => !onlyPowerMeter || a.is_outdoor_with_power
    );
    if (selectedActivityIds.length === filtered.length) {
      setSelectedActivityIds([]);
    } else {
      setSelectedActivityIds(filtered.map((a) => a.id));
    }
  };

  const handleRunCalibration = async () => {
    setIsCalibrating(true);
    setErrorMsg(null);
    setCalibrationResult(null);

    try {
      if (tab === 'fit') {
        if (selectedFitFiles.length === 0) {
          throw new Error('Wybierz co najmniej 1 plik .fit (zalecane 3–10 jazd z powermeterem).');
        }
        const res = await calibrateFromFitFiles(selectedFitFiles, {
          massKg,
          windowDurationS,
          priorEta: initialEta,
          priorCda: initialCda,
          priorCrr: initialCrr,
        });
        setCalibrationResult(res);
      } else {
        if (selectedActivityIds.length === 0) {
          throw new Error('Zaznacz co najmniej 1 aktywność ze Stravy (zalecane 3–10 jazd).');
        }
        const res = await calibrateFromStrava(selectedActivityIds, {
          massKg,
          windowDurationS,
        });
        setCalibrationResult(res);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd podczas kalibracji parametrów.');
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleApplyToSimulation = () => {
    if (!calibrationResult) return;
    onApplyCalibration({
      cda: calibrationResult.cda,
      crr: calibrationResult.crr,
      eta: calibrationResult.eta,
      massKg,
      badgeText: calibrationResult.badge_text,
    });
    onClose();
  };

  if (!isOpen) return null;

  const filteredStravaActivities = stravaActivities.filter(
    (a) => !onlyPowerMeter || a.is_outdoor_with_power
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none w-full max-w-4xl shadow-brutal-lg dark:shadow-brutal-lg-dark flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl text-white shadow-md shadow-teal-500/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Auto-Kalibracja Parametrów (CdA, Crr, η)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Wielojazdowa estymacja oporów z bilansu energii i walidacja Leave-One-Out
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Top Bar: Tabs & Mass Input */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            {/* Tab switch */}
            <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setTab('fit')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  tab === 'fit'
                    ? 'bg-white dark:bg-zinc-900 text-teal-700 dark:text-teal-300 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Z plików .FIT</span>
                {selectedFitFiles.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded-full text-[10px]">
                    {selectedFitFiles.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('strava')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  tab === 'strava'
                    ? 'bg-white dark:bg-zinc-900 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Bike className="w-3.5 h-3.5" />
                <span>Ze Stravy</span>
                {selectedActivityIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 rounded-full text-[10px]">
                    {selectedActivityIds.length}
                  </span>
                )}
              </button>
            </div>

            {/* Parameter configuration: Mass & Window Duration */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Masa kolarz + rower:</span>
                <input
                  type="number"
                  min="40"
                  max="150"
                  step="0.5"
                  value={massKg}
                  onChange={(e) => setMassKg(parseFloat(e.target.value) || 78)}
                  className="w-16 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-teal-500"
                />
                <span className="font-medium text-zinc-600 dark:text-zinc-400">kg</span>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Okno energii:</span>
                <select
                  value={windowDurationS}
                  onChange={(e) => setWindowDurationS(parseInt(e.target.value, 10))}
                  className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-teal-500"
                >
                  <option value={180}>3 min (180s)</option>
                  <option value={300}>5 min (300s - zalecane)</option>
                  <option value={450}>7.5 min (450s)</option>
                  <option value={600}>10 min (600s)</option>
                </select>
              </div>
            </div>
          </div>

          {/* TAB 1: FIT FILES UPLOAD */}
          {tab === 'fit' && (
            <div className="flex flex-col gap-4">
              <label className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-col items-center justify-center gap-2">
                <Upload className="w-8 h-8 text-teal-600 dark:text-teal-400" />
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Wybierz lub upuść pliki .FIT (2 do 20 plików)
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md">
                  Każda jazda powinna być nagrana na zewnątrz z fizycznym miernikiem mocy. Okna z hamowaniem, postojami oraz draftingiem zostaną odrzucone automatycznie.
                </p>
                <input
                  type="file"
                  multiple
                  accept=".fit"
                  onChange={handleFitFilesChange}
                  className="hidden"
                />
              </label>

              {selectedFitFiles.length > 0 && (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <span>Wybrane pliki ({selectedFitFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFitFiles([])}
                      className="text-rose-500 hover:text-rose-600 text-[11px]"
                    >
                      Wyczyść listę
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                    {selectedFitFiles.map((file, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between">
                        <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-sm">
                          {file.name}
                        </span>
                        <span className="text-zinc-400 text-[11px]">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STRAVA ACTIVITIES */}
          {tab === 'strava' && (
            <div className="flex flex-col gap-4">
              {!isStravaConnected ? (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-950/40">
                  <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                    <Bike className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Brak połączenia ze Stravą
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md">
                    Połącz konto ze Stravą, aby jednym kliknięciem pobrać strumienie aktywności (czas, prędkość, moc, nachylenie, wiatr) i przeprowadzić kalibrację.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenStravaConnect}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
                  >
                    Połącz ze Stravą
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Filter & Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={onlyPowerMeter}
                          onChange={(e) => setOnlyPowerMeter(e.target.checked)}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span>Tylko z miernikiem mocy (device_watts)</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="text-teal-600 dark:text-teal-400 hover:underline text-xs"
                      >
                        {selectedActivityIds.length === filteredStravaActivities.length
                          ? 'Odznacz wszystkie'
                          : 'Zaznacz wszystkie pasujące'}
                      </button>
                      <button
                        type="button"
                        onClick={loadStravaActivities}
                        disabled={isLoadingStrava}
                        className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Odśwież listę"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStrava ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Activities Table */}
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                    <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                      {isLoadingStrava && stravaActivities.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                          <span>Ładowanie aktywności ze Stravy...</span>
                        </div>
                      ) : filteredStravaActivities.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400">
                          Brak aktywności spełniających kryteria.
                        </div>
                      ) : (
                        filteredStravaActivities.map((act) => {
                          const isSelected = selectedActivityIds.includes(act.id);
                          const dateFormatted = act.start_date
                            ? new Date(act.start_date).toLocaleDateString()
                            : '-';
                          const distKm = (act.distance_m / 1000).toFixed(1);
                          const durMin = (act.moving_time_s / 60).toFixed(0);

                          return (
                            <div
                              key={act.id}
                              onClick={() => handleToggleSelectActivity(act.id)}
                              className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-teal-50/70 dark:bg-teal-950/40'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by div
                                  className="rounded text-teal-600 focus:ring-teal-500"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                    {act.name}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <span>{dateFormatted}</span>
                                    <span>•</span>
                                    <span>{distKm} km</span>
                                    <span>•</span>
                                    <span>{durMin} min</span>
                                    {act.average_watts && (
                                      <>
                                        <span>•</span>
                                        <span className="text-teal-600 dark:text-teal-400 font-semibold">
                                          {Math.round(act.average_watts)} W
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {act.device_watts ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800">
                                    Powermeter
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded text-[10px]">
                                    Estymata
                                  </span>
                                )}
                                {act.has_streams && (
                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono">
                                    cached
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800/80 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={
                isCalibrating ||
                (tab === 'fit' && selectedFitFiles.length === 0) ||
                (tab === 'strava' && selectedActivityIds.length === 0)
              }
              onClick={handleRunCalibration}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-[0.99]"
            >
              {isCalibrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Obliczanie bilansu energii & LOO...</span>
                </>
              ) : (
                <>
                  <Sliders className="w-4 h-4" />
                  <span>Uruchom Auto-Kalibrację</span>
                </>
              )}
            </button>
          </div>

          {/* CALIBRATION RESULTS CARD */}
          {calibrationResult && (
            <div className="border border-emerald-300 dark:border-emerald-800/80 rounded-none p-5 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800/60 pb-3">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>Wynik Auto-Kalibracji Parametrów</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-semibold">
                  {calibrationResult.badge_text}
                </span>
              </div>

              {/* Main Parameter Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">CdA (aerodynamic drag area)</span>
                  <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
                    {calibrationResult.cda.toFixed(3)}{' '}
                    <span className="text-xs font-normal text-zinc-400">±{calibrationResult.cda_std.toFixed(3)} m²</span>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Crr (rolling resistance)</span>
                  <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
                    {calibrationResult.crr.toFixed(4)}{' '}
                    <span className="text-xs font-normal text-zinc-400">±{calibrationResult.crr_std.toFixed(4)}</span>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">η (sprawność napędu)</span>
                  <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
                    {(calibrationResult.eta * 100).toFixed(1)}%{' '}
                    {calibrationResult.eta_fixed ? (
                      <span className="text-[10px] text-amber-500 font-normal block">Domyślna (brak podjazdów)</span>
                    ) : (
                      <span className="text-xs font-normal text-zinc-400">±{(calibrationResult.eta_std * 100).toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* LOO Validation & Statistics Banner */}
              <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    Aktywności: <strong className="font-mono">{calibrationResult.n_activities}</strong> • Czyste okna energii: <strong className="font-mono">{calibrationResult.total_windows}</strong>
                  </span>
                  {calibrationResult.validation_mean_rmse_kmh !== null && (
                    <span className="text-teal-600 dark:text-teal-400 font-mono font-semibold">
                      Średni błąd LOO RMSE: {calibrationResult.validation_mean_rmse_kmh} km/h (czas ±{calibrationResult.validation_mean_time_error_pct}%)
                    </span>
                  )}
                </div>

                {calibrationResult.diagnostics.length > 0 && (
                  <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 list-disc list-inside space-y-0.5">
                    {calibrationResult.diagnostics.map((diag, i) => (
                      <li key={i}>{diag}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Per-Activity Validation Breakdown */}
              {calibrationResult.activities.length > 0 && (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 text-xs">
                  <div className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-300">
                    Rozbicie wg aktywności & błąd walidacji
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-40 overflow-y-auto font-mono text-[11px]">
                    {calibrationResult.activities.map((act) => (
                      <div key={act.activity_id} className="px-3.5 py-2 flex items-center justify-between">
                        <div className="truncate max-w-xs text-zinc-800 dark:text-zinc-200">
                          {act.name || act.activity_id} ({act.distance_km} km)
                        </div>
                        <div className="flex items-center gap-3 text-zinc-500">
                          <span>{act.windows_count} okien</span>
                          {act.loo_speed_rmse_kmh !== null && (
                            <span className="text-teal-600 dark:text-teal-400 font-semibold">
                              RMSE {act.loo_speed_rmse_kmh} km/h
                            </span>
                          )}
                          {act.loo_time_error_pct !== null && (
                            <span>±{act.loo_time_error_pct}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply Button */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleApplyToSimulation}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-[0.99]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Zastosuj do symulacji i zamknij</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
