import React from 'react';
import ReactECharts from 'echarts-for-react';
import { X, Award, CheckCircle2, TrendingUp } from 'lucide-react';
import { ChungEstimateResponse } from '../types/simulation';

interface ChungAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  chungData: ChungEstimateResponse | null;
  onApplyCda?: (cda: number, crr: number) => void;
}

export const ChungAnalysisModal: React.FC<ChungAnalysisModalProps> = ({
  isOpen,
  onClose,
  chungData,
  onApplyCda,
}) => {
  if (!isOpen || !chungData) return null;

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
    },
    legend: {
      data: ['Wysokość rzeczywista (m)', 'Wirtualna wysokość Chunga h_virt (m)'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0,
    },
    grid: { left: '4%', right: '4%', top: '15%', bottom: '10%' },
    xAxis: {
      type: 'category',
      data: chungData.time_offset_s.map((s) => `${s}s`),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'Wysokość (m)',
      scale: true,
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    series: [
      {
        name: 'Wysokość rzeczywista (m)',
        type: 'line',
        data: chungData.real_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: '#6366f1', width: 2 },
      },
      {
        name: 'Wirtualna wysokość Chunga h_virt (m)',
        type: 'line',
        data: chungData.virtual_elevation_m.map((v) => v.toFixed(2)),
        showSymbol: false,
        lineStyle: { color: '#14b8a6', width: 2, type: 'dashed' },
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-bold text-slate-100">
              Estymacja Aerodynamiki metodą Chunga (Virtual Elevation)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Wyestymowane CdA</span>
              <span className="text-2xl font-black font-mono text-teal-400">
                {chungData.cda.toFixed(3)} <span className="text-xs font-normal text-slate-400">m²</span>
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Współczynnik Crr</span>
              <span className="text-2xl font-black font-mono text-amber-400">
                {chungData.crr.toFixed(4)}
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Dopasowanie R²</span>
              <span className="text-2xl font-black font-mono text-emerald-400">
                {(chungData.r_squared * 100).toFixed(1)}%
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Błąd RMSE</span>
              <span className="text-2xl font-black font-mono text-indigo-400">
                {chungData.rmse_m.toFixed(2)} <span className="text-xs font-normal text-slate-400">m</span>
              </span>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3 bg-teal-950/40 border border-teal-800/60 rounded-xl text-xs text-teal-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <span>
              Metoda wirtualnego przewyższenia (Chung VE) całkuje równanie bilansu energii. Gdy wyznaczone CdA
              odpowiada rzeczywistemu oporowi kolarza, wirtualny profil wysokości idealnie pokrywa się z faktyczną
              topografią terenu, kompensując zmiany energii kinetycznej.
            </span>
          </div>

          {/* Interactive Chart */}
          <div className="h-[280px] w-full bg-slate-950 rounded-xl border border-slate-800 p-2">
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
          >
            Zamknij
          </button>
          {onApplyCda && (
            <button
              type="button"
              onClick={() => {
                onApplyCda(chungData.cda, chungData.crr);
                onClose();
              }}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Zastosuj to CdA do symulacji
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
