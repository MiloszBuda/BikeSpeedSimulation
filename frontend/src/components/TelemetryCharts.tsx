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

    const tooltipBg = isDark ? 'rgba(28, 28, 31, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? '#f4f4f5' : '#18181b';
    const tooltipText = isDark ? '#f4f4f5' : '#18181b';
    const splitLineColor = isDark ? '#27272a' : '#e4e4e7';
    const axisTextColor = isDark ? '#a1a1aa' : '#52525b';

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: isDark ? '#1c1c1f' : '#f4f4f5', color: isDark ? '#f4f4f5' : '#18181b' } },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 2,
        extraCssText: isDark ? 'box-shadow: 3px 3px 0px 0px #f4f4f5; border-radius: 0px;' : 'box-shadow: 3px 3px 0px 0px #18181b; border-radius: 0px;',
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'monospace' },
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
            <div class="font-mono text-xs">
              <div class="font-bold border-b ${isDark ? 'border-zinc-700 text-zinc-100' : 'border-zinc-300 text-zinc-900'} pb-1 mb-1">
                ${t.distance} ${km} km | ${t.slope} ${slopePct}%
              </div>
              <div class="flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                <span>${t.elevation}:</span> <b class="font-mono">${elev} m</b>
              </div>
              <div class="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span>${t.baseSpeed}:</span> <b class="font-mono">${vBase} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-amber-500 dark:text-amber-400">
                <span>${t.simSpeed}:</span> <b class="font-mono">${vSim} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-orange-500 dark:text-orange-400">
                <span>${t.power}:</span> <b class="font-mono">${p.power_w.toFixed(0)} W</b>
                ${p.power_effective_w !== undefined && Math.abs(p.power_effective_w - p.power_w) > 5 ? `<span class="font-mono text-[11px]">(${t.effective} ${p.power_effective_w.toFixed(0)} W)</span>` : ''}
              </div>
              ${p.acceleration_mps2 !== undefined ? `
              <div class="flex items-center gap-2 text-cyan-500 dark:text-cyan-400">
                <span>${t.acceleration}:</span> <b class="font-mono">${p.acceleration_mps2 >= 0 ? '+' : ''}${p.acceleration_mps2.toFixed(2)} m/s²</b>
              </div>
              ` : ''}
              <div class="flex items-center gap-2 ${p.delta_time_s >= 0 ? 'text-lime-500 dark:text-lime-400' : 'text-rose-500 dark:text-rose-400'}">
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
    <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-5 shadow-brutal dark:shadow-brutal-dark flex flex-col gap-3 transition-colors duration-200">
      <div className="flex items-center justify-between border-b-2 border-zinc-900 dark:border-zinc-100 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-400 text-zinc-950 border-2 border-zinc-900 shadow-brutal-sm shrink-0">
            <span className="block w-3.5 h-3.5 border-2 border-zinc-950 bg-amber-300 animate-pulse" />
          </div>
          <h3 className="text-sm font-mono font-black uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
            {t.title}
          </h3>
          <Tooltip
            title="Interpretacja wykresów telemetrycznych"
            content="Wykres górny prezentuje profil wysokości terenu oraz prędkość bazową vs symulowaną. Wykres dolny przedstawia moc oraz skumulowaną deltę czasu (zielone pole to zysk czasowy na danym odcinku)."
            physicsNote="Najechanie na wykres synchronizuje kursor z dokładną pozycją kolarza na interaktywnej mapie trasy."
            position="bottom"
          />
        </div>
        <span className="text-xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-2 border-zinc-900 dark:border-zinc-100 px-2.5 py-1 rounded-none shadow-brutal-sm">
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
