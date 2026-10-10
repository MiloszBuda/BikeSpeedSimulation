import React from 'react';
import { Bike, Award, Sparkles, Loader2, RefreshCw, ShieldAlert, Sun, Moon, Globe, Gauge } from 'lucide-react';
import { Language, Translations } from '../i18n/translations';

interface HeaderProps {
  isBackendOnline: boolean;
  isCheckingBackend?: boolean;
  isBlockedByClient?: boolean;
  onRetryBackend?: () => void;
  onLoadDemo: () => void;
  onOpenChungModal: () => void;
  onOpenAutoCalibrationModal: () => void;
  onOpenStravaModal: () => void;
  isStravaConnected?: boolean;
  hasData: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
  t: Translations['header'];
}

export const Header: React.FC<HeaderProps> = ({
  isBackendOnline,
  isCheckingBackend = false,
  isBlockedByClient = false,
  onRetryBackend,
  onLoadDemo,
  onOpenChungModal,
  onOpenAutoCalibrationModal,
  onOpenStravaModal,
  isStravaConnected = false,
  hasData,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  t,
}) => {
  return (
    <header className="border-b border-emerald-500/30 bg-[#07090d]/85 backdrop-blur-2xl sticky top-0 z-40 transition-colors duration-200 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-900 border border-emerald-500/60 rounded-none shadow-[0_0_12px_rgba(16,185,129,0.25)] text-emerald-400 shrink-0">
            <Bike className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base font-black font-mono text-white tracking-widest flex items-center gap-2 uppercase">
              <span className="text-emerald-400 font-mono">STEALTH</span>//AERO
              <span className="text-[10px] px-1.5 py-0.5 rounded-none bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono tracking-widest">TACTICAL v2.5</span>
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Action Buttons, Theme, Lang & Status */}
        <div className="flex items-center flex-wrap justify-end gap-2 sm:gap-2.5 w-full md:w-auto ml-auto">
          {/* Interactive Backend Status Badge */}
          <button
            type="button"
            onClick={onRetryBackend}
            disabled={isCheckingBackend}
            title={isBlockedByClient ? t.adblockTooltip : t.renderTooltip}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              isCheckingBackend
                ? 'bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 cursor-wait'
                : isBackendOnline
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer shadow-sm'
                : isBlockedByClient
                ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-600/80 text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-900/60 cursor-pointer shadow-sm ring-1 ring-rose-500/40'
                : 'bg-rose-100 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/40 cursor-pointer shadow-sm'
            }`}
          >
            {isCheckingBackend ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-500 dark:text-amber-400" />
                <span className="font-mono text-[11px]">{t.backendConnecting}</span>
              </>
            ) : isBackendOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[11px]">{t.backendOnline}</span>
              </>
            ) : isBlockedByClient ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 animate-pulse" />
                <span className="font-mono text-[11px]">{t.backendBlocked}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-mono text-[11px]">{t.backendOffline}</span>
                <RefreshCw className="w-2.5 h-2.5 ml-0.5 text-rose-500 dark:text-rose-400 opacity-80" />
              </>
            )}
          </button>

          {/* Load Demo Route Button */}
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            {t.loadDemo}
          </button>

          {/* Chung VE Modal Button */}
          {hasData && (
            <button
              type="button"
              onClick={onOpenChungModal}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Award className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              {t.chungEstimation}
            </button>
          )}

          {/* Auto-Calibration Button */}
          <button
            type="button"
            onClick={onOpenAutoCalibrationModal}
            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/80 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-700/60 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            title="Auto-kalibracja CdA, Crr, η z wielu jazd"
          >
            <Gauge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Auto-Kalibracja</span>
          </button>

          {/* Strava Integration Button */}
          <button
            type="button"
            onClick={onOpenStravaModal}
            className={`px-3 py-1.5 border text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors ${
              isStravaConnected
                ? 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/80 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700/60'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
            title="Integracja ze Stravą i pobieranie strumieni"
          >
            <Bike className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Strava</span>
            {isStravaConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
          </button>

          {/* Language Switcher (PL / EN) */}
          <button
            type="button"
            onClick={onToggleLang}
            title={t.langToggle}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold font-mono transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.themeToggleLight : t.themeToggleDark}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm flex items-center justify-center"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
