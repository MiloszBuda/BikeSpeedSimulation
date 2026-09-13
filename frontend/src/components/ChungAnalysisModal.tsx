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
  const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';
  const axisTextColor = isDark ? '#64748b' : '#475569';

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontSize: 12 },
    },
    legend: {
      data: [t.realElevation, t.virtualElevation],
      textStyle: { color: axisTextColor, fontSize: 11 },
      top: 0,
    },
    grid: { left: '4%', right: '4%', top: '15%', bottom: '10%' },
    xAxis: {
      type: 'category',
      data: chungData.time_offset_s.map((s) => `${s}s`),
      axisLine: { lineStyle: { color: isDark ? '#334155' : '#cbd5e1' } },
      axisLabel: { color: axisTextColor, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: t.elevationAxis,
      scale: true,
      splitLine: { lineStyle: { color: splitLineColor } },
      axisLabel: { color: axisTextColor, fontSize: 10 },
      nameTextStyle: { color: axisTextColor, fontSize: 10 },
    },
    series: [
      {
        name: t.realElevation,
        type: 'line',
        data: chungData.real_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: isDark ? '#818cf8' : '#6366f1', width: 2 },
      },
      {
        name: t.virtualElevation,
        type: 'line',
        data: chungData.virtual_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: isDark ? '#14b8a6' : '#0d9488', width: 2, type: 'dashed' },
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">{t.cdaEstimated}</span>
              <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
                {chungData.cda.toFixed(3)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">m²</span>
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">{t.crrCoeff}</span>
              <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                {chungData.crr.toFixed(4)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">{t.rSquared}</span>
              <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {(chungData.r_squared * 100).toFixed(1)}%
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">{t.rmse}</span>
              <span className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                {chungData.rmse_m.toFixed(2)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">m</span>
              </span>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 rounded-xl text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <span>{t.explanation}</span>
          </div>

          {/* Interactive Chart */}
          <div className="h-[280px] w-full bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-2">
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
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
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              {t.applyCda}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
