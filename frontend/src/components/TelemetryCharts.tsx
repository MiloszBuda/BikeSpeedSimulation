import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SpatialPoint, EnrichedPoint } from '../types/simulation';

interface TelemetryChartsProps {
  spatialPoints: SpatialPoint[];
  enrichedPoints?: EnrichedPoint[];
  onHoverIndex?: (idx: number | null) => void;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  spatialPoints,
  onHoverIndex,
}) => {
  const chartOption = useMemo(() => {
    if (!spatialPoints || spatialPoints.length === 0) return {};

    const distancesKm = spatialPoints.map((p) => (p.distance_m / 1000).toFixed(2));
    const elevations = spatialPoints.map((p) => p.elevation_m.toFixed(1));
    const baseSpeeds = spatialPoints.map((p) => p.baseline_speed_kmh.toFixed(1));
    const simSpeeds = spatialPoints.map((p) => p.simulated_speed_kmh.toFixed(1));
    const powers = spatialPoints.map((p) => p.power_w.toFixed(0));
    const deltaTimes = spatialPoints.map((p) => p.delta_time_s.toFixed(1));

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#0f172a' } },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: { color: '#f8fafc', fontSize: 12 },
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
              <div class="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">
                Dystans: ${km} km | Nachylenie: ${slopePct}%
              </div>
              <div class="flex items-center gap-2 text-indigo-400">
                <span>Wysokość:</span> <b class="font-mono">${elev} m</b>
              </div>
              <div class="flex items-center gap-2 text-slate-300">
                <span>Prędkość bazowa:</span> <b class="font-mono">${vBase} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-teal-400">
                <span>Prędkość symulowana:</span> <b class="font-mono">${vSim} km/h</b>
              </div>
              <div class="flex items-center gap-2 text-amber-400">
                <span>Moc:</span> <b class="font-mono">${Math.round(p.power_w)} W</b>
              </div>
              <div class="flex items-center gap-2 ${p.delta_time_s >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                <span>Delta czasu:</span> <b class="font-mono">${delta}</b>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['Wysokość terenu (m)', 'Prędkość bazowa (km/h)', 'Prędkość symulowana (km/h)', 'Moc (W)', 'Delta czasu (s)'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0,
      },
      grid: [
        { left: '4%', right: '4%', top: '10%', height: '52%' }, // Main Speed & Elevation
        { left: '4%', right: '4%', top: '69%', height: '20%' }, // Sub-chart: Power & Time Delta
      ],
      xAxis: [
        {
          type: 'category',
          data: distancesKm,
          gridIndex: 0,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#334155' } },
          axisLabel: { show: false },
        },
        {
          type: 'category',
          data: distancesKm,
          gridIndex: 1,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#334155' } },
          axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value} km' },
        },
      ],
      yAxis: [
        // Grid 0 - Left: Elevation
        {
          type: 'value',
          name: 'Wysokość (m)',
          gridIndex: 0,
          scale: true,
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#64748b', fontSize: 10 },
          nameTextStyle: { color: '#64748b', fontSize: 10 },
        },
        // Grid 0 - Right: Speed
        {
          type: 'value',
          name: 'Prędkość (km/h)',
          gridIndex: 0,
          scale: true,
          splitLine: { show: false },
          axisLabel: { color: '#64748b', fontSize: 10 },
          nameTextStyle: { color: '#64748b', fontSize: 10 },
        },
        // Grid 1 - Left: Power
        {
          type: 'value',
          name: 'Moc (W)',
          gridIndex: 1,
          scale: true,
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#64748b', fontSize: 9 },
          nameTextStyle: { color: '#64748b', fontSize: 9 },
        },
        // Grid 1 - Right: Delta Time
        {
          type: 'value',
          name: 'Delta (s)',
          gridIndex: 1,
          scale: true,
          splitLine: { show: false },
          axisLabel: { color: '#64748b', fontSize: 9 },
          nameTextStyle: { color: '#64748b', fontSize: 9 },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          filterMode: 'filter',
        },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          bottom: '1%',
          height: 18,
          borderColor: '#1e293b',
          backgroundColor: '#090d16',
          fillerColor: 'rgba(20, 184, 166, 0.2)',
          handleStyle: { color: '#14b8a6' },
          textStyle: { color: '#64748b', fontSize: 9 },
        },
      ],
      series: [
        // 1. Elevation (Filled Area)
        {
          name: 'Wysokość terenu (m)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: elevations,
          showSymbol: false,
          smooth: true,
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99, 102, 241, 0.35)' },
                { offset: 1, color: 'rgba(99, 102, 241, 0.02)' },
              ],
            },
          },
        },
        // 2. Baseline Speed (Grey)
        {
          name: 'Prędkość bazowa (km/h)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: baseSpeeds,
          showSymbol: false,
          lineStyle: { color: '#64748b', width: 1.5, type: 'dotted' },
        },
        // 3. Simulated Speed (Teal)
        {
          name: 'Prędkość symulowana (km/h)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: simSpeeds,
          showSymbol: false,
          lineStyle: { color: '#14b8a6', width: 2 },
        },
        // 4. Power (Amber)
        {
          name: 'Moc (W)',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 2,
          data: powers,
          showSymbol: false,
          lineStyle: { color: '#f59e0b', width: 1.5 },
        },
        // 5. Time Delta (Emerald/Rose)
        {
          name: 'Delta czasu (s)',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 3,
          data: deltaTimes,
          showSymbol: false,
          lineStyle: { color: '#10b981', width: 1.5 },
          areaStyle: {
            color: 'rgba(16, 185, 129, 0.15)',
          },
        },
      ],
    };
  }, [spatialPoints]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          Profile telemetryczne: Wysokość, Prędkość i Zysk Czasowy
        </h3>
        <span className="text-xs text-slate-500 font-mono">
          {spatialPoints.length} węzłów przestrzennych (krok 5m)
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
