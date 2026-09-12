import React from 'react';
import { Bike, Award, Sparkles, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

interface HeaderProps {
  isBackendOnline: boolean;
  isCheckingBackend?: boolean;
  isBlockedByClient?: boolean;
  onRetryBackend?: () => void;
  onLoadDemo: () => void;
  onOpenChungModal: () => void;
  hasData: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isBackendOnline,
  isCheckingBackend = false,
  isBlockedByClient = false,
  onRetryBackend,
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
          {/* Interactive Backend Status Badge */}
          <button
            type="button"
            onClick={onRetryBackend}
            disabled={isCheckingBackend}
            title={
              isBlockedByClient
                ? "Przeglądarka zablokowała zapytanie do serwera (ERR_BLOCKED_BY_CLIENT). Wyłącz wtyczkę Adblock, uBlock Origin lub Brave Shields dla strony miloszbuda.github.io, aby odblokować połączenie z Renderem."
                : "Serwer Render (Free Tier) może usypiać po 15 min bezczynności. Kliknij, aby sprawdzić i wybudzić serwer."
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              isCheckingBackend
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 cursor-wait'
                : isBackendOnline
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/40 cursor-pointer shadow-sm shadow-emerald-950/50'
                : isBlockedByClient
                ? 'bg-rose-950/60 border-rose-600/80 text-rose-200 hover:bg-rose-900/60 cursor-pointer shadow-sm shadow-rose-950/50 ring-1 ring-rose-500/40'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-900/40 cursor-pointer shadow-sm shadow-rose-950/50'
            }`}
          >
            {isCheckingBackend ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span className="font-mono text-[11px]">Łączenie z Renderem...</span>
              </>
            ) : isBackendOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px]">Render Online</span>
              </>
            ) : isBlockedByClient ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="font-mono text-[11px]">Zablokowane przez Adblock</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="font-mono text-[11px]">Render Offline (połącz)</span>
                <RefreshCw className="w-2.5 h-2.5 ml-0.5 text-rose-400 opacity-80" />
              </>
            )}
          </button>

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
