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
} from 'lucide-react';
import { WindCompass } from './WindCompass';
import { Tooltip } from './Tooltip';

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
      {/* Header & Quick Toggles */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-teal-400" />
          <h3 className="font-semibold text-slate-100 text-sm tracking-wide">
            Sterowanie wiatrem i symulacją
          </h3>
          <Tooltip
            title="Symulacja warunków wiatrowych (What-If)"
            content="Pozwala badać wpływ zmiany prędkości i kierunku wiatru, odwrócenia trasy oraz strategii pacingu na zysk lub stratę czasu. Model oparty jest na równaniu Chunga i wektorowej analizie wiatru pozornego."
            position="bottom"
          />
        </div>
        <button
          type="button"
          onClick={handleResetWeatherClick}
          className="text-xs text-slate-400 hover:text-teal-300 flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-slate-800"
          title="Przywróć oryginalną pogodę ze stacji i zresetuj delty do zera"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset pogody</span>
        </button>
      </div>

      {/* Main Two-Column Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Left Column: Interactive Compass */}
        <div className="flex flex-col items-center justify-center p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 min-w-0">
          <WindCompass
            angle={config.windDirDeg}
            onChange={(angle) => update({ windDirDeg: angle })}
            disabled={config.zeroWind}
            windSpeedMps={config.windSpeedMps}
          />
        </div>

        {/* Right Column: Speed, Toggles, and Route Reversal */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Toggle On/Off Zero Wind */}
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-md shrink-0 ${
                  config.zeroWind ? 'bg-rose-500/15 text-rose-400' : 'bg-teal-500/15 text-teal-400'
                }`}
              >
                {config.zeroWind ? <CloudOff className="w-4 h-4" /> : <Wind className="w-4 h-4" />}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-200">
                  Symulacja bezwietrzna
                </span>
                <Tooltip
                  title="Symulacja bezwietrzna (Zero Wind)"
                  content="Wyzerowanie prędkości wiatru (0 m/s) na całej trasie. Pokazuje czysty potencjał wydolnościowy i wpływ samego profilu terenu na czas przejazdu."
                  physicsNote="Eliminuje składową wiatru atmosferycznego. Prędkość wiatru pozornego równa się wówczas dokładnie prędkości kolarza."
                  position="bottom"
                />
              </div>
            </div>

            {/* Line 2: Setting Option Underneath */}
            <button
              type="button"
              onClick={() => update({ zeroWind: !config.zeroWind })}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] ${
                config.zeroWind
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-teal-500/20 text-teal-300 border border-teal-500/40 hover:bg-teal-500/30'
              }`}
            >
              {config.zeroWind ? 'BEZ WIATRU (0 m/s na trasie)' : 'Z WIATREM (WARUNKI REALNE)'}
            </button>
          </div>

          {/* Wind Speed Slider & Input */}
          <div
            className={`p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex flex-col gap-2.5 transition-opacity ${
              config.zeroWind ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-1.5 min-w-0">
              <label className="text-xs font-semibold text-slate-200">
                Prędkość wiatru przy kolarzu
              </label>
              <Tooltip
                title="Prędkość wiatru przy kolarzu"
                content="Prędkość wiatru rzeczywistego w m/s oraz km/h. Możesz wpisać dokładną wartość lub przesunąć suwak."
                physicsNote="Prędkość wiatru ze stacji meteo (10 m) jest przeliczana profilem Hellmanna na wysokość kolarza (~1.5 m): v_cyclist = v_10 * (1.5/10)^0.2 ~ 0.68 * v_10."
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
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-center font-mono text-teal-300 font-bold focus:outline-none focus:border-teal-500"
                />
                <span className="text-xs text-slate-400 font-medium">m/s</span>
              </div>
              <span className="text-xs text-teal-400 font-mono bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
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
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono px-0.5">
                <span>0 m/s</span>
                <span>5 m/s</span>
                <span>10 m/s</span>
                <span>15 m/s</span>
              </div>
            </div>
          </div>

          {/* Route Reversal Toggle */}
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex flex-col gap-2.5">
            {/* Line 1: Clear Description */}
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-md shrink-0 ${
                  config.reverseRoute ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-200">
                  Odwrócenie trasy („Jazda pod prąd”)
                </span>
                <Tooltip
                  title="Odwróć trasę („Jazda pod prąd”)"
                  content="Odwrócenie kolejności trasy GPS oraz znaków nachylenia terenu (podjazdy stają się zjazdami). Pozwala sprawdzić, jak zmieniłby się czas przy jeździe w przeciwnym kierunku."
                  physicsNote="Umożliwia analizę taktyczną: czy na danej trasie pętlowej przy obecnym kierunku wiatru bardziej opłaca się jechać zgodnie czy przeciwnie do ruchu wskazówek zegara."
                  position="bottom"
                />
              </div>
            </div>

            {/* Line 2: Setting Option Underneath */}
            <button
              type="button"
              onClick={() => update({ reverseRoute: !config.reverseRoute })}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] ${
                config.reverseRoute
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700'
              }`}
            >
              {config.reverseRoute ? 'ODWRÓCONA (JAZDA POD PRĄD)' : 'NORMALNA (ZGODNIE Z KIERUNKIEM GPS)'}
            </button>
          </div>
        </div>
      </div>

      {/* Pacing Model Selector */}
      <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <label className="text-xs font-semibold text-slate-300 block">
            Model generowania mocy (Pacing)
          </label>
          <Tooltip
            title="Strategie generowania mocy (Pacing)"
            content="Wybór sposobu dystrybucji watów wzdłuż trasy w symulacji. Możesz porównać realny profil jazdy z idealnie równym wysiłkiem lub pacingiem adaptacyjnym."
            position="bottom"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              id: 'original',
              label: 'Moc z pliku',
              desc: 'Oryginalny profil watów',
              tooltipTitle: 'Moc z pliku (Original Pacing)',
              tooltipContent: 'Dokładny profil mocy z pliku FIT. Zastosowano wygładzenie okna oraz model bezwładności masy na zjazdach/coasting.',
            },
            {
              id: 'constant_avg',
              label: 'Stała średnia',
              desc: 'Równy wysiłek na trasie',
              tooltipTitle: 'Stała średnia moc (Constant Avg)',
              tooltipContent: 'Każdy odcinek pokonywany jest z dokładnie taką samą mocą równą średniej mocy z pliku FIT (tzw. jazda ergometryczna).',
            },
            {
              id: 'adaptive_slope',
              label: 'Adaptacyjny',
              desc: 'Mniej w dół, więcej w górę',
              tooltipTitle: 'Pacing adaptacyjny (Adaptive Slope)',
              tooltipContent: 'Więcej watów na stromych podjazdach, oszczędzanie energii na zjazdach (przy zachowaniu tej samej średniej mocy całkowitej trasy).',
              tooltipPhysics: 'Fizyka kolarstwa: waty zainwestowane przy małej prędkości pod górę dają znacznie większy zysk czasowy niż te same waty na szybkim zjeździe.',
            },
          ].map((mode) => (
            <div
              key={mode.id}
              onClick={() => update({ pacingMode: mode.id as any })}
              className={`p-2 rounded border text-left cursor-pointer transition-all relative ${
                config.pacingMode === mode.id
                  ? 'bg-teal-950/70 border-teal-500 text-slate-100 ring-1 ring-teal-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{mode.label}</span>
                <Tooltip
                  title={mode.tooltipTitle}
                  content={mode.tooltipContent}
                  physicsNote={mode.tooltipPhysics}
                  position="top"
                />
              </div>
              <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">{mode.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Advanced Cyclist Physics */}
      <div className="border-t border-slate-800 pt-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 py-1"
          >
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>Zaawansowane parametry kolarza i sprzętu (Masa, CdA, Crr, Sprawność)</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </button>
          {showAdvanced && onResetAdvancedDefaults && (
            <button
              type="button"
              onClick={onResetAdvancedDefaults}
              className="text-[11px] text-slate-400 hover:text-teal-300 underline transition-colors px-1"
              title="Przywróć domyślne parametry (78kg, 0.32, 0.004, 0.97)"
            >
              Przywróć domyślne
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 block">Masa zestawu (kg)</label>
                <Tooltip
                  title="Masa całkowita zestawu (kg)"
                  content="Łączna masa kolarza, roweru, bidonów, kasku, butów i osprzętu. Wpływa bezpośrednio na siłę grawitacji na podjazdach i bezwładność kinetyczną."
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
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 block">CdA oporu (m²)</label>
                <Tooltip
                  title="Współczynnik aerodynamiczny CdA (m²)"
                  content="Iloczyn współczynnika oporu aerodynamicznego Cd i pola powierzchni czołowej A. Typowe wartości: TT/czasówka: 0.20-0.24, szosa dolny chwyt: 0.28-0.32, chwyt za klamki: 0.33-0.38, gravel/MTB: 0.38-0.45."
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
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 block">Opór toczenia Crr</label>
                <Tooltip
                  title="Współczynnik oporu toczenia Crr"
                  content="Opór toczenia opon po asfalcie. Nowoczesne opony szosowe tubeless: ~0.003-0.004, opony treningowe z dętką: ~0.0045-0.0055, gravel: ~0.006-0.008."
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
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 block">Sprawność napędu η</label>
                <Tooltip
                  title="Sprawność napędu łańcuchowego η"
                  content="Ułamek energii mechanicznej przekazywanej z korby na tylne koło. Czysty, nasmarowany łańcuch szosowy ma sprawność rzędu 97-98% (0.97 - 0.98)."
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
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
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
            <span>Przeliczanie modelu wektorowego...</span>
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 fill-white" />
            <span>Przelicz symulację („What-If”)</span>
          </>
        )}
      </button>
    </div>
  );
};
