import React, { useRef, useState, useCallback } from 'react';
import { Compass, RotateCw, RotateCcw, RefreshCw } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { Translations } from '../i18n/translations';

interface WindCompassProps {
  angle: number; // meteorological degrees [0, 360) - direction wind comes FROM
  onChange: (newAngle: number) => void;
  disabled?: boolean;
  windSpeedMps?: number;
  t?: Translations['compass'];
}

const CARDINALS = [
  { label: 'N', angle: 0 },
  { label: 'NE', angle: 45 },
  { label: 'E', angle: 90 },
  { label: 'SE', angle: 135 },
  { label: 'S', angle: 180 },
  { label: 'SW', angle: 225 },
  { label: 'W', angle: 270 },
  { label: 'NW', angle: 315 },
];

export const WindCompass: React.FC<WindCompassProps> = ({
  angle,
  onChange,
  disabled = false,
  windSpeedMps = 0,
  t,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // The arrow shows the wind FLOW direction (dokad wieje wiatr).
  // In meteorological convention: angle is where wind comes FROM.
  // Flow direction is rotated by 180 deg: flowAngle = (angle + 180) % 360.
  const flowAngle = (Math.round(angle) + 180) % 360;

  const calculateAngleFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // Pointer angle in screen coords (0 deg = North/Up, 90 deg = East/Right, 180 deg = South/Down)
    const rad = Math.atan2(dx, -dy);
    let pointerDeg = Math.round((rad * 180) / Math.PI);
    pointerDeg = (pointerDeg + 360) % 360;

    // The user points the flow arrow towards pointerDeg.
    // Therefore, meteorological angle (source) = (pointerDeg + 180) % 360.
    const newSourceAngle = (pointerDeg + 180) % 360;
    onChange(newSourceAngle);
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

  const getCardinal = (deg: number) => {
    const idx = Math.round(deg / 45) % 8;
    return CARDINALS[idx];
  };

  const sourceCardinal = getCardinal(angle);
  const flowCardinal = getCardinal(flowAngle);

  const size = 180;
  const center = size / 2;
  const radius = 70;

  const titleText = t?.title || 'Kierunek wiatru';
  const flowText = t?.flowDirection || 'Przepływ';
  const fromText = t?.fromDirection || 'Z';
  const dragText = t?.dragOrClick || 'Przeciągnij / Kliknij';

  return (
    <div className="flex flex-col items-center select-none w-full">
      {/* Row 1: Title and Tooltip */}
      <div className="flex items-center justify-between w-full mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Compass className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {titleText}
          </span>
          <Tooltip
            title={t?.tooltipTitle || 'Kierunek wiatru i strumień powietrza'}
            content={
              t?.tooltipContent ||
              'Strzałka wskazuje kierunek przepływu powietrza (dokąd wieje wiatr). Kąt meteorologiczny w nawiasie określa kierunek, Z KTÓREGO wieje wiatr. Kliknij w dowolne miejsce tarczy lub przeciągaj igłę, aby skierować strumień wiatru.'
            }
            physicsNote={
              t?.tooltipPhysics ||
              'Wektor wiatru łączy się z prędkością kolarza tworząc wiatr pozorny (apparent wind), decydujący o oporze aerodynamicznym.'
            }
            position="right"
          />
        </div>
      </div>

      {/* Row 2: Angle and Cardinal Direction */}
      <div className="w-full flex items-center justify-between bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2.5 py-1 mb-2 rounded font-mono text-xs shadow-sm">
        <div className="flex items-center gap-1 text-teal-600 dark:text-teal-300 font-bold">
          <span>➔ {flowCardinal.label}</span>
          <span>({flowAngle}°)</span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          {fromText}: {Math.round(angle)}° {sourceCardinal.label}
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
            className="fill-slate-100 dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700 stroke-2"
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
                className={isMajor ? 'stroke-slate-400 dark:stroke-slate-500 stroke-2' : 'stroke-slate-300 dark:stroke-slate-700 stroke-1'}
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
                  isNorth ? 'fill-rose-500 font-extrabold' : 'fill-slate-500 dark:fill-slate-400'
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
            className="fill-slate-200 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-600 stroke-1"
          />

          {/* Rotating Needle / Arrow - Rotated to flowAngle so arrowhead points where air flows */}
          <g transform={`rotate(${flowAngle}, ${center}, ${center})`}>
            {/* Arrow Head: Points in the direction of wind flow */}
            <polygon
              points={`${center},${center - radius + 12} ${center - 7},${center - 6} ${center + 7},${center - 6}`}
              className="fill-teal-500 dark:fill-teal-400 drop-shadow-md"
            />
            {/* Tail counterweight: where wind is coming from */}
            <polygon
              points={`${center},${center + radius - 16} ${center - 4},${center + 6} ${center + 4},${center + 6}`}
              className="fill-slate-400 dark:fill-slate-600"
            />
            {/* Shaft line */}
            <line
              x1={center}
              y1={center - radius + 14}
              x2={center}
              y2={center + radius - 18}
              className="stroke-teal-500 dark:stroke-teal-400 stroke-2"
            />
            {/* Center dot */}
            <circle cx={center} cy={center} r={4} className="fill-teal-400 dark:fill-teal-300" />
          </g>
        </svg>

        {/* Floating tooltip indicating action */}
        {!disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] bg-white/95 dark:bg-slate-900/90 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded shadow border border-slate-300 dark:border-slate-700 font-medium">
              {dragText}
            </span>
          </div>
        )}
      </div>

      {/* Quick Action Angle Buttons */}
      <div className="grid grid-cols-3 gap-1.5 w-full mt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(-45)}
          className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1 transition-colors active:scale-95 shadow-sm"
          title={t?.rotateMinus45 || 'Obróć o 45° w lewo'}
        >
          <RotateCcw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
          <span>-45°</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(180)}
          className="py-1.5 px-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/70 dark:hover:bg-teal-900 border border-teal-300 dark:border-teal-600/50 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors active:scale-95 shadow-sm"
          title={t?.reverse180 || 'Odwróć wiatr o 180°'}
        >
          <RefreshCw className="w-3 h-3 text-teal-600 dark:text-teal-400" />
          <span>180°</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => rotateBy(45)}
          className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1 transition-colors active:scale-95 shadow-sm"
          title={t?.rotatePlus45 || 'Obróć o 45° w prawo'}
        >
          <span>+45°</span>
          <RotateCw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      {/* Preset Cardinal Buttons */}
      <div className="grid grid-cols-4 gap-1.5 w-full mt-2">
        {[
          { label: 'N', deg: 0, text: '0°' },
          { label: 'E', deg: 90, text: '90°' },
          { label: 'S', deg: 180, text: '180°' },
          { label: 'W', deg: 270, text: '270°' },
        ].map((p) => (
          <button
            key={p.deg}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.deg)}
            className={`py-1.5 px-1 text-xs rounded-lg border transition-all text-center flex items-center justify-center gap-1 ${
              Math.abs(angle - p.deg) < 1
                ? 'bg-teal-600 text-white border-teal-500 font-bold shadow-sm ring-1 ring-teal-400/30'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 shadow-sm'
            }`}
          >
            <span className="font-bold">{p.label}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">({p.text})</span>
          </button>
        ))}
      </div>
    </div>
  );
};
