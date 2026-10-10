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
      const filesArr = Array.from(e.target.files).filter((f) =>
        f.name.toLowerCase().endsWith('.fit')
      );
      setSelectedFitFiles(filesArr);
    }
  };

  const handleToggleSelectActivity = (id: number) => {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const ids = filteredStravaActivities.map((a) => a.id);
    if (selectedActivityIds.length === ids.length) {
      setSelectedActivityIds([]);
    } else {
      setSelectedActivityIds(ids);
    }
  };

  const handleRunCalibration = async () => {
    setIsCalibrating(true);
    setErrorMsg(null);
    setCalibrationResult(null);

    try {
      let resp: CalibrationResponse;
      if (tab === 'fit') {
        if (selectedFitFiles.length === 0) {
          setErrorMsg('Wybierz co najmniej 1 plik .FIT');
          setIsCalibrating(false);
          return;
        }
        resp = await calibrateFromFitFiles(selectedFitFiles, { massKg, windowDurationS });
      } else {
        if (selectedActivityIds.length === 0) {
          setErrorMsg('Zaznacz co najmniej 1 aktywność ze Stravy');
          setIsCalibrating(false);
          return;
        }
        resp = await calibrateFromStrava(selectedActivityIds, { massKg, windowDurationS });
      }
      setCalibrationResult(resp);
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd podczas kalibracji parametrów');
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
      massKg: massKg,
      badgeText: calibrationResult.badge_text,
    });
    onClose();
  };

  if (!isOpen) return null;

  const filteredStravaActivities = stravaActivities.filter(
    (a) => !onlyPowerMeter || a.is_outdoor_with_power
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none w-full max-w-4xl shadow-brutal-lg dark:shadow-brutal-lg-dark flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b-2 border-zinc-900 dark:border-zinc-100 flex items-center justify-between bg-zinc-50 dark:bg-[#121214]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-400 text-zinc-950 border-2 border-zinc-900 shadow-brutal-sm rounded-none shrink-0">
              <Gauge className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black font-mono uppercase tracking-wider text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                <span>Auto-Kalibracja Parametrów</span>
                <span className="text-[10px] px-2 py-0.5 bg-lime-400 text-zinc-950 border-2 border-zinc-900 font-black shadow-brutal-sm">CdA • Crr • η</span>
              </h2>
              <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mt-0.5">
                Wielojazdowa estymacja oporów z bilansu energii i walidacja Leave-One-Out
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 font-mono">
          {/* Top Bar: Tabs & Mass Input */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-zinc-900 dark:border-zinc-100">
            {/* Tab switch */}
            <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
              <button
                type="button"
                onClick={() => setTab('fit')}
                className={`px-3.5 py-1.5 rounded-none text-xs font-mono font-black uppercase transition-all flex items-center gap-1.5 ${
                  tab === 'fit'
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-brutal-sm'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Z plików .FIT</span>
                {selectedFitFiles.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-zinc-950 border border-zinc-900 rounded-none text-[10px] font-black">
                    {selectedFitFiles.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('strava')}
                className={`px-3.5 py-1.5 rounded-none text-xs font-mono font-black uppercase transition-all flex items-center gap-1.5 ${
                  tab === 'strava'
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-brutal-sm'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                <Bike className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Ze Stravy</span>
                {selectedActivityIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-orange-400 text-zinc-950 border border-zinc-900 rounded-none text-[10px] font-black">
                    {selectedActivityIds.length}
                  </span>
                )}
              </button>
            </div>

            {/* Parameter configuration: Mass & Window Duration */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-[#121214] px-3 py-1.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs shadow-brutal-sm">
                <span className="text-zinc-700 dark:text-zinc-300 font-bold uppercase">Masa kolarz + rower:</span>
                <input
                  type="number"
                  min="40"
                  max="150"
                  step="0.5"
                  value={massKg}
                  onChange={(e) => setMassKg(parseFloat(e.target.value) || 78)}
                  className="w-16 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-1.5 py-0.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold text-center shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
                />
                <span className="font-black text-zinc-900 dark:text-zinc-100">kg</span>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-[#121214] px-3 py-1.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs shadow-brutal-sm">
                <span className="text-zinc-700 dark:text-zinc-300 font-bold uppercase">Okno energii:</span>
                <select
                  value={windowDurationS}
                  onChange={(e) => setWindowDurationS(parseInt(e.target.value, 10))}
                  className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-1.5 py-0.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
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
              <label className="border-2 border-dashed border-zinc-900 dark:border-zinc-100 rounded-none p-6 text-center cursor-pointer transition-colors bg-zinc-50 dark:bg-[#121214] hover:bg-amber-50 dark:hover:bg-zinc-800/80 flex flex-col items-center justify-center gap-2 shadow-brutal-sm">
                <Upload className="w-8 h-8 text-amber-500 stroke-[2.5]" />
                <div className="text-sm font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-wide">
                  Wybierz lub upuść pliki .FIT (2 do 20 plików)
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md">
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
                <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none overflow-hidden bg-white dark:bg-[#18181b] shadow-brutal-sm">
                  <div className="px-4 py-2 bg-zinc-100 dark:bg-[#121214] border-b-2 border-zinc-900 dark:border-zinc-100 flex items-center justify-between text-xs font-black uppercase text-zinc-950 dark:text-zinc-50">
                    <span>Wybrane pliki ({selectedFitFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFitFiles([])}
                      className="text-rose-600 hover:text-rose-500 text-[11px] font-black underline uppercase"
                    >
                      Wyczyść listę
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y-2 divide-zinc-900 dark:divide-zinc-800 text-xs">
                    {selectedFitFiles.map((file, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between hover:bg-amber-50 dark:hover:bg-zinc-800/60">
                        <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold truncate max-w-sm">
                          {file.name}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-mono">
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
                <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-8 text-center flex flex-col items-center justify-center gap-3 bg-orange-50 dark:bg-[#18181b] shadow-brutal">
                  <div className="w-12 h-12 rounded-none bg-[#FC4C02] text-white border-2 border-zinc-900 shadow-brutal-sm flex items-center justify-center">
                    <Bike className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <h3 className="text-base font-black uppercase text-zinc-950 dark:text-zinc-50">
                    Brak połączenia ze Stravą
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md">
                    Połącz konto ze Stravą, aby jednym kliknięciem pobrać strumienie aktywności (czas, prędkość, moc, nachylenie, wiatr) i przeprowadzić kalibrację.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenStravaConnect}
                    className="px-6 py-2.5 bg-[#FC4C02] hover:bg-[#E34402] text-white rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs font-black uppercase tracking-wider shadow-brutal transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  >
                    Połącz ze Stravą
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Filter & Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b-2 border-zinc-900 dark:border-zinc-100 pb-2">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-zinc-800 dark:text-zinc-200 font-bold">
                        <input
                          type="checkbox"
                          checked={onlyPowerMeter}
                          onChange={(e) => setOnlyPowerMeter(e.target.checked)}
                          className="w-4 h-4 rounded-none border-2 border-zinc-900 accent-teal-600"
                        />
                        <span>Tylko z miernikiem mocy (device_watts)</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="text-zinc-900 dark:text-zinc-100 hover:text-amber-500 font-black underline text-xs uppercase"
                      >
                        {selectedActivityIds.length === filteredStravaActivities.length
                          ? 'Odznacz wszystkie'
                          : 'Zaznacz wszystkie pasujące'}
                      </button>
                      <button
                        type="button"
                        onClick={loadStravaActivities}
                        disabled={isLoadingStrava}
                        className="p-1.5 text-zinc-900 dark:text-zinc-100 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 transition-colors"
                        title="Odśwież listę"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${isLoadingStrava ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Activities Table */}
                  <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none overflow-hidden bg-white dark:bg-[#18181b] shadow-brutal-sm">
                    <div className="max-h-60 overflow-y-auto divide-y-2 divide-zinc-900 dark:divide-zinc-800 text-xs">
                      {isLoadingStrava && stravaActivities.length === 0 ? (
                        <div className="p-8 text-center text-zinc-600 dark:text-zinc-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                          <span>Ładowanie aktywności ze Stravy...</span>
                        </div>
                      ) : filteredStravaActivities.length === 0 ? (
                        <div className="p-8 text-center text-zinc-600 dark:text-zinc-400 font-bold">
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
                                  ? 'bg-amber-100/70 dark:bg-amber-950/40 border-l-4 border-l-amber-500'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by div
                                  className="w-4 h-4 rounded-none border-2 border-zinc-900 accent-amber-500"
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-zinc-950 dark:text-zinc-50 truncate">
                                    {act.name}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                                    <span>{dateFormatted}</span>
                                    <span>•</span>
                                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{distKm} km</span>
                                    <span>•</span>
                                    <span>{durMin} min</span>
                                    {act.average_watts && (
                                      <>
                                        <span>•</span>
                                        <span className="text-orange-600 dark:text-orange-400 font-black">
                                          {Math.round(act.average_watts)} W
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {act.device_watts ? (
                                  <span className="px-2 py-0.5 bg-lime-400 text-zinc-950 rounded-none border-2 border-zinc-900 text-[10px] font-black uppercase shadow-brutal-sm">
                                    Powermeter
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 rounded-none border border-zinc-900 text-[10px] font-bold">
                                    Estymata
                                  </span>
                                )}
                                {act.has_streams && (
                                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-900 px-1 py-0.5 text-zinc-950 dark:text-zinc-50 font-mono font-bold">
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
            <div className="p-3 bg-rose-200 dark:bg-rose-950 border-2 border-zinc-900 dark:border-zinc-100 rounded-none text-xs text-zinc-950 dark:text-zinc-50 font-mono shadow-brutal-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5 stroke-[2.5]" />
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
              className="px-6 py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs font-black font-mono uppercase tracking-wider shadow-brutal hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isCalibrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Obliczanie bilansu energii & LOO...</span>
                </>
              ) : (
                <>
                  <Sliders className="w-4 h-4 stroke-[2.5]" />
                  <span>Uruchom Auto-Kalibrację</span>
                </>
              )}
            </button>
          </div>

          {/* CALIBRATION RESULTS CARD */}
          {calibrationResult && (
            <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-5 bg-lime-100/60 dark:bg-lime-950/30 shadow-brutal-lg flex flex-col gap-4 animate-fade-in font-mono">
              <div className="flex items-center justify-between border-b-2 border-zinc-900 dark:border-zinc-100 pb-3">
                <div className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50 font-black text-sm uppercase">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                  <span>Wynik Auto-Kalibracji Parametrów</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-none bg-lime-400 text-zinc-950 text-xs font-mono font-black border-2 border-zinc-900 shadow-brutal-sm uppercase">
                  {calibrationResult.badge_text}
                </span>
              </div>

              {/* Main Parameter Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-white dark:bg-[#1c1c1f] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold">CdA (aerodynamic drag area)</span>
                  <div className="text-2xl font-black text-zinc-950 dark:text-zinc-50 font-mono">
                    {calibrationResult.cda.toFixed(3)}{' '}
                    <span className="text-xs font-normal text-zinc-500">±{calibrationResult.cda_std.toFixed(3)} m²</span>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-[#1c1c1f] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold">Crr (rolling resistance)</span>
                  <div className="text-2xl font-black text-zinc-950 dark:text-zinc-50 font-mono">
                    {calibrationResult.crr.toFixed(4)}{' '}
                    <span className="text-xs font-normal text-zinc-500">±{calibrationResult.crr_std.toFixed(4)}</span>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-[#1c1c1f] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold">η (sprawność napędu)</span>
                  <div className="text-2xl font-black text-zinc-950 dark:text-zinc-50 font-mono">
                    {(calibrationResult.eta * 100).toFixed(1)}%{' '}
                    {calibrationResult.eta_fixed ? (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">Domyślna (brak podjazdów)</span>
                    ) : (
                      <span className="text-xs font-normal text-zinc-500">±{(calibrationResult.eta_std * 100).toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* LOO Validation & Statistics Banner */}
              <div className="bg-white dark:bg-[#1c1c1f] p-3.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm text-xs flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span className="text-zinc-900 dark:text-zinc-100">
                    Aktywności: <strong className="font-black">{calibrationResult.n_activities}</strong> • Czyste okna energii: <strong className="font-black">{calibrationResult.total_windows}</strong>
                  </span>
                  {calibrationResult.validation_mean_rmse_kmh !== null && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                      Średni błąd LOO RMSE: {calibrationResult.validation_mean_rmse_kmh} km/h (czas ±{calibrationResult.validation_mean_time_error_pct}%)
                    </span>
                  )}
                </div>

                {calibrationResult.diagnostics.length > 0 && (
                  <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 list-disc list-inside space-y-0.5 font-mono">
                    {calibrationResult.diagnostics.map((diag, i) => (
                      <li key={i}>{diag}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Per-Activity Validation Breakdown */}
              {calibrationResult.activities.length > 0 && (
                <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none overflow-hidden bg-white dark:bg-[#18181b] shadow-brutal-sm text-xs">
                  <div className="px-3.5 py-2 bg-zinc-100 dark:bg-[#121214] border-b-2 border-zinc-900 dark:border-zinc-100 font-black uppercase text-zinc-950 dark:text-zinc-50">
                    Rozbicie wg aktywności & błąd walidacji
                  </div>
                  <div className="divide-y-2 divide-zinc-900 dark:divide-zinc-800 max-h-40 overflow-y-auto font-mono text-[11px]">
                    {calibrationResult.activities.map((act) => (
                      <div key={act.activity_id} className="px-3.5 py-2 flex items-center justify-between hover:bg-amber-50 dark:hover:bg-zinc-800/60">
                        <div className="truncate max-w-xs text-zinc-950 dark:text-zinc-50 font-bold">
                          {act.name || act.activity_id} ({act.distance_km} km)
                        </div>
                        <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                          <span>{act.windows_count} okien</span>
                          {act.loo_speed_rmse_kmh !== null && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
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
                  className="px-6 py-2.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs font-black font-mono uppercase tracking-wider shadow-brutal transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
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
