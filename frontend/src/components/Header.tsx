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
    <header className="border-b-2 border-zinc-900 dark:border-zinc-100 bg-white/75 dark:bg-black/75 backdrop-blur-2xl sticky top-0 z-40 transition-colors duration-200 shadow-[0_4px_0px_#18181b] dark:shadow-[0_4px_0px_#f4f4f5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-400 text-zinc-950 rounded-none border-2 border-zinc-900 shadow-brutal-sm shrink-0">
            <Bike className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-black font-mono text-zinc-950 dark:text-zinc-50 tracking-wider flex items-center gap-2 uppercase">
              <span>AeroBike</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-none border border-zinc-900 dark:border-zinc-100 bg-black dark:bg-white text-white dark:text-black font-mono font-bold">GRID_01</span>
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 text-xs font-mono font-bold shadow-brutal-sm dark:shadow-brutal-sm-dark transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
              isCheckingBackend
                ? 'bg-amber-300 text-zinc-950 cursor-wait'
                : isBackendOnline
                ? 'bg-lime-400 text-zinc-950 hover:bg-lime-300 cursor-pointer'
                : isBlockedByClient
                ? 'bg-rose-400 text-zinc-950 hover:bg-rose-300 cursor-pointer'
                : 'bg-rose-400 text-zinc-950 hover:bg-rose-300 cursor-pointer'
            }`}
          >
            {isCheckingBackend ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-zinc-950" />
                <span className="font-mono text-[11px]">{t.backendConnecting}</span>
              </>
            ) : isBackendOnline ? (
              <>
                <span className="w-2 h-2 bg-zinc-950" />
                <span className="font-mono text-[11px]">{t.backendOnline}</span>
              </>
            ) : isBlockedByClient ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-zinc-950" />
                <span className="font-mono text-[11px]">{t.backendBlocked}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 bg-zinc-950" />
                <span className="font-mono text-[11px]">{t.backendOffline}</span>
                <RefreshCw className="w-2.5 h-2.5 ml-0.5 text-zinc-950" />
              </>
            )}
          </button>

          {/* Load Demo Route Button */}
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 text-xs font-mono font-bold rounded-none border-2 border-zinc-900 dark:border-zinc-100 flex items-center gap-1.5 shadow-brutal-sm dark:shadow-brutal-sm-dark hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {t.loadDemo}
          </button>

          {/* Chung VE Modal Button */}
          {hasData && (
            <button
              type="button"
              onClick={onOpenChungModal}
              className="px-3 py-1.5 bg-cyan-300 text-zinc-950 border-2 border-zinc-900 dark:border-zinc-100 text-xs font-mono font-bold rounded-none flex items-center gap-1.5 shadow-brutal-sm dark:shadow-brutal-sm-dark hover:bg-cyan-200 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Award className="w-3.5 h-3.5 text-zinc-950" />
              {t.chungEstimation}
            </button>
          )}

          {/* Auto-Calibration Button */}
          <button
            type="button"
            onClick={onOpenAutoCalibrationModal}
            className="px-3 py-1.5 bg-lime-300 text-zinc-950 border-2 border-zinc-900 dark:border-zinc-100 text-xs font-mono font-bold rounded-none flex items-center gap-1.5 shadow-brutal-sm dark:shadow-brutal-sm-dark hover:bg-lime-200 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            title="Auto-kalibracja CdA, Crr, η z wielu jazd"
          >
            <Gauge className="w-3.5 h-3.5 text-zinc-950" />
            <span>Auto-Kalibracja</span>
          </button>

          {/* Strava Integration Button */}
          <button
            type="button"
            onClick={onOpenStravaModal}
            className={`px-3 py-1.5 border-2 border-zinc-900 dark:border-zinc-100 text-xs font-mono font-bold rounded-none flex items-center gap-1.5 shadow-brutal-sm dark:shadow-brutal-sm-dark transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
              isStravaConnected
                ? 'bg-orange-400 text-zinc-950 hover:bg-orange-300'
                : 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            title="Integracja ze Stravą i pobieranie strumieni"
          >
            <Bike className="w-3.5 h-3.5 text-zinc-950" />
            <span>Strava</span>
            {isStravaConnected && (
              <span className="w-2 h-2 bg-zinc-950 ml-0.5" />
            )}
          </button>

          {/* Language Switcher (PL / EN) */}
          <button
            type="button"
            onClick={onToggleLang}
            title={t.langToggle}
            className="px-2.5 py-1.5 rounded-none bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 text-zinc-950 dark:text-zinc-50 text-xs font-bold font-mono shadow-brutal-sm dark:shadow-brutal-sm-dark flex items-center gap-1.5 hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Globe className="w-3.5 h-3.5 text-zinc-950 dark:text-zinc-50" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.themeToggleLight : t.themeToggleDark}
            className="p-1.5 rounded-none bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 text-zinc-950 dark:text-zinc-50 shadow-brutal-sm dark:shadow-brutal-sm-dark flex items-center justify-center hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-zinc-950" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
