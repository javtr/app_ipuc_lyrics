import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SetlistNavProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReturnToSetlist: () => void;
}

/**
 * Control compacto de navegación en 3 partes (< | Repertorio | >) para recorrer canciones de un culto.
 */
export const SetlistNavControls: React.FC<SetlistNavProps> = ({
  canPrev,
  canNext,
  onPrev,
  onNext,
  onReturnToSetlist
}) => {
  return (
    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        title="Canción anterior del repertorio"
        aria-label="Canción anterior del repertorio"
        className="p-1.5 sm:px-2 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
      <button
        type="button"
        onClick={onReturnToSetlist}
        title="Volver al repertorio"
        className="px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 border-x border-slate-800 transition-colors whitespace-nowrap"
      >
        Repertorio
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        title="Siguiente canción del repertorio"
        aria-label="Siguiente canción del repertorio"
        className="p-1.5 sm:px-2 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
};
