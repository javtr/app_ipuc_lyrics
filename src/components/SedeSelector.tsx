import React, { useState } from 'react';
import { Church, Wifi, WifiOff, Plus, Check, X } from 'lucide-react';
import { SedeProfile } from '../types';

interface SedeSelectorProps {
  activeSedeId: string;
  onSelectSede: (sedeId: string) => void;
  isOnline: boolean;
  isOpenControlled?: boolean;
  onCloseControlled?: () => void;
}

export const SEDES_LIST: SedeProfile[] = [
  { id: 'general', name: 'Catálogo General (Nacional)', isDefault: true },
  { id: 'sede-palestina', name: 'Sede Palestina (Caldas)' },
  { id: 'sede-central', name: 'Sede Central' }
];

export const SedeSelector: React.FC<SedeSelectorProps> = ({
  activeSedeId,
  onSelectSede,
  isOnline,
  isOpenControlled,
  onCloseControlled
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [sedes, setSedes] = useState<SedeProfile[]>(SEDES_LIST);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');

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
    if (!newSedeName.trim()) return;

    const id = `sede-${newSedeName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const newProfile: SedeProfile = {
      id,
      name: `Sede ${newSedeName}`
    };

    setSedes([...sedes, newProfile]);
    onSelectSede(id);
    setNewSedeName('');
    setShowAddModal(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Connection status indicator */}
        <div
          title={isOnline ? 'En línea' : 'Modo Offline (IndexedDB activo)'}
          className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border ${
            isOnline
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
              : 'bg-amber-950/60 text-amber-400 border-amber-800'
          }`}
        >
          {isOnline ? <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Sede switcher button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-medium transition-colors"
        >
          <Church className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          <span className="max-w-[100px] xs:max-w-[130px] sm:max-w-[180px] truncate">
            {currentSede.name.replace('Catálogo ', '')}
          </span>
        </button>
      </div>

      {/* Sede Modal / Dropdown adaptativo */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end sm:p-4 bg-black/60 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none">
          <div className="w-full sm:w-80 bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden py-2 animate-in fade-in slide-in-from-bottom duration-200 sm:mt-12">
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Seleccionar Congregación
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cambia entre el catálogo general y las versiones locales.
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white sm:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {sedes.map(sede => (
                <button
                  key={sede.id}
                  onClick={() => {
                    onSelectSede(sede.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs sm:text-sm transition-colors ${
                    sede.id === activeSedeId
                      ? 'bg-emerald-950/60 text-emerald-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Church className={`w-4 h-4 shrink-0 ${sede.id === activeSedeId ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span className="truncate">{sede.name}</span>
                  </div>
                  {sede.id === activeSedeId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/50">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowAddModal(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Registrar nueva Sede</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Crear Nueva Sede */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
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
        </div>
      )}
    </div>
  );
};
