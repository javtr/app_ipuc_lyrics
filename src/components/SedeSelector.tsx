import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Church, Wifi, WifiOff, Plus, Check, X, RefreshCw } from 'lucide-react';
import { SedeProfile, SyncStatus } from '../types';
import { normalizeSedeSlug, saveCustomSede } from '../services/gitSyncService';

interface SedeSelectorProps {
  activeSedeId: string;
  onSelectSede: (sedeId: string) => void;
  isOnline: boolean;
  isOpenControlled?: boolean;
  onCloseControlled?: () => void;
  sedesList?: SedeProfile[];
  syncStatus?: SyncStatus;
  lastSyncAt?: string | null;
  onManualSync?: () => void;
}

export const SEDES_LIST: SedeProfile[] = [
  { id: 'general', name: 'Catálogo General (Nacional)', shortName: 'General', isDefault: true },
  { id: 'sede-palestina', name: 'Sede Palestina (Caldas)', shortName: 'Palestina' },
  { id: 'sede-central', name: 'Sede Central', shortName: 'Central' }
];

function formatLastSyncLabel(isoDate?: string | null): string {
  if (!isoDate) return 'Sin sincronización reciente';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Actualizado';
  return `Actualizado: ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export const SedeSelector: React.FC<SedeSelectorProps> = ({
  activeSedeId,
  onSelectSede,
  isOnline,
  isOpenControlled,
  onCloseControlled,
  sedesList,
  syncStatus = 'idle',
  lastSyncAt,
  onManualSync
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [sedes, setSedes] = useState<SedeProfile[]>(sedesList && sedesList.length > 0 ? sedesList : SEDES_LIST);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');

  useEffect(() => {
    if (!sedesList || sedesList.length === 0) return;
    setSedes(prev => {
      const merged = [...sedesList];
      for (const localSede of prev) {
        if (!merged.some(s => s.id === localSede.id)) {
          merged.push(localSede);
        }
      }
      return merged;
    });
  }, [sedesList]);

  const isOpen = isOpenControlled !== undefined ? isOpenControlled : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    setInternalIsOpen(val);
    if (!val && onCloseControlled) {
      onCloseControlled();
    }
  };

  const currentSede = sedes.find(s => s.id === activeSedeId) || sedes[0];

  const handleCreateSede = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSedeName.trim();
    if (!cleanName) return;

    const slug = normalizeSedeSlug(cleanName);
    const id = slug.startsWith('sede-') ? slug : `sede-${slug}`;
    const displayName = /^sede\b/i.test(cleanName) ? cleanName : `Sede ${cleanName}`;
    const newProfile: SedeProfile = {
      id,
      name: displayName,
      shortName: cleanName
    };

    saveCustomSede(newProfile);
    setSedes(prev => (prev.some(s => s.id === id) ? prev : [...prev, newProfile]));
    onSelectSede(id);
    setNewSedeName('');
    setShowAddModal(false);
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      {/* Indicador de conexión */}
      <div
        title={isOnline ? 'En línea' : 'Modo Offline (IndexedDB activo)'}
        className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border shrink-0 ${
          isOnline
            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
            : 'bg-amber-950/60 text-amber-400 border-amber-800'
        }`}
      >
        {isOnline ? <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
        <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {/* Botón selector de sede compacto */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-medium transition-colors shrink-0"
      >
        <Church className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
        <span className="max-w-[90px] sm:max-w-[160px] truncate">
          {currentSede.shortName || currentSede.name.replace('Catálogo ', '')}
        </span>
      </button>

      {/* Modal / Bottom Sheet renderizado fuera del header con React Portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden py-2 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
          >
            {/* Cabecera del modal */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Seleccionar Congregación
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cambia entre el catálogo general y las versiones locales.
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de sedes */}
            <div className="overflow-y-auto py-1 flex-1">
              {sedes.map(sede => (
                <button
                  key={sede.id}
                  onClick={() => {
                    onSelectSede(sede.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-xs sm:text-sm transition-colors ${
                    sede.id === activeSedeId
                      ? 'bg-emerald-950/60 text-emerald-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Church className={`w-4 h-4 shrink-0 ${sede.id === activeSedeId ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div className="truncate">
                      <span className="block truncate">{sede.name}</span>
                      {sede.shortName && (
                        <span className="text-[10px] text-slate-500 block">Identificador: {sede.shortName}</span>
                      )}
                    </div>
                  </div>
                  {sede.id === activeSedeId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>

            {/* Estado de actualización y botón para añadir nueva sede */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/50 space-y-2">
              {onManualSync && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] text-slate-400 truncate">
                    {syncStatus === 'syncing'
                      ? 'Actualizando cancionero...'
                      : syncStatus === 'error'
                        ? 'No se pudo actualizar (usando local)'
                        : !isOnline
                          ? 'Sin conexión (modo local)'
                          : formatLastSyncLabel(lastSyncAt)}
                  </span>
                  <button
                    type="button"
                    onClick={onManualSync}
                    disabled={!isOnline || syncStatus === 'syncing'}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-emerald-400 disabled:opacity-40 transition-colors shrink-0"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowAddModal(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Registrar nueva Sede</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal para Crear Nueva Sede renderizado con React Portal */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div 
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Church className="w-5 h-5 text-emerald-400" />
              Crear Nueva Sede
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Esta acción crea una nueva rama independiente en la arquitectura Git detrás de escena.
            </p>

            <form onSubmit={handleCreateSede} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre de la Congregación o Municipio
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Chinchiná, Manizales Norte, Pereira"
                  value={newSedeName}
                  onChange={e => setNewSedeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  Confirmar y Crear Sede
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
