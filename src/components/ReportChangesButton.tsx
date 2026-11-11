import React from 'react';
import { Flag } from 'lucide-react';

interface ReportChangesButtonProps {
  onClick?: () => void;
}

/**
 * Botón discreto ubicado al pie de cada canción para reportar erratas o cambios sugeridos.
 */
export const ReportChangesButton: React.FC<ReportChangesButtonProps> = ({ onClick }) => {
  if (!onClick) return null;

  return (
    <div className="mt-6 pt-4 border-t border-slate-800/70 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/70 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-xs font-medium text-slate-400 hover:text-amber-300 transition-colors"
      >
        <Flag className="w-3.5 h-3.5 text-amber-400" />
        <span>Reportar cambios</span>
      </button>
    </div>
  );
};
