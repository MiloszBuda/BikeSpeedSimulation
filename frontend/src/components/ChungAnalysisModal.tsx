import React from 'react';
import ReactECharts from 'echarts-for-react';
import { X, Award, CheckCircle2 } from 'lucide-react';
import { ChungEstimateResponse } from '../types/simulation';
import { Translations } from '../i18n/translations';

interface ChungAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  chungData: ChungEstimateResponse | null;
  onApplyCda?: (cda: number, crr: number) => void;
  theme?: 'dark' | 'light';
  t: Translations['chung'];
}

export const ChungAnalysisModal: React.FC<ChungAnalysisModalProps> = ({
  isOpen,
  onClose,
  chungData,
  onApplyCda,
  theme = 'dark',
  t,
}) => {
  if (!isOpen || !chungData) return null;

  const isDark = theme === 'dark';
  const tooltipBg = isDark ? 'rgba(28, 28, 31, 0.98)' : 'rgba(255, 255, 255, 0.98)';
  const tooltipBorder = isDark ? '#f4f4f5' : '#18181b';
  const tooltipText = isDark ? '#f4f4f5' : '#18181b';
  const splitLineColor = isDark ? '#27272a' : '#e4e4e7';
  const axisTextColor = isDark ? '#a1a1aa' : '#52525b';

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 2,
      textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'monospace' },
    },
    legend: {
      data: [t.realElevation, t.virtualElevation],
      textStyle: { color: axisTextColor, fontSize: 11, fontFamily: 'monospace' },
      top: 0,
    },
    grid: { left: '4%', right: '4%', top: '15%', bottom: '10%' },
    xAxis: {
      type: 'category',
      data: chungData.time_offset_s.map((s) => `${s}s`),
      axisLine: { lineStyle: { color: isDark ? '#52525b' : '#a1a1aa' } },
      axisLabel: { color: axisTextColor, fontSize: 10, fontFamily: 'monospace' },
    },
    yAxis: {
      type: 'value',
      name: t.elevationAxis,
      scale: true,
      splitLine: { lineStyle: { color: splitLineColor } },
      axisLabel: { color: axisTextColor, fontSize: 10, fontFamily: 'monospace' },
      nameTextStyle: { color: axisTextColor, fontSize: 10, fontFamily: 'monospace' },
    },
    series: [
      {
        name: t.realElevation,
        type: 'line',
        data: chungData.real_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: isDark ? '#818cf8' : '#6366f1', width: 2.5 },
      },
      {
        name: t.virtualElevation,
        type: 'line',
        data: chungData.virtual_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: isDark ? '#facc15' : '#eab308', width: 2.5, type: 'dashed' },
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none w-full max-w-3xl shadow-brutal-lg dark:shadow-brutal-lg-dark overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-zinc-900 dark:border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-400 text-zinc-950 border-2 border-zinc-900 shadow-brutal-sm shrink-0">
              <Award className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h2 className="text-base font-black font-mono uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
              {t.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50 p-1 rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm bg-zinc-100 dark:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4 font-mono">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold block">{t.cdaEstimated}</span>
              <span className="text-2xl font-black font-mono text-zinc-950 dark:text-zinc-50">
                {chungData.cda.toFixed(3)} <span className="text-xs font-normal text-zinc-500">m²</span>
              </span>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold block">{t.crrCoeff}</span>
              <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                {chungData.crr.toFixed(4)}
              </span>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold block">{t.rSquared}</span>
              <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {(chungData.r_squared * 100).toFixed(1)}%
              </span>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm">
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase font-bold block">{t.rmse}</span>
              <span className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                {chungData.rmse_m.toFixed(2)} <span className="text-xs font-normal text-zinc-500">m</span>
              </span>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3 bg-amber-100 dark:bg-amber-950/60 border-2 border-zinc-900 dark:border-zinc-100 rounded-none text-xs text-zinc-950 dark:text-zinc-100 flex items-start gap-2 shadow-brutal-sm">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 stroke-[2.5]" />
            <span className="leading-relaxed">{t.explanation}</span>
          </div>

          {/* Interactive Chart */}
          <div className="h-[280px] w-full bg-zinc-50 dark:bg-[#121214] rounded-none border-2 border-zinc-900 dark:border-zinc-100 p-2 shadow-brutal-sm">
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t-2 border-zinc-900 dark:border-zinc-100 flex justify-end gap-3 bg-zinc-100 dark:bg-[#121214]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-mono font-bold rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            {t.close}
          </button>
          {onApplyCda && (
            <button
              type="button"
              onClick={() => {
                onApplyCda(chungData.cda, chungData.crr);
                onClose();
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-mono font-black uppercase rounded-none border-2 border-zinc-900 dark:border-zinc-100 shadow-brutal-sm transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {t.applyCda}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
