import React from 'react';
import { Clock, Zap, Gauge, Mountain, Wind, CheckCircle } from 'lucide-react';
import { SimulationSummary, FitSummary } from '../types/simulation';

interface SummaryCardsProps {
  simulationSummary: SimulationSummary | null;
  fitSummary: FitSummary;
  cda: number;
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
}) => {
  const isFaster = (simulationSummary?.time_delta_s ?? 0) > 0;
  const deltaFormatted = simulationSummary ? formatSeconds(simulationSummary.time_delta_s) : '0s';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Delta Czasu Card */}
      <div className={`p-4 rounded-xl border relative overflow-hidden ${
        simulationSummary
          ? isFaster
            ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-100'
            : 'bg-rose-950/30 border-rose-800/60 text-rose-100'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Zysk / Strata Czasu (Delta)
          </span>
          <Clock className={`w-4 h-4 ${isFaster ? 'text-emerald-400' : 'text-rose-400'}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-black font-mono ${isFaster ? 'text-emerald-400' : 'text-rose-400'}`}>
            {simulationSummary ? (isFaster ? `-${deltaFormatted}` : `+${deltaFormatted}`) : '--'}
          </span>
          <span className="text-xs text-slate-400">
            {simulationSummary ? (isFaster ? 'szybciej' : 'wolniej') : ''}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 flex justify-between border-t border-slate-800/60 pt-1.5 font-mono">
          <span>Baza: {formatSeconds(simulationSummary?.baseline_time_s ?? fitSummary.duration_s)}</span>
          <span>Sym: {formatSeconds(simulationSummary?.simulated_time_s ?? fitSummary.duration_s)}</span>
        </div>
      </div>

      {/* 2. Ekwiwalent Mocy Card */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Ekwiwalent Mocy
          </span>
          <Zap className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-amber-300">
            {simulationSummary?.equivalent_power_w
              ? `${Math.round(simulationSummary.equivalent_power_w)} W`
              : `${Math.round(fitSummary.avg_power_w)} W`}
          </span>
          {simulationSummary?.equivalent_power_w && (
            <span className="text-xs text-slate-400 font-mono">
              ({(simulationSummary.equivalent_power_w - fitSummary.avg_power_w) >= 0 ? '+' : ''}
              {Math.round(simulationSummary.equivalent_power_w - fitSummary.avg_power_w)} W)
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 mt-2 border-t border-slate-800/60 pt-1.5">
          Moc potrzebna do zachowania czasu bazowego
        </div>
      </div>

      {/* 3. Prędkość Symulowana vs Bazowa */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Średnia Prędkość
          </span>
          <Gauge className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-teal-300">
            {simulationSummary ? simulationSummary.simulated_avg_speed_kmh.toFixed(1) : fitSummary.avg_speed_kmh.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">km/h</span>
          <span className="text-xs text-slate-500 font-mono">
            (baza: {fitSummary.avg_speed_kmh.toFixed(1)})
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 flex justify-between border-t border-slate-800/60 pt-1.5 font-mono">
          <span>Dystans: {(fitSummary.total_distance_m / 1000).toFixed(2)} km</span>
          <span>Max: {fitSummary.max_speed_kmh.toFixed(1)} km/h</span>
        </div>
      </div>

      {/* 4. Model Fizyczny & Przewyższenie */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Model & Przewyższenie
          </span>
          <Mountain className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-indigo-300">
            +{Math.round(fitSummary.total_elevation_gain_m)} m
          </span>
          <span className="text-xs text-slate-400">
            (-{Math.round(fitSummary.total_elevation_loss_m)} m)
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 flex justify-between border-t border-slate-800/60 pt-1.5 font-mono">
          <span>CdA: {cda.toFixed(3)} m²</span>
          <span>NP: {fitSummary.normalized_power_w ? `${Math.round(fitSummary.normalized_power_w)} W` : '--'}</span>
        </div>
      </div>
    </div>
  );
};
