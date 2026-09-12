import React from 'react';
import { Clock, Zap, Gauge, Mountain } from 'lucide-react';
import { SimulationSummary, FitSummary } from '../types/simulation';
import { Tooltip } from './Tooltip';

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
      <div className={`p-4 rounded-xl border relative ${
        simulationSummary
          ? isZeroDelta
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : isFaster
            ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-100'
            : 'bg-rose-950/30 border-rose-800/60 text-rose-100'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Zysk / Strata Czasu
            </span>
            <Tooltip
              title="Zysk / Strata Czasu (Delta T)"
              content="Różnica między czasem bazowym trasy (z pliku FIT) a czasem uzyskanym w symulacji (T_baza - T_sym). Wartość zielona oznacza czas zaoszczędzony (szybciej), czerwona stratę (wolniej), a 0s brak zmiany warunków."
              physicsNote="Na trasie zamkniętej (pętla) wiatr ZAWSZE powoduje stratę netto czasu. Opór powietrza rośnie z kwadratem prędkości (Faero ~ v²), a pod wiatr jedziesz wolniej, więc spędzasz na tym odcinku znacznie więcej czasu niż na szybkim powrocie z wiatrem w plecy."
              position="bottom"
            />
          </div>
          <Clock className={`w-4 h-4 ${isZeroDelta ? 'text-teal-400' : isFaster ? 'text-emerald-400' : 'text-rose-400'}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-black font-mono ${
            isZeroDelta ? 'text-teal-300' : isFaster ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {simulationSummary ? (isZeroDelta ? '0m 00s' : isFaster ? `-${deltaFormatted}` : `+${deltaFormatted}`) : '--'}
          </span>
          <span className="text-xs text-slate-400">
            {simulationSummary ? (isZeroDelta ? '(zgodny z bazą)' : isFaster ? 'szybciej' : 'wolniej') : ''}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 flex justify-between border-t border-slate-800/60 pt-1.5 font-mono">
          <span>Baza: {formatSeconds(baseTimeSec)}</span>
          <span>Sym: {formatSeconds(simTimeSec)}</span>
        </div>
      </div>

      {/* 2. Ekwiwalent Mocy Card */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ekwiwalent Mocy
            </span>
            <Tooltip
              title="Ekwiwalent Mocy (Equivalent Power)"
              content="Średnia moc kolarza w watach, jaka byłaby wymagana w nowych warunkach atmosferycznych, aby pokonać trasę w dokładnie takim samym czasie jak w przejeździe bazowym."
              physicsNote="Wyliczany numerycznie metodą bisekcji na równaniu bilansu mocy i oporów Chunga z zachowaniem kinetyki bezwładności masy kolarza i roweru na zjazdach."
              position="bottom"
            />
          </div>
          <Zap className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-amber-300">
            {eqPowerW} W
          </span>
          <span className="text-xs text-slate-400 font-mono">
            ({powerDiff >= 0 ? '+' : ''}{powerDiff} W)
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 border-t border-slate-800/60 pt-1.5">
          {isZeroDelta ? 'Moc zgodna z bazową z pliku' : 'Moc potrzebna do zachowania czasu bazowego'}
        </div>
      </div>

      {/* 3. Prędkość Symulowana vs Bazowa */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Średnia Prędkość
            </span>
            <Tooltip
              title="Prędkość i Dystans"
              content="Porównanie średniej prędkości uzyskanej z modelu symulacyjnego z rzeczywistą średnią prędkością zarejestrowaną w pliku FIT."
              physicsNote="Model przelicza wektorowo kąt wiatru pozornego (apparent wind) i opór aerodynamiczny dla każdego 5-metrowego odcinka trasy."
              position="bottom"
            />
          </div>
          <Gauge className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-teal-300">
            {simSpeedKmh.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">km/h</span>
          <span className="text-xs text-slate-500 font-mono">
            (baza: {baseSpeedKmh.toFixed(1)})
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 flex justify-between border-t border-slate-800/60 pt-1.5 font-mono">
          <span>Dystans: {(fitSummary.total_distance_m / 1000).toFixed(2)} km</span>
          <span>Max: {fitSummary.max_speed_kmh.toFixed(1)} km/h</span>
        </div>
      </div>

      {/* 4. Model Fizyczny & Przewyższenie */}
      <div className="p-4 rounded-xl border bg-slate-900 border-slate-800 text-slate-100 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Model & Przewyższenie
            </span>
            <Tooltip
              title="Parametry Fizyczne i Moc Znormalizowana"
              content="CdA: Współczynnik oporu aerodynamicznego × pole powierzchni czołowej [m²]. Przewyższenie: Sumaryczne podjazdy wygładzone filtrem Savitzky-Golay usuwającym szum barometryczny. NP: Znormalizowana moc fizjologiczna (wg algorytmu dr. Andrew Coggana)."
              physicsNote="Moc znormalizowana NP uwzględnia fizjologiczny koszt szarpanej jazdy (podnoszenie mocy do 4. potęgi) w odróżnieniu od prostej średniej arytmetycznej."
              position="bottom"
            />
          </div>
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
