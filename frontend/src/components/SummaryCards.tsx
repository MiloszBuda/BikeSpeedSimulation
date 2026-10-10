import React from 'react';
import { Clock, Zap, Gauge, Mountain } from 'lucide-react';
import { SimulationSummary, FitSummary } from '../types/simulation';
import { Tooltip } from './Tooltip';
import { Translations } from '../i18n/translations';

interface SummaryCardsProps {
  simulationSummary: SimulationSummary | null;
  fitSummary: FitSummary;
  cda: number;
  t: Translations['summary'];
}

const formatSeconds = (totalSec: number) => {
  const abs = Math.abs(Math.round(totalSec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  simulationSummary,
  fitSummary,
  cda,
  t,
}) => {
  const deltaSeconds = simulationSummary?.time_delta_s ?? 0;
  const isZeroDelta = Math.abs(deltaSeconds) < 0.5;
  const isFaster = deltaSeconds > 0;
  const deltaFormatted = simulationSummary ? formatSeconds(deltaSeconds) : '0s';

  const baseTimeSec = fitSummary.duration_s > 0 ? fitSummary.duration_s : (simulationSummary?.baseline_time_s ?? 0);
  const simTimeSec = isZeroDelta
    ? baseTimeSec
    : (simulationSummary?.simulated_time_s ?? baseTimeSec);

  const basePowerW = Math.round(fitSummary.avg_power_w);
  const eqPowerW = isZeroDelta
    ? basePowerW
    : Math.round(simulationSummary?.equivalent_power_w ?? basePowerW);
  const powerDiff = isZeroDelta ? 0 : eqPowerW - basePowerW;

  const baseSpeedKmh = isZeroDelta
    ? fitSummary.avg_speed_kmh
    : (simulationSummary?.baseline_avg_speed_kmh ?? fitSummary.avg_speed_kmh);
  const simSpeedKmh = isZeroDelta
    ? fitSummary.avg_speed_kmh
    : (simulationSummary?.simulated_avg_speed_kmh ?? fitSummary.avg_speed_kmh);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Delta Czasu Card */}
      <div className={`p-4 rounded-2xl border relative transition-all duration-200 shadow-nordic ${
        simulationSummary
          ? isZeroDelta
            ? 'bg-white dark:bg-[#0f291e] border-emerald-900/40 text-slate-900 dark:text-emerald-50'
            : isFaster
            ? 'bg-emerald-50/80 dark:bg-[#143828] border-emerald-600/60 text-emerald-950 dark:text-emerald-100'
            : 'bg-orange-50/80 dark:bg-[#2e1910] border-[#d97736]/60 text-orange-950 dark:text-orange-100'
          : 'bg-white dark:bg-[#0f291e] border-emerald-900/40 text-slate-900 dark:text-emerald-50'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t.timeGainLoss}
            </span>
            <Tooltip
              title={t.timeGainTooltipTitle}
              content={t.timeGainTooltipContent}
              physicsNote={t.timeGainTooltipPhysics}
              position="bottom"
            />
          </div>
          <Clock className={`w-4 h-4 ${isZeroDelta ? 'text-emerald-600 dark:text-emerald-400' : isFaster ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#d97736]'}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold font-mono tracking-tight ${
            isZeroDelta ? 'text-emerald-600 dark:text-emerald-400' : isFaster ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#d97736]'
          }`}>
            {simulationSummary ? (isZeroDelta ? '0m 00s' : isFaster ? `-${deltaFormatted}` : `+${deltaFormatted}`) : '--'}
          </span>
          <span className="text-xs text-slate-500 dark:text-emerald-400/80">
            {simulationSummary ? (isZeroDelta ? t.timeMatchBase : isFaster ? t.timeFaster : t.timeSlower) : ''}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 mt-2 flex justify-between border-t border-emerald-900/20 dark:border-emerald-800/40 pt-1.5 font-mono">
          <span>{t.baseTime}: {formatSeconds(baseTimeSec)}</span>
          <span>{t.simTime}: {formatSeconds(simTimeSec)}</span>
        </div>
      </div>

      {/* 2. Ekwiwalent Mocy Card */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-[#0f291e] border-emerald-900/40 text-slate-900 dark:text-emerald-50 relative shadow-nordic transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-[#d97736]">
              {t.eqPower}
            </span>
            <Tooltip
              title={t.eqPowerTooltipTitle}
              content={t.eqPowerTooltipContent}
              physicsNote={t.eqPowerTooltipPhysics}
              position="bottom"
            />
          </div>
          <Zap className="w-4 h-4 text-[#d97736]" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-[#d97736]">
            {eqPowerW} W
          </span>
          <span className="text-xs text-slate-500 dark:text-emerald-400/80 font-mono">
            ({powerDiff >= 0 ? '+' : ''}{powerDiff} W)
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 mt-2 border-t border-emerald-900/20 dark:border-emerald-800/40 pt-1.5 font-medium">
          {isZeroDelta ? t.eqPowerMatch : t.eqPowerRequired}
        </div>
      </div>

      {/* 3. Prędkość Symulowana vs Bazowa */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-[#0f291e] border-emerald-900/40 text-slate-900 dark:text-emerald-50 relative shadow-nordic transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t.avgSpeed}
            </span>
            <Tooltip
              title={t.avgSpeedTooltipTitle}
              content={t.avgSpeedTooltipContent}
              physicsNote={t.avgSpeedTooltipPhysics}
              position="bottom"
            />
          </div>
          <Gauge className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-emerald-100">
            {simSpeedKmh.toFixed(1)}
          </span>
          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">km/h</span>
          <span className="text-xs text-slate-400 dark:text-emerald-500/70 font-mono">
            ({t.baseSpeed}: {baseSpeedKmh.toFixed(1)})
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 mt-2 flex justify-between border-t border-emerald-900/20 dark:border-emerald-800/40 pt-1.5 font-mono">
          <span>{t.distance}: {(fitSummary.total_distance_m / 1000).toFixed(2)} km</span>
          <span>{t.maxSpeed}: {fitSummary.max_speed_kmh.toFixed(1)} km/h</span>
        </div>
      </div>

      {/* 4. Model Fizyczny & Przewyższenie */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-[#0f291e] border-emerald-900/40 text-slate-900 dark:text-emerald-50 relative shadow-nordic transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t.modelElevation}
            </span>
            <Tooltip
              title={t.modelElevationTooltipTitle}
              content={t.modelElevationTooltipContent}
              physicsNote={t.modelElevationTooltipPhysics}
              position="bottom"
            />
          </div>
          <Mountain className="w-4 h-4 text-[#d97736]" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-emerald-100">
            +{Math.round(fitSummary.total_elevation_gain_m)} m
          </span>
          <span className="text-xs text-slate-500 dark:text-emerald-400/80">
            (-{Math.round(fitSummary.total_elevation_loss_m)} m)
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 mt-2 flex justify-between border-t border-emerald-900/20 dark:border-emerald-800/40 pt-1.5 font-mono">
          <span>CdA: {cda.toFixed(3)} m²</span>
          <span>NP: {fitSummary.normalized_power_w ? `${Math.round(fitSummary.normalized_power_w)} W` : '--'}</span>
        </div>
      </div>
    </div>
  );
};
