import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SpatialPoint, EnrichedPoint } from '../types/simulation';
import { Tooltip } from './Tooltip';

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
                <span>Moc FIT:</span> <b class="font-mono">${p.power_w.toFixed(0)} W</b>
                ${p.power_effective_w !== undefined && Math.abs(p.power_effective_w - p.power_w) > 5 ? `<span class="text-amber-300/80 font-mono text-[11px]">(efekt: ${p.power_effective_w.toFixed(0)} W)</span>` : ''}
              </div>
              ${p.acceleration_mps2 !== undefined ? `
              <div class="flex items-center gap-2 text-cyan-400">
                <span>Przyspieszenie:</span> <b class="font-mono">${p.acceleration_mps2 >= 0 ? '+' : ''}${p.acceleration_mps2.toFixed(2)} m/s²</b>
              </div>
              ` : ''}
              <div class="flex items-center gap-2 ${p.delta_time_s >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                <span>Skumulowana delta czasu:</span> <b class="font-mono">${delta}</b>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['Wysokość (m)', 'Prędkość bazowa (km/h)', 'Prędkość symulowana (km/h)', 'Moc (W)', 'Delta czasu (s)'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
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
            color: '#94a3b8',
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
          name: 'Wysokość (m)',
          nameTextStyle: { color: '#818cf8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#818cf8', fontSize: 10 },
        },
        // 1: Speed (km/h) - Top Right
        {
          type: 'value',
          gridIndex: 0,
          name: 'Prędkość (km/h)',
          nameTextStyle: { color: '#2dd4bf', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#2dd4bf', fontSize: 10 },
        },
        // 2: Power (W) - Bottom Left
        {
          type: 'value',
          gridIndex: 1,
          name: 'Moc (W)',
          nameTextStyle: { color: '#f59e0b', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#f59e0b', fontSize: 10 },
        },
        // 3: Time Delta (s) - Bottom Right
        {
          type: 'value',
          gridIndex: 1,
          name: 'Delta czasu (s)',
          nameTextStyle: { color: '#10b981', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#10b981', fontSize: 10 },
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
          borderColor: '#334155',
          fillerColor: 'rgba(45, 212, 191, 0.2)',
          handleStyle: { color: '#2dd4bf' },
          textStyle: { color: '#94a3b8', fontSize: 9 },
        },
      ],
      series: [
        // 1. Elevation Profile
        {
          name: 'Wysokość (m)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: elevations,
          showSymbol: false,
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: {
            color: 'rgba(99, 102, 241, 0.25)',
          },
        },
        // 2. Baseline Speed
        {
          name: 'Prędkość bazowa (km/h)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: baseSpeeds,
          showSymbol: false,
          lineStyle: { color: '#64748b', width: 1.5, type: 'dashed' },
        },
        // 3. Simulated Speed
        {
          name: 'Prędkość symulowana (km/h)',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: simSpeeds,
          showSymbol: false,
          lineStyle: { color: '#2dd4bf', width: 2 },
        },
        // 4. Power (W)
        {
          name: 'Moc (W)',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 2,
          data: powers,
          showSymbol: false,
          lineStyle: { color: '#f59e0b', width: 1.5 },
        },
        // 5. Time Delta (s)
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
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-100">
            Profile telemetryczne: Wysokość, Prędkość i Zysk Czasowy
          </h3>
          <Tooltip
            title="Interpretacja wykresów telemetrycznych"
            content="Wykres górny prezentuje profil wysokości terenu oraz prędkość bazową vs symulowaną. Wykres dolny przedstawia moc oraz skumulowaną deltę czasu (zielone pole to zysk czasowy na danym odcinku)."
            physicsNote="Najechanie na wykres synchronizuje kursor z dokładną pozycją kolarza na interaktywnej mapie trasy."
            position="bottom"
          />
        </div>
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
