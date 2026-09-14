import React, { useState } from 'react';
import {
  Wind,
  CloudOff,
  ArrowRightLeft,
  Sliders,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Info,
} from 'lucide-react';
import { WindCompass } from './WindCompass';
import { Tooltip } from './Tooltip';
import { Translations } from '../i18n/translations';

export interface SimulationConfig {
  zeroWind: boolean;
  windSpeedMps: number;
  windScale: number;
  windDirDeg: number;
  reverseRoute: boolean;
  pacingMode: 'original' | 'constant_avg' | 'adaptive_slope';
  massKg: number;
  cda: number;
  crr: number;
  eta: number;
}

interface SimulationControlsProps {
  config: SimulationConfig;
  onChange: (newConfig: SimulationConfig) => void;
  onRunSimulation: () => void;
  onResetWeather?: () => void;
  onResetAdvancedDefaults?: () => void;
  isLoading: boolean;
  baselineWindSpeedMps?: number;
  baselineWindDirDeg?: number;
  weatherProvider?: string;
  isWeatherFallback?: boolean;
  weatherFallbackReason?: string | null;
  t: Translations['controls'];
  tCompass: Translations['compass'];
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  config,
  onChange,
  onRunSimulation,
  onResetWeather,
  onResetAdvancedDefaults,
  isLoading,
  baselineWindSpeedMps = 4.0,
  baselineWindDirDeg = 90.0,
  weatherProvider = 'Open-Meteo',
  isWeatherFallback = false,
  weatherFallbackReason = null,
  t,
  tCompass,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<SimulationConfig>) => {
    onChange({ ...config, ...partial });
  };

  const handleResetWeatherClick = () => {
    const updated: SimulationConfig = {
      ...config,
      zeroWind: false,
      windSpeedMps: baselineWindSpeedMps,
      windScale: 1.0,
      windDirDeg: baselineWindDirDeg,
      reverseRoute: false,
      pacingMode: 'original',
    };
    onChange(updated);
    if (onResetWeather) {
      onResetWeather();
    } else {
      onRunSimulation();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4 transition-colors duration-200">
      {/* Header & Quick Toggles */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm tracking-wide">
            {t.title}
          </h3>
          <Tooltip
            title={t.tooltipTitle}
            content={t.tooltipContent}
            position="bottom"
          />
        </div>
        <button
          type="button"
          onClick={handleResetWeatherClick}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          title={t.resetWeatherTitle}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t.resetWeather}</span>
        </button>
      </div>

      {/* Alternative Weather Provider Station Notice */}
      {!isWeatherFallback && weatherProvider && weatherProvider !== 'Open-Meteo' && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-500/30 rounded-lg p-2.5 flex items-start gap-2.5 text-sky-900 dark:text-sky-200/90 text-xs leading-relaxed">
          <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-sky-700 dark:text-sky-300">{t.weatherStation} {weatherProvider}</span>{' '}
            {t.weatherStationNotice}
          </div>
        </div>
      )}

      {/* Weather Fallback Alert */}
      {isWeatherFallback && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2.5 text-amber-900 dark:text-amber-200/90 text-xs leading-relaxed">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-amber-700 dark:text-amber-300">{t.isaStation}</span>{' '}
            {t.isaStationNotice}
          </div>
        </div>
      )}

      {/* Main Two-Column Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Left Column: Interactive Compass */}
        <div className="flex flex-col items-center justify-center p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80 min-w-0">
          <WindCompass
            angle={config.windDirDeg}
            onChange={(angle) => update({ windDirDeg: angle })}
            disabled={config.zeroWind}
            windSpeedMps={config.windSpeedMps}
            t={tCompass}
          />
        </div>

        {/* Right Column: Speed, Toggles, and Route Reversal */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Toggle On/Off Zero Wind */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80 flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-md shrink-0 ${
                  config.zeroWind
                    ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-teal-100 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400'
                }`}
              >
                {config.zeroWind ? <CloudOff className="w-4 h-4" /> : <Wind className="w-4 h-4" />}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t.zeroWindTitle}
                </span>
                <Tooltip
                  title={t.zeroWindTitle}
                  content={t.zeroWindDesc}
                  position="bottom"
                />
              </div>
            </div>

            {/* Line 2: Setting Option Underneath */}
            <button
              type="button"
              onClick={() => update({ zeroWind: !config.zeroWind })}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] shadow-sm ${
                config.zeroWind
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 hover:bg-rose-200 dark:hover:bg-rose-500/30'
                  : 'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-500/40 hover:bg-teal-200 dark:hover:bg-teal-500/30'
              }`}
            >
              {config.zeroWind ? '0 m/s' : t.zeroWindDesc}
            </button>
          </div>

          {/* Wind Speed Slider & Input */}
          <div
            className={`p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80 flex flex-col gap-2.5 transition-opacity ${
              config.zeroWind ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-1.5 min-w-0">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t.windSpeedTitle}
              </label>
              <Tooltip
                title={t.windSpeedTooltipTitle}
                content={t.windSpeedTooltipContent}
                position="bottom"
              />
            </div>

            {/* Line 2: Exact Value Input & Metric Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="25"
                  step="0.1"
                  value={Number(config.windSpeedMps.toFixed(1))}
                  onChange={(e) => update({ windSpeedMps: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-center font-mono text-teal-600 dark:text-teal-300 font-bold focus:outline-none focus:border-teal-500"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">m/s</span>
              </div>
              <span className="text-xs text-teal-600 dark:text-teal-400 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2.5 py-1 rounded shadow-sm">
                {(config.windSpeedMps * 3.6).toFixed(1)} km/h
              </span>
            </div>

            {/* Line 3: Setting Option (Slider & Ticks) */}
            <div>
              <input
                type="range"
                min="0"
                max="15"
                step="0.1"
                value={config.windSpeedMps}
                onChange={(e) => update({ windSpeedMps: parseFloat(e.target.value) })}
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono px-0.5">
                <span>0 m/s</span>
                <span>5 m/s</span>
                <span>10 m/s</span>
                <span>15 m/s</span>
              </div>
            </div>
          </div>

          {/* Route Reversal Toggle */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80 flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-md shrink-0 ${
                  config.reverseRoute
                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t.reverseRouteTitle}
                </span>
                <Tooltip
                  title={t.reverseRouteTitle}
                  content={t.reverseRouteDesc}
                  position="bottom"
                />
              </div>
            </div>

            {/* Line 2: Setting Option Underneath */}
            <button
              type="button"
              onClick={() => update({ reverseRoute: !config.reverseRoute })}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] shadow-sm ${
                config.reverseRoute
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 hover:bg-amber-200 dark:hover:bg-amber-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700'
              }`}
            >
              {config.reverseRoute ? t.reverseRouteTitle : t.reverseRouteDesc}
            </button>
          </div>
        </div>
      </div>

      {/* Pacing Model Selector */}
      <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
            {t.pacingStrategyTitle}
          </label>
          <Tooltip
            title={t.pacingStrategyTooltipTitle}
            content={t.pacingStrategyTooltipContent}
            position="bottom"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              id: 'original',
              label: t.pacingOriginal,
              desc: t.pacingOriginalDesc,
            },
            {
              id: 'constant_avg',
              label: t.pacingConstant,
              desc: t.pacingConstantDesc,
            },
            {
              id: 'adaptive_slope',
              label: t.pacingAdaptive,
              desc: t.pacingAdaptiveDesc,
            },
          ].map((mode) => (
            <div
              key={mode.id}
              onClick={() => update({ pacingMode: mode.id as any })}
              className={`p-2 rounded-lg border text-left cursor-pointer transition-all relative shadow-sm ${
                config.pacingMode === mode.id
                  ? 'bg-teal-50 dark:bg-teal-950/70 border-teal-500 text-slate-900 dark:text-slate-100 ring-1 ring-teal-500/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{mode.label}</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">{mode.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Advanced Cyclist Physics */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1.5 py-1 transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>{t.advancedTitle} ({t.advancedSubtitle})</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </button>
          {showAdvanced && onResetAdvancedDefaults && (
            <button
              type="button"
              onClick={onResetAdvancedDefaults}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 underline transition-colors px-1"
              title={t.resetDefaults}
            >
              {t.resetDefaults}
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 bg-slate-50 dark:bg-slate-950/80 rounded-lg border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block">{t.massTitle}</label>
                <Tooltip
                  title={t.massTooltipTitle}
                  content={t.massTooltipContent}
                  position="top"
                />
              </div>
              <input
                type="number"
                step="0.5"
                min="35"
                max="200"
                value={config.massKg}
                onChange={(e) => update({ massKg: parseFloat(e.target.value) || 78 })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-teal-500 shadow-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block">{t.cdaTitle}</label>
                <Tooltip
                  title={t.cdaTooltipTitle}
                  content={t.cdaTooltipContent}
                  position="top"
                />
              </div>
              <input
                type="number"
                step="0.005"
                min="0.1"
                max="0.9"
                value={config.cda}
                onChange={(e) => update({ cda: parseFloat(e.target.value) || 0.32 })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-teal-500 shadow-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block">{t.crrTitle}</label>
                <Tooltip
                  title={t.crrTooltipTitle}
                  content={t.crrTooltipContent}
                  position="top"
                />
              </div>
              <input
                type="number"
                step="0.0005"
                min="0.001"
                max="0.02"
                value={config.crr}
                onChange={(e) => update({ crr: parseFloat(e.target.value) || 0.004 })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-teal-500 shadow-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block">{t.drivetrainLossTitle}</label>
                <Tooltip
                  title={t.etaTooltipTitle}
                  content={t.etaTooltipContent}
                  position="top"
                />
              </div>
              <input
                type="number"
                step="0.01"
                min="0.75"
                max="1.0"
                value={config.eta}
                onChange={(e) => update({ eta: parseFloat(e.target.value) || 0.97 })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-teal-500 shadow-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Run Simulation Action Button */}
      <button
        type="button"
        disabled={isLoading}
        onClick={onRunSimulation}
        className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Przeliczanie...</span>
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 fill-white" />
            <span>{t.title}</span>
          </>
        )}
      </button>
    </div>
  );
};
