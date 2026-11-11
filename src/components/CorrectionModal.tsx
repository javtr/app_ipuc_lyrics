import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Flag, X, Send, CheckCircle2 } from 'lucide-react';
import { BaseSong, CorrectionSuggestion } from '../types';
import { db } from '../db';

interface CorrectionModalProps {
  song: BaseSong;
  isOpen: boolean;
  onClose: () => void;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  song,
  isOpen,
  onClose
}) => {
  const [sectionLabel, setSectionLabel] = useState<string>(
    song.sections[0]?.label || 'General'
  );
  const [suggestedFix, setSuggestedFix] = useState<string>('');
  const [reportedBy, setReportedBy] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  useEffect(() => {
    setSectionLabel(song.sections[0]?.label || 'General');
    setSuggestedFix('');
    setIsSubmitted(false);
  }, [song.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestedFix.trim()) return;

    const suggestion: CorrectionSuggestion = {
      id: `sugg_${Date.now()}`,
      songId: song.id,
      songTitle: song.title,
      sectionLabel,
      suggestedFix: suggestedFix.trim(),
      reportedBy: reportedBy.trim() || 'Anónimo',
      createdAt: new Date().toISOString()
    };

    await db.suggestions.add(suggestion);
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setSuggestedFix('');
      onClose();
    }, 2500);
  };

  const modalMarkup = (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Flag className="w-5 h-5 text-amber-400" />
          Reportar Corrección en Catálogo General
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Canción: <strong className="text-slate-200">{song.title}</strong>
        </p>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">¡Sugerencia Guardada en Cola Local!</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Tu corrección quedó guardada en este dispositivo y se enviará al repositorio central cuando se active el módulo en línea (Etapa B).
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Estrofa o Sección con Error
              </label>
              <select
                value={sectionLabel}
                onChange={e => setSectionLabel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {song.sections.map(sec => (
                  <option key={sec.id} value={sec.label}>
                    {sec.label}
                  </option>
                ))}
                <option value="Letra General / Título / Tono">Otra parte / Título general</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Descripción de la Corrección o Errata
              </label>
              <textarea
                required
                rows={4}
                value={suggestedFix}
                onChange={e => setSuggestedFix(e.target.value)}
                placeholder="Indica qué palabra, acorde o estrofa debe corregirse..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tu Nombre o Sede (Opcional)
              </label>
              <input
                type="text"
                value={reportedBy}
                onChange={e => setReportedBy(e.target.value)}
                placeholder="Ej: David - Sede Palestina"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Guardar Sugerencia</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalMarkup, document.body);
  }

  return modalMarkup;
};
