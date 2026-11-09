import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Download, 
  Upload, 
  ShieldCheck, 
  ShieldAlert, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle,
  FileJson
} from 'lucide-react';
import { 
  downloadBackupFile, 
  importBackupFromJson, 
  checkAndRequestStoragePersistence 
} from '../services/backupService';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored
}) => {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      checkAndRequestStoragePersistence()
        .then(result => setIsPersisted(result))
        .catch(() => setIsPersisted(false));
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const filename = await downloadBackupFile();
      setFeedback({
        type: 'success',
        message: `¡Copia de seguridad "${filename}" descargada con éxito! Puedes enviarla por WhatsApp a otros músicos.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'No se pudo generar el archivo de respaldo: ' + (err as Error).message
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setFeedback(null);
      const text = await file.text();
      const stats = await importBackupFromJson(text);

      setFeedback({
        type: 'success',
        message: `¡Restauración exitosa! Se sincronizaron ${stats.songsCount} canciones, ${stats.overridesCount} versiones de sede y ${stats.setlistsCount} repertorios.`
      });

      onDataRestored();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return createPortal(
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-5 sm:p-6 animate-in zoom-in-95 duration-200 space-y-5"
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base sm:text-lg font-bold text-white">
              Copia de Seguridad y Datos
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de feedback si existe */}
        {feedback && (
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border border-rose-700 text-rose-200'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            )}
            <p className="leading-relaxed">{feedback.message}</p>
          </div>
        )}

        {/* Sección 1: Exportar Respaldo */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Exportar Respaldo de Sede</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Descarga un archivo <code className="text-emerald-400">.json</code> con todas las canciones, versiones locales y repertorios guardados en este dispositivo.
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isExporting ? 'Generando archivo...' : 'Descargar Copia de Seguridad'}</span>
          </button>
        </div>

        {/* Sección 2: Restaurar Respaldo */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-white">Restaurar Copia de Seguridad</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Carga un archivo de respaldo generado en otro teléfono o computador para sincronizar el catálogo localmente sin conexión.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-950 transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isImporting ? 'Sincronizando canciones...' : 'Seleccionar Archivo de Respaldo'}</span>
          </button>
        </div>

        {/* Sección 3: Estado de Persistencia en Memoria (iOS Safari Shield) */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            {isPersisted ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold text-slate-300 block text-[11px]">
                {isPersisted ? 'Memoria Persistente Activa' : 'Almacenamiento Estándar'}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {isPersisted 
                  ? 'Tus canciones están blindadas contra la purga de Safari/iOS'
                  : 'Sujeto a las políticas de espacio del navegador'
                }
              </span>
            </div>
          </div>
        </div>

        {/* Botón de Cierre */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
