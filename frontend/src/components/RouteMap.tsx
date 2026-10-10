import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { SpatialPoint } from '../types/simulation';
import { Translations } from '../i18n/translations';

// Fix standard Leaflet default icon paths in bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface RouteMapProps {
  spatialPoints: SpatialPoint[];
  hoveredIndex: number | null;
  theme?: 'dark' | 'light';
  t: Translations['map'];
}

// Helper component to auto-fit map view to route bounds
const FitBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [bounds, map]);
  return null;
};

export const RouteMap: React.FC<RouteMapProps> = ({
  spatialPoints,
  hoveredIndex,
  theme = 'dark',
  t,
}) => {
  const coordinates = useMemo(() => {
    return spatialPoints.map((p) => [p.lat, p.lon] as [number, number]);
  }, [spatialPoints]);

  const bounds = useMemo(() => {
    if (coordinates.length === 0) return null;
    return L.latLngBounds(coordinates);
  }, [coordinates]);

  // Generate colored multi-segment polylines based on wind attack angle (yaw beta)
  const segments = useMemo(() => {
    if (spatialPoints.length < 2) return [];

    const segs = [];
    for (let i = 0; i < spatialPoints.length - 1; i++) {
      const p1 = spatialPoints[i];
      const p2 = spatialPoints[i + 1];

      // Relative wind angle beta = wind_dir - bearing
      const beta = Math.abs(((p1.wind_dir_deg - p1.bearing_deg + 360) % 360));
      const normBeta = beta > 180 ? 360 - beta : beta; // 0 = headwind, 180 = tailwind

      let color = '#f59e0b'; // Amber (crosswind)
      if (normBeta < 50) {
        color = '#ef4444'; // Red (headwind)
      } else if (normBeta > 130) {
        color = '#10b981'; // Green (tailwind)
      }

      segs.push({
        positions: [
          [p1.lat, p1.lon] as [number, number],
          [p2.lat, p2.lon] as [number, number],
        ],
        color,
      });
    }
    return segs;
  }, [spatialPoints]);

  // Read optional CARTO API key or custom tile template from environment
  const cartoApiKey = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim();
  const customTileUrl = (import.meta.env.VITE_CARTO_TILE_URL as string | undefined)?.trim();

  const defaultTileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const tileUrl = customTileUrl
    ? customTileUrl
    : cartoApiKey
    ? `${defaultTileUrl}?api_key=${encodeURIComponent(cartoApiKey)}`
    : defaultTileUrl;

  if (coordinates.length === 0 || !bounds) {
    return (
      <div className="h-[380px] bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none shadow-brutal dark:shadow-brutal-dark flex items-center justify-center text-zinc-500 font-mono font-bold text-sm">
        {t.noGps}
      </div>
    );
  }

  const startPt = coordinates[0];
  const endPt = coordinates[coordinates.length - 1];
  const hoveredPt = hoveredIndex !== null && spatialPoints[hoveredIndex]
    ? [spatialPoints[hoveredIndex].lat, spatialPoints[hoveredIndex].lon] as [number, number]
    : null;

  return (
    <div className="bg-white dark:bg-[#1c1c1f] border-2 border-zinc-900 dark:border-zinc-100 rounded-none p-5 shadow-brutal dark:shadow-brutal-dark flex flex-col gap-3 transition-colors duration-200">
      <div className="flex items-center justify-between border-b-2 border-zinc-900 dark:border-zinc-100 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-lime-400 text-zinc-950 border-2 border-zinc-900 shadow-brutal-sm shrink-0">
            <MapPin className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-mono font-black uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
            {t.title}
          </h3>
        </div>

        {/* Tactical Brutalist Legend Badges */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 bg-rose-400 text-zinc-950 font-bold shadow-brutal-sm text-[11px]">
            {t.headwind}
          </span>
          <span className="px-2 py-0.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 bg-amber-400 text-zinc-950 font-bold shadow-brutal-sm text-[11px]">
            {t.crosswind}
          </span>
          <span className="px-2 py-0.5 rounded-none border-2 border-zinc-900 dark:border-zinc-100 bg-lime-400 text-zinc-950 font-bold shadow-brutal-sm text-[11px]">
            {t.tailwind}
          </span>
        </div>
      </div>

      <div className="w-full h-[360px] rounded-none overflow-hidden border-2 border-zinc-900 dark:border-zinc-100 relative shadow-brutal-sm dark:shadow-brutal-sm-dark">
        <MapContainer
          key={theme}
          center={startPt}
          zoom={13}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url={tileUrl}
          />

          <FitBounds bounds={bounds} />

          {/* Colored Segments */}
          {segments.map((s, idx) => (
            <Polyline
              key={idx}
              positions={s.positions}
              pathOptions={{ color: s.color, weight: 5, opacity: 0.95 }}
            />
          ))}

          {/* Start Marker */}
          <Marker position={startPt}>
            <Popup>
              <div className="text-xs font-mono">
                <b className="uppercase">{t.start}</b><br />
                {t.elevation}: {spatialPoints[0].elevation_m} m
              </div>
            </Popup>
          </Marker>

          {/* Finish Marker */}
          <Marker position={endPt}>
            <Popup>
              <div className="text-xs font-mono">
                <b className="uppercase">{t.finish}</b><br />
                {t.distance}: {(spatialPoints[spatialPoints.length - 1].distance_m / 1000).toFixed(2)} km
              </div>
            </Popup>
          </Marker>

          {/* Hovered Sync Dot */}
          {hoveredPt && (
            <Marker position={hoveredPt}>
              <Popup>
                <div className="text-xs font-mono">
                  <b className="uppercase">{t.speed}:</b> {spatialPoints[hoveredIndex!].simulated_speed_kmh.toFixed(1)} km/h<br />
                  <b className="uppercase">{t.elevation}:</b> {spatialPoints[hoveredIndex!].elevation_m.toFixed(1)} m
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
};
