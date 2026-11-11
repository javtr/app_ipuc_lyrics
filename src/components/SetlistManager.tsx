import React, { useState } from 'react';
import { 
  ListMusic, 
  Plus, 
  Trash2, 
  Share2, 
  Copy, 
  Check, 
  ArrowUp, 
  ArrowDown, 
  Calendar,
  ExternalLink,
  HardDrive
} from 'lucide-react';
import { BaseSong, Setlist, SetlistItem } from '../types';
import { generateShareableUrl, generateWhatsAppLink } from '../services/urlSharing';
import { db } from '../db';

interface SetlistManagerProps {
  songs: BaseSong[];
  activeSedeId: string;
  savedSetlists: Setlist[];
  isMusicianMode?: boolean;
  onSelectSong: (songId: string, sourceSedeId?: string) => void;
  onSetlistsUpdated: () => void;
  onOpenBackup?: () => void;
}

export const SetlistManager: React.FC<SetlistManagerProps> = ({
  songs,
  activeSedeId,
  savedSetlists,
  isMusicianMode = false,
  onSelectSong,
  onSetlistsUpdated,
  onOpenBackup
}) => {
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(
    savedSetlists[0]?.id || null
  );
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>(songs[0]?.id || '');
  const [selectedKeyToAdd, setSelectedKeyToAdd] = useState<string>('G');

  const currentSetlist = savedSetlists.find(s => s.id === activeSetlistId);

  const handleCreateSetlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    const newSet: Setlist = {
      id: `setlist_${Date.now()}`,
      name: newSetName.trim(),
      date: new Date().toISOString().split('T')[0],
      sedeId: activeSedeId,
      items: [],
      createdAt: new Date().toISOString()
    };

    await db.setlists.add(newSet);
    setActiveSetlistId(newSet.id);
    setIsCreatingNew(false);
    setNewSetName('');
    onSetlistsUpdated();
  };

  const handleAddSongToSetlist = async () => {
    if (!currentSetlist || !selectedSongToAdd) return;
    const song = songs.find(s => s.id === selectedSongToAdd);
    if (!song) return;

    const newItem: SetlistItem = {
      songId: song.id,
      key: selectedKeyToAdd || song.originalKey,
      order: currentSetlist.items.length + 1
    };

    const updatedItems = [...currentSetlist.items, newItem];
    await db.setlists.update(currentSetlist.id, { items: updatedItems });
    onSetlistsUpdated();
  };

  const handleRemoveItem = async (index: number) => {
    if (!currentSetlist) return;
    const updatedItems = currentSetlist.items
      .filter((_, idx) => idx !== index)
      .map((item, idx) => ({ ...item, order: idx + 1 }));

    await db.setlists.update(currentSetlist.id, { items: updatedItems });
    onSetlistsUpdated();
  };

  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    if (!currentSetlist) return;
    const items = [...currentSetlist.items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    const reordered = items.map((item, idx) => ({ ...item, order: idx + 1 }));
    await db.setlists.update(currentSetlist.id, { items: reordered });
    onSetlistsUpdated();
  };

  const handleShare = () => {
    if (!currentSetlist) return;
    const shareUrl = generateShareableUrl(currentSetlist);
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const shareUrl = currentSetlist ? generateShareableUrl(currentSetlist) : '';
  const whatsAppUrl = currentSetlist ? generateWhatsAppLink(currentSetlist, shareUrl) : '';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28">
      {/* Selector de Repertorios Guardados */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Repertorios de Culto</h2>
          </div>

          <div className="flex items-center gap-2">
            {onOpenBackup && (
              <button
                onClick={onOpenBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
                title="Respaldar o restaurar listas de culto en este dispositivo"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Copia de Seguridad</span>
                <span className="sm:hidden">Respaldar</span>
              </button>
            )}

            <button
              onClick={() => setIsCreatingNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Repertorio</span>
            </button>
          </div>
        </div>

        {/* Pestañas de repertorios */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {savedSetlists.map(set => (
            <button
              key={set.id}
              onClick={() => setActiveSetlistId(set.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-2 border ${
                set.id === activeSetlistId
                  ? 'bg-slate-800 text-emerald-300 border-emerald-600/50 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
              }`}
            >
              <span>{set.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-500">
                {set.items.length}
              </span>
            </button>
          ))}

          {savedSetlists.length === 0 && (
            <p className="text-xs text-slate-500 py-2">
              No hay repertorios guardados aún. Presiona "Nuevo Repertorio" para crear uno.
            </p>
          )}
        </div>
      </div>

      {/* Detalle del Repertorio Activo */}
      {currentSetlist && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-bold text-white">{currentSetlist.name}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <Calendar className="w-3.5 h-3.5" />
                Fecha: {currentSetlist.date} • Sede: {currentSetlist.sedeId}
              </p>
            </div>

            {/* Botones de Compartición */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-colors"
                title="Copiar enlace comprimido al portapapeles"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
              </button>

              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white shadow-lg shadow-emerald-950 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir por WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Lista de Canciones del Culto */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Orden del Servicio ({currentSetlist.items.length} canciones)
            </h4>

            {currentSetlist.items.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Añade canciones a este culto usando el selector inferior.
              </div>
            ) : (
              currentSetlist.items.map((item, idx) => {
                const song = songs.find(s => s.id === item.songId);
                return (
                  <div
                    key={`${item.songId}_${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-slate-400">
                        {item.order}
                      </span>
                      <div>
                        <button
                          onClick={() => onSelectSong(item.songId, currentSetlist.sedeId)}
                          className="text-sm font-semibold text-white hover:text-emerald-400 text-left transition-colors flex items-center gap-1.5"
                        >
                          <span>{song?.title || item.songId}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        {isMusicianMode && (
                          <span className="text-xs text-slate-400">
                            Tono: <strong className="text-emerald-400">{item.key}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveItem(idx, 'up')}
                        disabled={idx === 0}
                        title="Subir en el orden"
                        className="p-1.5 rounded-lg hover:bg-slate-850 text-slate-400 hover:text-white disabled:opacity-20"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveItem(idx, 'down')}
                        disabled={idx === currentSetlist.items.length - 1}
                        title="Bajar en el orden"
                        className="p-1.5 rounded-lg hover:bg-slate-850 text-slate-400 hover:text-white disabled:opacity-20"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        title="Eliminar del repertorio"
                        className="p-1.5 rounded-lg hover:bg-rose-950/50 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Formulario para Agregar Canción al Repertorio */}
          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 mb-2">Agregar Canción al Culto</h4>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <select
                value={selectedSongToAdd}
                onChange={e => {
                  setSelectedSongToAdd(e.target.value);
                  const song = songs.find(s => s.id === e.target.value);
                  if (song) setSelectedKeyToAdd(song.originalKey);
                }}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {songs.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title} {isMusicianMode ? `(${s.originalKey})` : ''}
                  </option>
                ))}
              </select>

              {isMusicianMode && (
                <input
                  type="text"
                  placeholder="Tono"
                  value={selectedKeyToAdd}
                  onChange={e => setSelectedKeyToAdd(e.target.value.toUpperCase())}
                  className="w-20 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white text-center focus:outline-none focus:border-emerald-500"
                />
              )}

              <button
                onClick={handleAddSongToSetlist}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Repertorio */}
      {isCreatingNew && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Nuevo Repertorio de Culto
            </h3>
            <form onSubmit={handleCreateSetlist} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre o Motivo del Culto
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Culto Dominical Mañana, Vigilia de Jóvenes"
                  value={newSetName}
                  onChange={e => setNewSetName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  Crear Lista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
