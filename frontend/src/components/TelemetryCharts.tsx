import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SpatialPoint, EnrichedPoint } from '../types/simulation';
import { Tooltip } from './Tooltip';
import { Translations } from '../i18n/translations';

interface TelemetryChartsProps {
  spatialPoints: SpatialPoint[];
  enrichedPoints?: EnrichedPoint[];
  onHoverIndex?: (idx: number | null) => void;
  theme?: 'dark' | 'light';
  t: Translations['charts'];
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  spatialPoints,
  onHoverIndex,
  theme = 'dark',
  t,
}) => {
  const isDark = theme === 'dark';

  const chartOption = useMemo(() => {
    if (!spatialPoints || spatialPoints.length === 0) return {};

    const distancesKm = spatialPoints.map((p) => (p.distance_m / 1000).toFixed(2));
    const elevations = spatialPoints.map((p) => p.elevation_m.toFixed(1));
    const baseSpeeds = spatialPoints.map((p) => p.baseline_speed_kmh.toFixed(1));
    const simSpeeds = spatialPoints.map((p) => p.simulated_speed_kmh.toFixed(1));
    const powers = spatialPoints.map((p) => p.power_w.toFixed(0));
    const deltaTimes = spatialPoints.map((p) => p.delta_time_s.toFixed(1));

    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)';
    const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';
    const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';
    const axisTextColor = isDark ? '#94a3b8' : '#64748b';

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#f8fafc' : '#0f172a' } },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const p = spatialPoints[idx];
          if (!p) return '';

          const km = (p.distance_m / 1000).toFixed(2);
          const elev = p.elevation_m.toFixed(1);
          const vBase = p.baseline_speed_kmh.toFixed(1);
          const vSim = p.simulated_speed_kmh.toFixed(1);
          const delta = p.delta_time_s >= 0 ? `+${p.delta_time_s.toFixed(1)}s` : `${p.delta_time_s.toFixed(1)}s`;
          const slopePct = (p.slope * 100).toFixed(1);

          return `
            <div class="font-sans text-xs">
              <div class="font-bold border-b ${isDark ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-800'} pb-1 mb-1">
                ${t.distance} ${km} km | ${t.slope} ${slopePct}%
              </div>
              <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <span>${t.elevation}:</span> <b class="font-mono">${elev} m</b>
              </div>
              <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span>${t.baseSpeed}:</span> <b class="font-mono">${vBase} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <span>${t.simSpeed}:</span> <b class="font-mono">${vSim} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <span>${t.power}:</span> <b class="font-mono">${p.power_w.toFixed(0)} W</b>
                ${p.power_effective_w !== undefined && Math.abs(p.power_effective_w - p.power_w) > 5 ? `<span class="text-amber-500 font-mono text-[11px]">(${t.effective} ${p.power_effective_w.toFixed(0)} W)</span>` : ''}
              </div>
              ${p.acceleration_mps2 !== undefined ? `
              <div class="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
                <span>${t.acceleration}:</span> <b class="font-mono">${p.acceleration_mps2 >= 0 ? '+' : ''}${p.acceleration_mps2.toFixed(2)} m/s²</b>
              </div>
              ` : ''}
              <div class="flex items-center gap-2 ${p.delta_time_s >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                <span>${t.accumulatedDelta}</span> <b class="font-mono">${delta}</b>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: [t.elevation, t.baseSpeed, t.simSpeed, t.power, t.deltaTime],
        textStyle: { color: axisTextColor, fontSize: 11 },
        top: 0,
      },
      grid: [
        // Top Grid: Elevation & Speeds
        { left: '4%', right: '4%', top: '6%', height: '52%' },
        // Bottom Grid: Power & Time Delta
        { left: '4%', right: '4%', top: '65%', height: '24%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: distancesKm,
          gridIndex: 0,
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        {
          type: 'category',
          data: distancesKm,
          gridIndex: 1,
          axisLabel: {
            color: axisTextColor,
            fontSize: 10,
            formatter: '{value} km',
          },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        // 0: Elevation (m) - Top Left
        {
          type: 'value',
          gridIndex: 0,
          name: t.elevation,
          nameTextStyle: { color: isDark ? '#818cf8' : '#4f46e5', fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineColor } },
          axisLabel: { color: isDark ? '#818cf8' : '#4f46e5', fontSize: 10 },
        },
        // 1: Speed (km/h) - Top Right
        {
          type: 'value',
          gridIndex: 0,
          name: t.simSpeed,
          nameTextStyle: { color: isDark ? '#2dd4bf' : '#0d9488', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: isDark ? '#2dd4bf' : '#0d9488', fontSize: 10 },
        },
        // 2: Power (W) - Bottom Left
        {
          type: 'value',
          gridIndex: 1,
          name: t.power,
          nameTextStyle: { color: isDark ? '#f59e0b' : '#d97706', fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineColor } },
          axisLabel: { color: isDark ? '#f59e0b' : '#d97706', fontSize: 10 },
        },
        // 3: Time Delta (s) - Bottom Right
        {
          type: 'value',
          gridIndex: 1,
          name: t.deltaTime,
          nameTextStyle: { color: isDark ? '#10b981' : '#059669', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: isDark ? '#10b981' : '#059669', fontSize: 10 },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
          bottom: 4,
          height: 16,
          borderColor: isDark ? '#334155' : '#cbd5e1',
          fillerColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(13, 148, 136, 0.2)',
          handleStyle: { color: isDark ? '#2dd4bf' : '#0d9488' },
          textStyle: { color: axisTextColor, fontSize: 9 },
        },
      ],
      series: [
        // 1. Elevation Profile
        {
          name: t.elevation,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: elevations,
          showSymbol: false,
          lineStyle: { color: isDark ? '#818cf8' : '#6366f1', width: 2 },
          areaStyle: {
            color: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)',
          },
        },
        // 2. Baseline Speed
        {
          name: t.baseSpeed,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: baseSpeeds,
          showSymbol: false,
          lineStyle: { color: isDark ? '#64748b' : '#94a3b8', width: 1.5, type: 'dashed' },
        },
        // 3. Simulated Speed
        {
          name: t.simSpeed,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: simSpeeds,
          showSymbol: false,
          lineStyle: { color: isDark ? '#2dd4bf' : '#0d9488', width: 2 },
        },
        // 4. Power (W)
        {
          name: t.power,
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 2,
          data: powers,
          showSymbol: false,
          lineStyle: { color: isDark ? '#f59e0b' : '#d97706', width: 1.5 },
        },
        // 5. Time Delta (s)
        {
          name: t.deltaTime,
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 3,
          data: deltaTimes,
          showSymbol: false,
          lineStyle: { color: isDark ? '#10b981' : '#059669', width: 1.5 },
          areaStyle: {
            color: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
          },
        },
      ],
    };
  }, [spatialPoints, isDark, t]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-2 transition-colors duration-200">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t.title}
          </h3>
          <Tooltip
            title="Interpretacja wykresów telemetrycznych"
            content="Wykres górny prezentuje profil wysokości terenu oraz prędkość bazową vs symulowaną. Wykres dolny przedstawia moc oraz skumulowaną deltę czasu (zielone pole to zysk czasowy na danym odcinku)."
            physicsNote="Najechanie na wykres synchronizuje kursor z dokładną pozycją kolarza na interaktywnej mapie trasy."
            position="bottom"
          />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {spatialPoints.length} węzłów (krok 5m)
        </span>
      </div>

      <div className="w-full h-[460px]">
        <ReactECharts
          option={chartOption}
          style={{ height: '100%', width: '100%' }}
          onEvents={{
            showTip: (params: any) => {
              if (params && params.dataIndex !== undefined && onHoverIndex) {
                onHoverIndex(params.dataIndex);
              }
            },
            hideTip: () => {
              if (onHoverIndex) onHoverIndex(null);
            },
          }}
        />
      </div>
    </div>
  );
};
