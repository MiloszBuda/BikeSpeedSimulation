import React from 'react';
import { Bike, Award, Sparkles, Server } from 'lucide-react';

interface HeaderProps {
  isBackendOnline: boolean;
  onLoadDemo: () => void;
  onOpenChungModal: () => void;
  hasData: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isBackendOnline,
  onLoadDemo,
  onOpenChungModal,
  hasData,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-lg shadow-teal-500/20 text-white">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100 tracking-tight flex items-center gap-2">
              AeroBike <span className="text-xs bg-teal-500/20 text-teal-300 font-mono px-2 py-0.5 rounded border border-teal-500/30">PRO</span>
            </h1>
            <p className="text-xs text-slate-400">
              Szacowanie prędkości roweru od wiatru & Metoda Chunga (VE)
            </p>
          </div>
        </div>

        {/* Action Buttons & Status */}
        <div className="flex items-center gap-3">
          {/* Backend Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/80 rounded-full border border-slate-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-400 font-mono text-[11px]">
              {isBackendOnline ? 'Backend Online' : 'Tryb Demo / Offline'}
            </span>
          </div>

          {/* Load Demo Route Button */}
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 shadow transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Wczytaj trasę demo (12 km)
          </button>

          {/* Chung VE Modal Button */}
          {hasData && (
            <button
              type="button"
              onClick={onOpenChungModal}
              className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow transition-colors"
            >
              <Award className="w-3.5 h-3.5 text-indigo-400" />
              Estymacja CdA (Chung)
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
