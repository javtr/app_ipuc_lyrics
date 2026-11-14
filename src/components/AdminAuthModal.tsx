import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Unlock, X, CloudUpload, LogOut, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import { AdminSession, SedeProfile } from '../types';
import {
  AuthRateLimitError,
  clearStoredSession,
  getAuthGuardState,
  loginAdmin
} from '../services/cloudApiService';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSedeId: string;
  sedesList: SedeProfile[];
  currentSession: AdminSession | null;
  pendingCount: number;
  isOnline: boolean;
  onSessionChanged: (session: AdminSession | null) => void;
  onFlushPending: () => Promise<void>;
}

/**
 * Modal de acceso para líderes de sede y Administrador General (sin exponer detalles técnicos de Git).
 */
export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  activeSedeId,
  sedesList,
  currentSession,
  pendingCount,
  isOnline,
  onSessionChanged,
  onFlushPending
}) => {
  const [targetScope, setTargetScope] = useState<string>(activeSedeId || 'general');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number>(5);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      const nextScope = activeSedeId || 'general';
      setTargetScope(nextScope);
      setPassword('');
      setErrorMsg(null);
      const guard = getAuthGuardState(nextScope);
      setLockedUntil(guard.lockedUntil);
      setRemainingAttempts(guard.remainingAttempts);
    }
  }, [isOpen, activeSedeId]);

  useEffect(() => {
    if (!isOpen) return;
    const guard = getAuthGuardState(targetScope);
    setLockedUntil(guard.lockedUntil);
    setRemainingAttempts(guard.remainingAttempts);
    setErrorMsg(null);
  }, [isOpen, targetScope]);

  useEffect(() => {
    if (!isOpen || lockedUntil <= Date.now()) {
      setRemainingSeconds(0);
      return;
    }

    const updateTimer = () => {
      const diffMs = lockedUntil - Date.now();
      if (diffMs <= 0) {
        setRemainingSeconds(0);
        setLockedUntil(0);
        setRemainingAttempts(5);
        setErrorMsg(null);
      } else {
        setRemainingSeconds(Math.ceil(diffMs / 1000));
      }
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, lockedUntil]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getScopeLabel = (scopeId: string) => {
    if (scopeId === 'general') return 'Administrador General (Catálogo Oficial)';
    return sedesList.find(s => s.id === scopeId)?.name || scopeId;
  };

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isLocked = remainingSeconds > 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLocked) return;
    if (!isOnline) {
      setErrorMsg('Necesitas conexión a internet para validar tu contraseña en la nube.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const session = await loginAdmin(targetScope, password);
      onSessionChanged(session);
      setPassword('');
      onClose();
    } catch (err) {
      if (err instanceof AuthRateLimitError) {
        setLockedUntil(err.lockedUntil);
        setRemainingAttempts(0);
        setPassword('');
      } else {
        const guard = getAuthGuardState(targetScope);
        setRemainingAttempts(guard.remainingAttempts);
      }
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearStoredSession();
    onSessionChanged(null);
  };

  const handleManualFlush = async () => {
    setIsFlushing(true);
    setErrorMsg(null);
    try {
      await onFlushPending();
    } finally {
      setIsFlushing(false);
    }
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-400">
              {currentSession ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {currentSession ? 'Sesión de Administración Activa' : 'Acceso de Líder / Administrador'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Sincroniza automáticamente cambios entre dispositivos en la nube.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar acceso"
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentSession ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/60 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {currentSession.role === 'master'
                    ? 'Administrador General (Acceso Total)'
                    : `Líder autorizado: ${getScopeLabel(currentSession.sedeId)}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Los cambios que guardes se enviarán a la nube cuando tengas conexión.
              </p>
            </div>

            {pendingCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center justify-between gap-3">
                <span className="text-xs text-amber-200">
                  {pendingCount} cambio(s) pendiente(s) por subir.
                </span>
                <button
                  type="button"
                  onClick={handleManualFlush}
                  disabled={!isOnline || isFlushing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white disabled:opacity-40 transition-colors shrink-0"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>{isFlushing ? 'Subiendo...' : 'Subir ahora'}</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {pendingCount > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-200">
                Tienes <strong>{pendingCount}</strong> cambio(s) guardados localmente listos para subir al iniciar sesión.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Perfil / Sede a administrar
              </label>
              <select
                value={targetScope}
                onChange={e => setTargetScope(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {sedesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.id === 'general' ? 'Administrador General (Catálogo Oficial)' : s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Contraseña de acceso
              </label>
              <input
                type="password"
                required
                disabled={isLocked}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={
                  isLocked ? 'Acceso bloqueado temporalmente' : 'Ingresa la clave de tu sede o clave maestra'
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {isLocked ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex items-start gap-2.5">
                <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-100">
                    Acceso bloqueado temporalmente por seguridad
                  </p>
                  <p className="text-[11px] text-amber-300">
                    Superaste los 5 intentos permitidos. Vuelve a intentarlo en{' '}
                    <span className="font-mono font-bold text-white">
                      {formatCountdown(remainingSeconds)}
                    </span>
                    .
                  </p>
                </div>
              </div>
            ) : (
              remainingAttempts > 0 &&
              remainingAttempts < 5 && (
                <div className="px-3 py-2 rounded-xl bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-200">
                  Intentos restantes antes del bloqueo temporal:{' '}
                  <strong className="text-white">{remainingAttempts}</strong>
                </div>
              )
            )}

            {errorMsg && !isLocked && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLocked}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>
                  {isLocked ? `Espera ${formatCountdown(remainingSeconds)}` : isSubmitting ? 'Verificando...' : 'Ingresar'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
