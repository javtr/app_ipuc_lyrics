import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RotateCcw, Trash2, X } from 'lucide-react';

interface ConfirmDialogModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Diálogo de confirmación React Portal compatible con iOS Safari, PWA standalone y navegadores integrados
 * (reemplaza window.confirm/alert nativos que iOS puede suprimir).
 */
export const ConfirmDialogModal: React.FC<ConfirmDialogModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isProcessing = false,
  onCancel,
  onConfirm
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!isProcessing) onCancel();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 safe-bottom"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isDanger
                  ? 'bg-rose-950/60 border-rose-700/60 text-rose-400'
                  : 'bg-amber-950/60 border-amber-700/60 text-amber-400'
              }`}
            >
              {isDanger ? <Trash2 className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
            </div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-white leading-snug">
              {title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            aria-label="Cerrar confirmación"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed flex items-start gap-2">
          <AlertTriangle
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isDanger ? 'text-rose-400' : 'text-amber-400'
            }`}
          />
          <span>{message}</span>
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/70 hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-colors ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {isProcessing ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
