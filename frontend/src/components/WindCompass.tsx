import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Compass, RotateCw, RotateCcw, ArrowUp, RefreshCw } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface WindCompassProps {
  angle: number; // degrees [0, 360)
  onChange: (newAngle: number) => void;
  disabled?: boolean;
  windSpeedMps?: number;
}

const CARDINALS = [
  { label: 'N', angle: 0, text: 'Północ' },
  { label: 'NE', angle: 45, text: 'Pn-Wsch' },
  { label: 'E', angle: 90, text: 'Wschód' },
  { label: 'SE', angle: 135, text: 'Pd-Wsch' },
  { label: 'S', angle: 180, text: 'Południe' },
  { label: 'SW', angle: 225, text: 'Pd-Zach' },
  { label: 'W', angle: 270, text: 'Zachód' },
  { label: 'NW', angle: 315, text: 'Pn-Zach' },
];

export const WindCompass: React.FC<WindCompassProps> = ({
  angle,
  onChange,
  disabled = false,
  windSpeedMps = 0,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const calculateAngleFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // In screen coordinates, positive y is down.
    // 0 deg is North (dy < 0, dx = 0).
    // atan2(dx, -dy) gives angle in radians where 0 is Up/North, pi/2 is Right/East.
    const rad = Math.atan2(dx, -dy);
    let deg = Math.round((rad * 180) / Math.PI);
    deg = (deg + 360) % 360;
    onChange(deg);
  }, [onChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    calculateAngleFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    calculateAngleFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture release fails
    }
  };

  const rotateBy = (delta: number) => {
    if (disabled) return;
    const newAngle = (angle + delta + 360) % 360;
    onChange(newAngle);
  };

  const getCardinalDescription = (deg: number) => {
    const idx = Math.round(deg / 45) % 8;
    return CARDINALS[idx];
  };

  const cardinal = getCardinalDescription(angle);

  const size = 180;
  const center = size / 2;
  const radius = 70;

  return (
    <div className="flex flex-col items-center select-none">
      <div className="flex items-center justify-between w-full mb-2">
        <div className="flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Kierunek wiatru
          </span>
          <Tooltip
            title="Kierunek wiatru (róża wiatrów)"
            content="Konwencja meteorologiczna określa kierunek, Z KTÓREGO wieje wiatr: 0° = Północ (N), 90° = Wschód (E), 180° = Południe (S), 270° = Zachód (W). Kliknij w dowolne miejsce tarczy lub przeciągaj igłę, aby zmienić kąt."
            physicsNote="Wektor wiatru rzeczywistego łączy się wektorowo z prędkością kolarza tworząc wiatr pozorny (apparent wind), decydujący o oporze aerodynamicznym."
            position="right"
          />
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-teal-300 font-mono">
            {Math.round(angle)}°
          </span>
          <span className="text-xs text-slate-400 ml-1">
            ({cardinal.label})
          </span>
        </div>
      </div>

      {/* SVG Interactive Compass Dial */}
      <div className="relative group cursor-grab active:cursor-grabbing">
        <svg
          ref={svgRef}
          width={size}
          height={size}
          className={`touch-none transition-opacity ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Outer Dial Background */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="fill-slate-900 stroke-slate-700 stroke-2"
          />

          {/* Sub-ticks every 15 deg */}
          {Array.from({ length: 24 }).map((_, i) => {
            const tickAngle = i * 15;
            const isMajor = tickAngle % 45 === 0;
            const r1 = radius - (isMajor ? 8 : 4);
            const r2 = radius - 2;
            const rad = (tickAngle * Math.PI) / 180;
            const x1 = center + r1 * Math.sin(rad);
            const y1 = center - r1 * Math.cos(rad);
            const x2 = center + r2 * Math.sin(rad);
            const y2 = center - r2 * Math.cos(rad);

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={isMajor ? 'stroke-slate-500 stroke-2' : 'stroke-slate-700 stroke-1'}
              />
            );
          })}

          {/* Cardinal Direction Letters */}
          {CARDINALS.map((c) => {
            const textRadius = radius - 16;
            const rad = (c.angle * Math.PI) / 180;
            const x = center + textRadius * Math.sin(rad);
            const y = center - textRadius * Math.cos(rad) + 4; // slight vertical balance
            const isNorth = c.label === 'N';

            return (
              <text
                key={c.label}
                x={x}
                y={y}
                textAnchor="middle"
                className={`text-[10px] font-bold ${
                  isNorth ? 'fill-rose-400 font-extrabold' : 'fill-slate-400'
                }`}
              >
                {c.label}
              </text>
            );
          })}

          {/* Inner Decorative Hub */}
          <circle
            cx={center}
            cy={center}
            r={14}
            className="fill-slate-800 stroke-slate-600 stroke-1"
          />

          {/* Rotating Needle / Arrow */}
          <g transform={`rotate(${angle}, ${center}, ${center})`}>
            {/* North-facing / Wind origin arrow head */}
            <polygon
              points={`${center},${center - radius + 12} ${center - 7},${center - 6} ${center + 7},${center - 6}`}
              className="fill-teal-400 drop-shadow-md"
            />
            {/* Wind tail counterweight */}
            <polygon
              points={`${center},${center + radius - 16} ${center - 4},${center + 6} ${center + 4},${center + 6}`}
              className="fill-slate-600"
            />
            {/* Shaft line */}
            <line
              x1={center}
              y1={center - radius + 14}
              x2={center}
              y2={center + radius - 18}
              className="stroke-teal-400 stroke-2"
            />
            {/* Center dot */}
            <circle cx={center} cy={center} r={4} className="fill-teal-300" />
          </g>
        </svg>

        {/* Floating tooltip indicating action */}
        {!disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] bg-slate-900/90 text-teal-300 px-2 py-0.5 rounded shadow border border-slate-700">
              Przeciągnij / Kliknij
            </span>
          </div>
        )}
      </div>

      {/* Quick Action Angle Buttons */}
      <div className="flex items-center gap-1.5 mt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(-45)}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1 transition-colors"
          title="Obróć o 45° w lewo"
        >
          <RotateCcw className="w-3 h-3" />
          -45°
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(180)}
          className="px-2.5 py-1 bg-teal-950/60 hover:bg-teal-900/80 border border-teal-700/60 text-teal-300 text-xs font-medium rounded flex items-center gap-1 transition-colors"
          title="Odwróć wiatr o 180°"
        >
          <RefreshCw className="w-3 h-3 text-teal-400" />
          180°
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(45)}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1 transition-colors"
          title="Obróć o 45° w prawo"
        >
          +45°
          <RotateCw className="w-3 h-3" />
        </button>
      </div>

      {/* Preset Cardinal Buttons */}
      <div className="grid grid-cols-4 gap-1 w-full max-w-[200px] mt-2">
        {[
          { label: 'N (0°)', deg: 0 },
          { label: 'E (90°)', deg: 90 },
          { label: 'S (180°)', deg: 180 },
          { label: 'W (270°)', deg: 270 },
        ].map((p) => (
          <button
            key={p.deg}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.deg)}
            className={`py-0.5 text-[11px] font-mono rounded border transition-colors ${
              Math.abs(angle - p.deg) < 1
                ? 'bg-teal-600 text-white border-teal-500 font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
