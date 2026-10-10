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
  calibrationBadge?: string | null;
  onResetCalibrationBadge?: () => void;
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
  calibrationBadge = null,
  onResetCalibrationBadge,
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
    <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-5 shadow-brutal dark:shadow-brutal-dark flex flex-col gap-4 transition-colors duration-200">
      {/* Header & Quick Toggles */}
      <div className="flex items-center justify-between border-b-2 border-zinc-900 dark:border-zinc-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-400 text-zinc-950 border-2 border-zinc-900 shadow-brutal-sm shrink-0">
            <Sliders className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h3 className="font-mono font-black text-zinc-950 dark:text-zinc-50 text-sm uppercase tracking-wider">
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
          className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-zinc-50 flex items-center gap-1.5 transition-all px-2.5 py-1 rounded-none border-2 border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          title={t.resetWeatherTitle}
        >
          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{t.resetWeather}</span>
        </button>
      </div>

      {/* Alternative Weather Provider Station Notice */}
      {!isWeatherFallback && weatherProvider && weatherProvider !== 'Open-Meteo' && (
        <div className="bg-amber-100 dark:bg-amber-950/60 border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-3 flex items-start gap-2.5 text-zinc-950 dark:text-zinc-100 text-xs font-mono shadow-brutal-sm leading-relaxed">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 stroke-[2.5]" />
          <div className="flex-1">
            <span className="font-black text-amber-800 dark:text-amber-300 uppercase">{t.weatherStation} {weatherProvider}:</span>{' '}
            {t.weatherStationNotice}
          </div>
        </div>
      )}

      {/* Weather Fallback Alert */}
      {isWeatherFallback && (
        <div className="bg-amber-100 dark:bg-amber-950/60 border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-3 flex items-start gap-2.5 text-zinc-950 dark:text-zinc-100 text-xs font-mono shadow-brutal-sm leading-relaxed">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 stroke-[2.5]" />
          <div className="flex-1">
            <span className="font-black text-amber-800 dark:text-amber-300 uppercase">{t.isaStation}:</span>{' '}
            {t.isaStationNotice}
          </div>
        </div>
      )}

      {/* Main Two-Column Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Left Column: Interactive Compass */}
        <div className="flex flex-col p-4 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark min-w-0 h-full">
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
          <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-none border-2 border-zinc-900 shrink-0 shadow-brutal-sm ${
                  config.zeroWind
                    ? 'bg-rose-400 text-zinc-950'
                    : 'bg-emerald-400 text-zinc-950'
                }`}
              >
                {config.zeroWind ? <CloudOff className="w-4 h-4 stroke-[2.5]" /> : <Wind className="w-4 h-4 stroke-[2.5]" />}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono font-bold uppercase tracking-wide text-zinc-950 dark:text-zinc-50">
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
              className={`w-full py-2 px-3 text-xs font-mono font-black uppercase rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm transition-all flex items-center justify-center gap-2 hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                config.zeroWind
                  ? 'bg-rose-400 text-zinc-950 hover:bg-rose-300'
                  : 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300'
              }`}
            >
              {config.zeroWind ? '0 m/s' : t.zeroWindDesc}
            </button>
          </div>

          {/* Wind Speed Slider & Input */}
          <div
            className={`p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark flex flex-col gap-2.5 transition-opacity ${
              config.zeroWind ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-1.5 min-w-0">
              <label className="text-xs font-mono font-bold uppercase tracking-wide text-zinc-950 dark:text-zinc-50">
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
                  className="w-20 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2 py-1 text-xs text-center font-mono font-bold text-zinc-950 dark:text-zinc-50 shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-300 font-mono font-bold">m/s</span>
              </div>
              <span className="text-xs font-mono font-black bg-amber-300 dark:bg-amber-400 text-zinc-950 border-2 border-zinc-900 dark:border-zinc-100 px-2.5 py-1 rounded-none shadow-brutal-sm">
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
                className="w-full accent-amber-500 cursor-pointer h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded-none border border-zinc-900 dark:border-zinc-400"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 dark:text-zinc-400 mt-1 font-mono font-bold px-0.5">
                <span>0 m/s</span>
                <span>5 m/s</span>
                <span>10 m/s</span>
                <span>15 m/s</span>
              </div>
            </div>
          </div>

          {/* Route Reversal Toggle */}
          <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-none border-2 border-zinc-900 shrink-0 shadow-brutal-sm ${
                  config.reverseRoute
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono font-bold uppercase tracking-wide text-zinc-950 dark:text-zinc-50">
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
              className={`w-full py-2 px-3 text-xs font-mono font-black uppercase rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm transition-all flex items-center justify-center gap-2 hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                config.reverseRoute
                  ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                  : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {config.reverseRoute ? t.reverseRouteTitle : t.reverseRouteDesc}
            </button>
          </div>
        </div>
      </div>

      {/* Pacing Model Selector */}
      <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400 stroke-[2.5]" />
          <label className="text-xs font-mono font-bold uppercase tracking-wide text-zinc-950 dark:text-zinc-50 block">
            {t.pacingStrategyTitle}
          </label>
          <Tooltip
            title={t.pacingStrategyTooltipTitle}
            content={t.pacingStrategyTooltipContent}
            position="bottom"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              className={`p-2.5 rounded-none border-2 text-left cursor-pointer transition-all relative font-mono shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                config.pacingMode === mode.id
                  ? 'bg-amber-300 dark:bg-amber-400 text-zinc-950 border-zinc-900 dark:border-zinc-100 font-black'
                  : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-900 dark:border-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase">{mode.label}</span>
              </div>
              <span className="text-[10px] text-zinc-700 dark:text-zinc-300 leading-tight block mt-1">{mode.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Advanced Cyclist Physics */}
      <div className="border-t-2 border-zinc-900 dark:border-zinc-100 pt-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 dark:text-zinc-50 hover:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1.5 py-1 transition-colors"
            >
              <Activity className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t.advancedTitle} ({t.advancedSubtitle})</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4 ml-1 stroke-[2.5]" /> : <ChevronDown className="w-4 h-4 ml-1 stroke-[2.5]" />}
            </button>

            {calibrationBadge && (
              <span
                className="px-2.5 py-0.5 rounded-none bg-emerald-300 dark:bg-emerald-400 border-2 border-zinc-900 dark:border-zinc-100 text-zinc-950 text-[10px] font-mono font-black shadow-brutal-sm flex items-center gap-1"
                title="Wartości wyznaczone z bilansu energii (auto-kalibracja)"
              >
                <span>{calibrationBadge}</span>
                {onResetCalibrationBadge && (
                  <button
                    type="button"
                    onClick={onResetCalibrationBadge}
                    className="ml-1 text-zinc-950 hover:text-rose-600 font-black text-xs"
                    title="Przywróć domyślne parametry"
                  >
                    ×
                  </button>
                )}
              </span>
            )}
          </div>
          {showAdvanced && onResetAdvancedDefaults && (
            <button
              type="button"
              onClick={onResetAdvancedDefaults}
              className="text-[11px] font-mono font-bold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 underline transition-colors px-1"
              title={t.resetDefaults}
            >
              {t.resetDefaults}
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm dark:shadow-brutal-sm-dark">
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-h-[38px]">
                <label className="text-[11px] font-mono font-bold uppercase tracking-tight text-zinc-700 dark:text-zinc-300 leading-tight">{t.massTitle}</label>
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
                className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2 py-1.5 h-8 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold text-center shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
              />
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-h-[38px]">
                <label className="text-[11px] font-mono font-bold uppercase tracking-tight text-zinc-700 dark:text-zinc-300 leading-tight">{t.cdaTitle}</label>
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
                className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2 py-1.5 h-8 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold text-center shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
              />
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-h-[38px]">
                <label className="text-[11px] font-mono font-bold uppercase tracking-tight text-zinc-700 dark:text-zinc-300 leading-tight">{t.crrTitle}</label>
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
                className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2 py-1.5 h-8 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold text-center shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
              />
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-h-[38px]">
                <label className="text-[11px] font-mono font-bold uppercase tracking-tight text-zinc-700 dark:text-zinc-300 leading-tight">{t.drivetrainLossTitle}</label>
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
                className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-none px-2 py-1.5 h-8 text-xs text-zinc-950 dark:text-zinc-50 font-mono font-bold text-center shadow-brutal-sm focus:outline-none focus:bg-amber-100 dark:focus:bg-zinc-800"
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
        className="w-full py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 text-sm font-black font-mono uppercase tracking-widest rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal dark:shadow-brutal-dark flex items-center justify-center gap-2 transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            <span>Przeliczanie...</span>
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 fill-zinc-950 stroke-zinc-950" />
            <span>{t.title}</span>
          </>
        )}
      </button>
    </div>
  );
};
