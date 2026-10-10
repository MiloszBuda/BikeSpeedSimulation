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
      if (clientId) {
        localStorage.setItem('strava_client_id', clientId);
      }
      if (clientSecret) {
        localStorage.setItem('strava_client_secret', clientSecret);
      }
      // Preserve current application pathname (crucial for GitHub Pages subpath e.g. /BikeSpeedSimulation/)
      const redirectUri = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') + '/';
      const { auth_url } = await getStravaAuthUrl(clientId || undefined, redirectUri);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl text-white shadow-md shadow-orange-500/20">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Integracja ze Stravą (API & Strumienie)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pobieraj 1 Hz strumienie telemetryczne (czas, dystans, moc, GPS) bez ręcznego eksportu .FIT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800/80 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800/80 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Connection Status Card */}
          {authStatus?.connected ? (
            <div className="p-4 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {authStatus.athlete?.profile ? (
                  <img
                    src={authStatus.athlete.profile}
                    alt="Strava Avatar"
                    className="w-11 h-11 rounded-full border-2 border-orange-400 shadow-sm"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                    {authStatus.athlete?.firstname?.[0] || 'S'}
                  </div>
                )}
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                    <span>
                      {authStatus.athlete?.firstname} {authStatus.athlete?.lastname}
                    </span>
                    <span className="px-2 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800">
                      Połączono
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {authStatus.athlete?.city && (
                      <span>{authStatus.athlete.city}, {authStatus.athlete.country}</span>
                    )}
                    <span>•</span>
                    <span className="font-mono text-teal-600 dark:text-teal-400">
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
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Odśwież</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  Rozłącz
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-sm">
                <Key className="w-4 h-4 text-orange-500" />
                <span>Konfiguracja aplikacji Strava API</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Aby autoryzować pobieranie aktywności, aplikacja wymaga zarejestrowanego identyfikatora w panelu deweloperskim Stravy:{' '}
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-600 dark:text-orange-400 underline font-semibold inline-flex items-center gap-0.5"
                >
                  strava.com/settings/api <ExternalLink className="w-3 h-3" />
                </a>
                . W panelu Stravy w polu <strong>Authorization Callback Domain</strong> wpisz dokładnie:{' '}
                <code className="bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 font-bold px-1.5 py-0.5 rounded font-mono">
                  {window.location.hostname}
                </code>{' '}
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  (samą nazwę domeny bez portu i protokołu — np. wpisz <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">localhost</code>, NIE wpisuj <code className="font-mono line-through text-rose-500">localhost:5173</code>).
                </span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Client ID:
                  </label>
                  <input
                    type="text"
                    placeholder="np. 123456"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Client Secret:
                  </label>
                  <input
                    type="password"
                    placeholder="np. 78a9bc..."
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={handleConnect}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-[0.99]"
                >
                  <Bike className="w-4 h-4" />
                  <span>Zaloguj przez Strava (OAuth)</span>
                </button>
              </div>
            </div>
          )}

          {/* Activity Explorer Section */}
          {authStatus?.connected && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Twoje aktywności na Stravie ({filteredActivities.length})
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={onlyPower}
                      onChange={(e) => setOnlyPower(e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Tylko z miernikiem mocy</span>
                  </label>
                </div>
              </div>

              {/* Activities Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {isLoading && activities.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                      <span>Ładowanie listy aktywności...</span>
                    </div>
                  ) : filteredActivities.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
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
                          className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {act.name}
                              </span>
                              <a
                                href={`https://www.strava.com/activities/${act.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-orange-500"
                                title="Zobacz na Strava.com"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{dateStr}</span>
                              <span>•</span>
                              <span>{distKm} km</span>
                              <span>•</span>
                              <span>{durMin} min</span>
                              {act.average_watts && (
                                <>
                                  <span>•</span>
                                  <span className="text-orange-600 dark:text-orange-400 font-semibold">
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
                              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800">
                                Powermeter
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[10px]">
                                Estymata
                              </span>
                            )}

                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleLoadActivity(act)}
                              className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                            >
                              {isProcessing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Pobieranie...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
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
