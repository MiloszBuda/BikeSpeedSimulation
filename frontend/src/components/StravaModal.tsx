import React, { useState, useEffect } from 'react';
import {
  X,
  Bike,
  ExternalLink,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Key,
  ShieldCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  StravaActivityMeta,
  StravaAuthStatusResponse,
  FitProcessResponse,
} from '../types/simulation';
import {
  getStravaAuthStatus,
  getStravaAuthUrl,
  disconnectStrava,
  getStravaActivities,
  processStravaActivity,
} from '../services/api';

interface StravaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectActivityForSimulation: (data: FitProcessResponse, activityName: string) => void;
}

export const StravaModal: React.FC<StravaModalProps> = ({
  isOpen,
  onClose,
  onSelectActivityForSimulation,
}) => {
  const [authStatus, setAuthStatus] = useState<StravaAuthStatusResponse | null>(null);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('strava_client_id') || '');
  const [clientSecret, setClientSecret] = useState<string>(() => localStorage.getItem('strava_client_secret') || '');

  const [activities, setActivities] = useState<StravaActivityMeta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessingActivityId, setIsProcessingActivityId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [onlyPower, setOnlyPower] = useState<boolean>(false);
  const [showCustomConfig, setShowCustomConfig] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      checkStatusAndLoad();
    }
  }, [isOpen]);

  const checkStatusAndLoad = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const st = await getStravaAuthStatus();
      setAuthStatus(st);
      if (st.connected) {
        const acts = await getStravaActivities({ page: 1, perPage: 30 });
        setActivities(acts.activities);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd sprawdzania statusu Stravy');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const trimmedCid = clientId.trim();
      const trimmedSec = clientSecret.trim();

      if (trimmedCid) {
        localStorage.setItem('strava_client_id', trimmedCid);
      } else {
        localStorage.removeItem('strava_client_id');
      }
      if (trimmedSec) {
        localStorage.setItem('strava_client_secret', trimmedSec);
      } else {
        localStorage.removeItem('strava_client_secret');
      }

      // If server does not have global credentials and user hasn't provided custom client_id
      if (!authStatus?.has_credentials && !trimmedCid) {
        setShowCustomConfig(true);
        setErrorMsg('Serwer nie ma skonfigurowanych zmiennych STRAVA_CLIENT_ID / SECRET. Wprowadź Client ID i Client Secret poniżej lub skonfiguruj serwer.');
        return;
      }

      setErrorMsg(null);
      // Preserve current application pathname (crucial for GitHub Pages subpath e.g. /BikeSpeedSimulation/)
      const redirectUri = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') + '/';
      const { auth_url } = await getStravaAuthUrl(trimmedCid || undefined, redirectUri);
      window.location.href = auth_url;
    } catch (err: any) {
      setErrorMsg(err.message || 'Nie udało się wygenerować adresu autoryzacji Strava');
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await disconnectStrava();
      setAuthStatus({ connected: false, scopes: [], has_credentials: false });
      setActivities([]);
      setSuccessMsg('Rozłączono konto Strava.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd podczas rozłączania konta');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshActivities = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const acts = await getStravaActivities({ page, perPage: 30, forceRefresh: true });
      setActivities(acts.activities);
      setSuccessMsg('Zaktualizowano listę aktywności ze Stravy.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd pobierania aktywności');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadActivity = async (act: StravaActivityMeta) => {
    setIsProcessingActivityId(act.id);
    setErrorMsg(null);
    try {
      const processed = await processStravaActivity(act.id);
      onSelectActivityForSimulation(processed, act.name);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || `Nie udało się załadować aktywności ${act.name}`);
    } finally {
      setIsProcessingActivityId(null);
    }
  };

  if (!isOpen) return null;

  const filteredActivities = activities.filter((a) => !onlyPower || a.device_watts);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none w-full max-w-4xl shadow-brutal-lg dark:shadow-brutal-lg-dark flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b-2 border-zinc-900 dark:border-zinc-100 flex items-center justify-between bg-zinc-50 dark:bg-[#121214]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FC4C02] text-white border-2 border-zinc-900 shadow-brutal-sm rounded-none shrink-0">
              <Bike className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black font-mono uppercase tracking-wider text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                <span>Integracja ze Stravą</span>
                <span className="text-[10px] px-2 py-0.5 bg-orange-400 text-zinc-950 border-2 border-zinc-900 font-black shadow-brutal-sm">API v3</span>
              </h2>
              <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mt-0.5">
                Strumienie telemetryczne 1 Hz (czas, dystans, moc, GPS) bez ręcznego wgrywania .FIT
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
          {/* Messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-200 dark:bg-rose-950 border-2 border-zinc-900 dark:border-zinc-100 rounded-none text-xs text-zinc-950 dark:text-zinc-50 font-mono shadow-brutal-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5 stroke-[2.5]" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-200 dark:bg-emerald-950 border-2 border-zinc-900 dark:border-zinc-100 rounded-none text-xs text-zinc-950 dark:text-zinc-50 font-mono shadow-brutal-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5 stroke-[2.5]" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Connection Status Card */}
          {authStatus?.connected ? (
            <div className="p-4 bg-orange-100/70 dark:bg-orange-950/40 border-2 border-zinc-900 dark:border-zinc-100 rounded-none shadow-brutal flex flex-wrap items-center justify-between gap-4 font-mono">
              <div className="flex items-center gap-3.5">
                {authStatus.athlete?.profile ? (
                  <img
                    src={authStatus.athlete.profile}
                    alt="Strava Avatar"
                    className="w-12 h-12 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-none bg-[#FC4C02] text-white font-black flex items-center justify-center text-base border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
                    {authStatus.athlete?.firstname?.[0] || 'S'}
                  </div>
                )}
                <div>
                  <div className="font-black text-zinc-950 dark:text-zinc-50 text-sm flex items-center gap-2">
                    <span>
                      {authStatus.athlete?.firstname} {authStatus.athlete?.lastname}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-400 text-zinc-950 rounded-none border-2 border-zinc-900 text-[10px] font-black uppercase shadow-brutal-sm">
                      Połączono
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mt-0.5">
                    {authStatus.athlete?.city && (
                      <span>{authStatus.athlete.city}, {authStatus.athlete.country}</span>
                    )}
                    <span>•</span>
                    <span className="font-bold text-orange-700 dark:text-orange-400">
                      Zakres: activity:read_all
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshActivities}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-2 border-zinc-900 dark:border-zinc-100 text-zinc-950 dark:text-zinc-50 text-xs font-bold rounded-none shadow-brutal-sm transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Odśwież</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 bg-rose-400 hover:bg-rose-300 text-zinc-950 border-2 border-zinc-900 dark:border-zinc-100 text-xs font-black uppercase rounded-none shadow-brutal-sm transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  Rozłącz
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-6 border-2 border-zinc-900 dark:border-zinc-100 rounded-none bg-orange-50 dark:bg-[#18181b] flex flex-col gap-5 shadow-brutal font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-none bg-[#FC4C02] text-white border-2 border-zinc-900 shadow-brutal-sm flex items-center justify-center shrink-0">
                    <Bike className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="font-black text-zinc-950 dark:text-zinc-50 text-base uppercase tracking-wide">
                      Połącz z kontem Strava
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                      Bezpośrednia synchronizacja aktywności z miernika mocy do symulacji i kalibracji
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="px-6 py-3 bg-[#FC4C02] hover:bg-[#E34402] text-white rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-sm font-black font-mono uppercase tracking-wider shadow-brutal hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-2.5 transition-all shrink-0 cursor-pointer"
                >
                  <Bike className="w-4 h-4 stroke-[2.5]" />
                  <span>Połącz ze Stravą</span>
                  <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              {/* Benefits list */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t-2 border-zinc-900 dark:border-zinc-100 text-xs">
                <div className="flex items-start gap-2 bg-white dark:bg-zinc-900 p-2.5 border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 stroke-[2.5]" />
                  <div>
                    <span className="font-black text-zinc-950 dark:text-zinc-50 uppercase block">Strumienie 1 Hz</span>
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">Moc, prędkość, profil i wiatr sekunda po sekundzie</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-white dark:bg-zinc-900 p-2.5 border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 stroke-[2.5]" />
                  <div>
                    <span className="font-black text-zinc-950 dark:text-zinc-50 uppercase block">Auto-kalibracja aero</span>
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">Wyznaczanie realnego CdA, Crr i sprawności napędu η</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-white dark:bg-zinc-900 p-2.5 border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
                  <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 stroke-[2.5]" />
                  <div>
                    <span className="font-black text-zinc-950 dark:text-zinc-50 uppercase block">OAuth 2.0 & Bezpieczeństwo</span>
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">Tokeny serwerowe, zero haseł, bezpieczna autoryzacja</span>
                  </div>
                </div>
              </div>

              {/* Collapsible Advanced Developer API Settings */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomConfig(!showCustomConfig)}
                  className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Key className="w-3.5 h-3.5 text-orange-500 stroke-[2.5]" />
                  <span>Zaawansowane: własna aplikacja Strava API (opcjonalne)</span>
                  {showCustomConfig ? <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {authStatus?.has_credentials && (
                    <span className="ml-1.5 px-2 py-0.5 bg-emerald-300 text-zinc-950 border border-zinc-900 text-[10px] font-black uppercase">
                      Serwer skonfigurowany
                    </span>
                  )}
                </button>

                {showCustomConfig && (
                  <div className="mt-3 p-4 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm flex flex-col gap-3 text-xs animate-fade-in">
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      Domyślnie używana jest globalna konfiguracja serwera. Jeśli uruchamiasz backend lokalnie lub chcesz użyć własnej aplikacji ze{' '}
                      <a
                        href="https://www.strava.com/settings/api"
                        target="_blank"
                        rel="noreferrer"
                        className="text-orange-600 dark:text-orange-400 underline font-black inline-flex items-center gap-0.5"
                      >
                        strava.com/settings/api <ExternalLink className="w-3 h-3 stroke-[2.5]" />
                      </a>
                      , podaj poniższe dane:
                    </p>
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 border-2 border-zinc-900 dark:border-zinc-100 text-zinc-950 dark:text-zinc-100 text-[11px] shadow-brutal-sm">
                      W panelu Stravy w polu <strong>Authorization Callback Domain</strong> wpisz: <code className="font-black bg-amber-300 px-1 py-0.5 border border-zinc-900 text-zinc-950">{window.location.hostname}</code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-zinc-800 dark:text-zinc-200 font-bold uppercase mb-1">
                          Client ID:
                        </label>
                        <input
                          type="text"
                          placeholder="np. 123456"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-800 dark:text-zinc-200 font-bold uppercase mb-1">
                          Client Secret:
                        </label>
                        <input
                          type="password"
                          placeholder="np. 78a9bc..."
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Explorer Section */}
          {authStatus?.connected && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b-2 border-zinc-900 dark:border-zinc-100 pb-2.5">
                <div className="font-black uppercase tracking-wide text-zinc-950 dark:text-zinc-50">
                  Twoje aktywności na Stravie ({filteredActivities.length})
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-800 dark:text-zinc-200 font-bold">
                    <input
                      type="checkbox"
                      checked={onlyPower}
                      onChange={(e) => setOnlyPower(e.target.checked)}
                      className="w-4 h-4 rounded-none border-2 border-zinc-900 accent-[#FC4C02]"
                    />
                    <span>Tylko z miernikiem mocy</span>
                  </label>
                </div>
              </div>

              {/* Activities Table */}
              <div className="border-2 border-zinc-900 dark:border-zinc-100 rounded-none overflow-hidden bg-white dark:bg-[#18181b] shadow-brutal-sm">
                <div className="max-h-80 overflow-y-auto divide-y-2 divide-zinc-900 dark:divide-zinc-800 text-xs">
                  {isLoading && activities.length === 0 ? (
                    <div className="p-8 text-center text-zinc-600 dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                      <span>Ładowanie listy aktywności...</span>
                    </div>
                  ) : filteredActivities.length === 0 ? (
                    <div className="p-8 text-center text-zinc-600 dark:text-zinc-400 font-bold">
                      Brak aktywności spełniających wybrane kryteria.
                    </div>
                  ) : (
                    filteredActivities.map((act) => {
                      const dateStr = act.start_date
                        ? new Date(act.start_date).toLocaleDateString()
                        : '-';
                      const distKm = (act.distance_m / 1000).toFixed(1);
                      const durMin = (act.moving_time_s / 60).toFixed(0);
                      const isProcessing = isProcessingActivityId === act.id;

                      return (
                        <div
                          key={act.id}
                          className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-amber-50 dark:hover:bg-zinc-800/80 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-950 dark:text-zinc-50 truncate">
                                {act.name}
                              </span>
                              <a
                                href={`https://www.strava.com/activities/${act.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-zinc-500 hover:text-orange-500"
                                title="Zobacz na Strava.com"
                              >
                                <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                              </a>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 font-mono">
                              <span>{dateStr}</span>
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
                              <span>•</span>
                              <span>+{Math.round(act.total_elevation_gain_m)} m</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {act.device_watts ? (
                              <span className="px-2 py-0.5 bg-lime-400 text-zinc-950 rounded-none border-2 border-zinc-900 text-[10px] font-black uppercase shadow-brutal-sm">
                                Powermeter
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 rounded-none border border-zinc-900 text-[10px] font-bold">
                                Estymata
                              </span>
                            )}

                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleLoadActivity(act)}
                              className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs font-black font-mono uppercase shadow-brutal-sm transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isProcessing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Pobieranie...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-zinc-950 stroke-zinc-950" />
                                  <span>Załaduj do symulacji</span>
                                </>
                              )}
                            </button>
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
      </div>
    </div>
  );
};
