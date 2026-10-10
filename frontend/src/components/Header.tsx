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
    <header className="sticky top-3 z-40 max-w-7xl mx-auto px-4 w-full transition-all duration-300">
      <div className="rounded-3xl backdrop-blur-2xl bg-white/60 dark:bg-slate-950/60 border border-white/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.25)] px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-cyan-500 via-teal-500 to-indigo-500 rounded-2xl shadow-lg shadow-teal-500/20 text-white shrink-0 border border-white/30">
            <Bike className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>AeroBike</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-semibold tracking-wide">Glass Dock</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-md transition-all ${
              isCheckingBackend
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300 cursor-wait'
                : isBackendOnline
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25 cursor-pointer shadow-sm'
                : isBlockedByClient
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-800 dark:text-rose-200 hover:bg-rose-500/30 cursor-pointer shadow-sm ring-1 ring-rose-500/30'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-800 dark:text-rose-300 hover:bg-rose-500/25 cursor-pointer shadow-sm'
            }`}
          >
            {isCheckingBackend ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                <span className="font-mono text-[11px]">{t.backendConnecting}</span>
              </>
            ) : isBackendOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[11px]">{t.backendOnline}</span>
              </>
            ) : isBlockedByClient ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="font-mono text-[11px]">{t.backendBlocked}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-mono text-[11px]">{t.backendOffline}</span>
                <RefreshCw className="w-2.5 h-2.5 ml-0.5 text-rose-500 opacity-80" />
              </>
            )}
          </button>

          {/* Load Demo Route Button */}
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-3.5 py-1.5 bg-white/40 dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-full border border-white/50 dark:border-white/10 backdrop-blur-md flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {t.loadDemo}
          </button>

          {/* Chung VE Modal Button */}
          {hasData && (
            <button
              type="button"
              onClick={onOpenChungModal}
              className="px-3.5 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-xs font-medium rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Award className="w-3.5 h-3.5 text-indigo-500" />
              {t.chungEstimation}
            </button>
          )}

          {/* Auto-Calibration Button */}
          <button
            type="button"
            onClick={onOpenAutoCalibrationModal}
            className="px-3.5 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 text-teal-800 dark:text-teal-300 border border-teal-500/30 text-xs font-medium rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-sm transition-all"
            title="Auto-kalibracja CdA, Crr, η z wielu jazd"
          >
            <Gauge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Auto-Kalibracja</span>
          </button>

          {/* Strava Integration Button */}
          <button
            type="button"
            onClick={onOpenStravaModal}
            className={`px-3.5 py-1.5 border text-xs font-medium rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-sm transition-all ${
              isStravaConnected
                ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-800 dark:text-orange-300 border-orange-500/40'
                : 'bg-white/40 dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border-white/50 dark:border-white/10'
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
            className="px-3 py-1.5 rounded-full bg-white/40 dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold font-mono transition-all backdrop-blur-md shadow-sm flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.themeToggleLight : t.themeToggleDark}
            className="p-2 rounded-full bg-white/40 dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200 transition-all backdrop-blur-md shadow-sm flex items-center justify-center"
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
