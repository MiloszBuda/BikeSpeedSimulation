import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  title?: string;
  content: string;
  physicsNote?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
  iconClassName?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  title,
  content,
  physicsNote,
  position = 'top',
  children,
  iconClassName = 'w-3.5 h-3.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 transition-colors',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside (especially useful on mobile)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position];

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center group cursor-pointer"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
      }}
    >
      {children || (
        <button
          type="button"
          aria-label={title || 'Informacja'}
          className="focus:outline-none flex items-center"
        >
          <HelpCircle className={iconClassName} />
        </button>
      )}

      {/* Floating Popover / Tooltip */}
      <div
        className={`absolute ${positionClasses} z-50 w-64 sm:w-72 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-200 ${
          isOpen
            ? 'opacity-100 visible scale-100 translate-y-0'
            : 'opacity-0 invisible scale-95 pointer-events-none'
        }`}
        style={{ filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.15))' }}
      >
        {title && (
          <div className="font-semibold text-xs text-teal-600 dark:text-teal-300 mb-1 border-b border-slate-200 dark:border-slate-800 pb-1 flex items-center justify-between">
            <span>{title}</span>
          </div>
        )}
        <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
          {content}
        </div>
        {physicsNote && (
          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-800/80 text-[10px] text-amber-800 dark:text-amber-200/90 leading-tight flex gap-1">
            <span className="font-semibold text-amber-600 dark:text-amber-400 shrink-0">💡 Fizyka:</span>
            <span>{physicsNote}</span>
          </div>
        )}
      </div>
    </div>
  );
};
