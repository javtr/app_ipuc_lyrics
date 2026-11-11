import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Save, 
  Eye, 
  Music,
  AlignLeft
} from 'lucide-react';
import { BaseSong, SedeSongOverride, SongSection } from '../types';
import { serializeSectionsToText, parseTextToSections } from '../services/chordSerializer';
import { parseChordProLine, getCleanLyrics } from '../services/chordParser';
import { db } from '../db';

interface SongEditorModalProps {
  isOpen: boolean;
  initialSong?: BaseSong | null;
  activeSedeId: string;
  isMusicianMode: boolean;
  onClose: () => void;
  onSave: (savedSong: BaseSong) => void;
}

const COMMON_CHORDS = [
  'G', 'C', 'D', 'Em', 'Am', 'A', 'E', 'F', 'Dm', 'Bm', 'F#m'
];

const CHORD_EXTENSIONS = ['7', 'm7', 'sus4', 'maj7', '/B', '/F#'];

const CHORD_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

export const SongEditorModal: React.FC<SongEditorModalProps> = ({
  isOpen,
  initialSong,
  activeSedeId,
  isMusicianMode,
  onClose,
  onSave
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [originalKey, setOriginalKey] = useState('G');
  const [bpm, setBpm] = useState<number | ''>(72);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [rawText, setRawText] = useState('');
  const [saveTarget, setSaveTarget] = useState<'general' | 'sede'>('general');
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [customChordInput, setCustomChordInput] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cargar datos al abrir el modal
  useEffect(() => {
    if (initialSong) {
      setTitle(initialSong.title);
      setArtist(initialSong.artist || '');
      setOriginalKey(initialSong.originalKey);
      setBpm(initialSong.bpm || '');
      setTimeSignature(initialSong.timeSignature || '4/4');

      const serialized = serializeSectionsToText(initialSong.sections);
      if (!isMusicianMode) {
        // En modo normal/lector, remover corchetes de acordes para que el usuario edite solo texto limpio
        setRawText(serialized.replace(/\[[^\]]+\]/g, ''));
      } else {
        setRawText(serialized);
      }
      setSaveTarget(activeSedeId !== 'general' ? 'sede' : 'general');
    } else {
      // Plantilla para nueva canción
      setTitle('');
      setArtist('');
      setOriginalKey('G');
      setBpm(72);
      setTimeSignature('4/4');

      if (!isMusicianMode) {
        setRawText(`{verse: Verso 1}
Escribe aquí la letra de tu primera estrofa
Cada línea representa una frase del canto

{chorus: Coro}
¡Alabado sea el Señor!
Por siempre y para siempre`);
      } else {
        setRawText(`{verse: Verso 1}
[G]Escribe aquí la letra de tu [C]canción
[D]Inserta acordes fácilmente [Em]tocando los botones

{chorus: Coro}
[C]¡Alabado sea el [G]Señor!
[D]Por siempre y para [G]siempre`);
      }
      setSaveTarget(activeSedeId !== 'general' ? 'sede' : 'general');
    }
    setMobileTab('edit');
  }, [initialSong, activeSedeId, isOpen, isMusicianMode]);

  if (!isOpen) return null;

  // Inserción en la posición del cursor
  const insertTextAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;

    const newText = currentText.substring(0, start) + textToInsert + currentText.substring(end);
    setRawText(newText);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + textToInsert.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertChord = (chord: string) => {
    insertTextAtCursor(`[${chord}]`);
  };

  const insertSection = (type: string, label: string) => {
    insertTextAtCursor(`\n\n{${type}: ${label}}\n`);
  };

  const previewSections: SongSection[] = parseTextToSections(rawText);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Por favor ingresa un título para la canción.');
      return;
    }

    const sections = parseTextToSections(rawText);
    if (sections.length === 0) {
      alert('Por favor escribe al menos una estrofa o sección.');
      return;
    }

    const songId = initialSong
      ? initialSong.id
      : title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    const baseSongData: BaseSong = {
      id: songId,
      title: title.trim(),
      artist: artist.trim() || undefined,
      originalKey: isMusicianMode ? originalKey : (initialSong?.originalKey || 'G'),
      bpm: isMusicianMode && typeof bpm === 'number' ? bpm : initialSong?.bpm,
      timeSignature: isMusicianMode ? timeSignature : (initialSong?.timeSignature || '4/4'),
      sections,
      updatedAt: new Date().toISOString(),
      syncSource: 'local'
    };

    if (saveTarget === 'sede' && activeSedeId !== 'general') {
      const override: SedeSongOverride = {
        id: `${songId}_${activeSedeId}`,
        baseSongId: songId,
        sedeId: activeSedeId,
        customTitle: `${title.trim()} (Versión ${activeSedeId.replace('sede-', '')})`,
        customKey: isMusicianMode ? originalKey : (initialSong?.originalKey || 'G'),
        customSections: sections,
        updatedAt: new Date().toISOString(),
        syncSource: 'local'
      };

      await db.overrides.put(override);

      const exists = await db.songs.get(songId);
      if (!exists) {
        await db.songs.put(baseSongData);
      }
    } else {
      await db.songs.put(baseSongData);
    }

    onSave(baseSongData);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Cabecera del Modal (Fija) */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {isMusicianMode ? (
              <Music className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlignLeft className="w-5 h-5 text-emerald-400" />
            )}
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {initialSong ? `Editar: ${initialSong.title}` : 'Nueva Canción'}
              </h2>
              <span className="text-[10px] text-slate-400">
                {isMusicianMode ? 'Modo Músico (Letra con Acordes)' : 'Modo Congregación (Solo Letra)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pestañas de edición / vista previa en móviles */}
            <div className="flex sm:hidden p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setMobileTab('edit')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  mobileTab === 'edit' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('preview')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  mobileTab === 'preview' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                Vista Previa
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formulario Principal con Scroll Vertical Unificado y Continuo */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-3 sm:p-5 space-y-4 flex-1">
            {/* Metadatos Básicos */}
            <div className={`grid gap-3 ${isMusicianMode ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2'}`}>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Título de la Canción *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Sublime Gracia"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Artista o Autor (Opcional)</label>
                <input
                  type="text"
                  value={artist}
                  onChange={e => setArtist(e.target.value)}
                  placeholder="Ej: John Newton / Himnario"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Campos de teoría musical (Solo visibles en Modo Músico) */}
              {isMusicianMode && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tono Original *</label>
                    <select
                      value={originalKey}
                      onChange={e => setOriginalKey(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    >
                      {CHORD_KEYS.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">BPM (Tempo)</label>
                    <input
                      type="number"
                      min="40"
                      max="240"
                      value={bpm}
                      onChange={e => setBpm(e.target.value ? Number(e.target.value) : '')}
                      placeholder="72"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Compás</label>
                    <select
                      value={timeSignature}
                      onChange={e => setTimeSignature(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="4/4">4/4</option>
                      <option value="3/4">3/4</option>
                      <option value="6/8">6/8</option>
                      <option value="2/4">2/4</option>
                      <option value="12/8">12/8</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Asistente de inserción táctil */}
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              {/* Barra de acordes (SOLO si isMusicianMode === true) */}
              {isMusicianMode && (
                <div className="space-y-1.5 pb-2 border-b border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold flex items-center gap-1">
                      <Music className="w-3.5 h-3.5 text-emerald-400" />
                      Insertar Acorde en el Cursor:
                    </span>
                    <span className="text-[10px] text-slate-500 hidden sm:inline">Toca para añadir [acorde]</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {COMMON_CHORDS.map(chord => (
                      <button
                        key={chord}
                        type="button"
                        onClick={() => insertChord(chord)}
                        className="px-2 py-1 bg-slate-800 hover:bg-emerald-600 hover:text-white text-emerald-300 font-bold text-xs rounded-lg border border-slate-700 transition-colors"
                      >
                        [{chord}]
                      </button>
                    ))}

                    {CHORD_EXTENSIONS.map(ext => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => insertChord(`${originalKey}${ext}`)}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono text-[11px] rounded-lg border border-slate-800 transition-colors"
                      >
                        [{originalKey}{ext}]
                      </button>
                    ))}

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Otro"
                        value={customChordInput}
                        onChange={e => setCustomChordInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (customChordInput.trim()) {
                              insertChord(customChordInput.trim());
                              setCustomChordInput('');
                            }
                          }
                        }}
                        className="w-14 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customChordInput.trim()) {
                            insertChord(customChordInput.trim());
                            setCustomChordInput('');
                          }
                        }}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 rounded"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Atajos de secciones (Disponibles para todos) */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Añadir Sección:</span>
                <button
                  type="button"
                  onClick={() => insertSection('verse', 'Verso')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-medium transition-colors"
                >
                  + Verso
                </button>
                <button
                  type="button"
                  onClick={() => insertSection('chorus', 'Coro')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded-lg font-medium transition-colors"
                >
                  + Coro
                </button>
                <button
                  type="button"
                  onClick={() => insertSection('bridge', 'Puente')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs rounded-lg font-medium transition-colors"
                >
                  + Puente
                </button>
              </div>
            </div>

            {/* Zona de Trabajo (Editor y Vista Previa) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Panel de Edición de Letra */}
              <div className={`flex flex-col space-y-1.5 ${mobileTab === 'preview' ? 'hidden sm:flex' : 'flex'}`}>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold">Letra de la Canción:</span>
                  <span className="text-[11px] text-slate-500">
                    {isMusicianMode ? 'Usa {verse: Verso 1} y [G] para acordes' : 'Organiza en estrofas'}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  rows={10}
                  placeholder={
                    isMusicianMode
                      ? 'Escribe la letra con acordes [G] y secciones {verse: Verso 1}...'
                      : 'Escribe aquí la letra de tu canción dividida por estrofas...'
                  }
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm font-mono text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-500 min-h-[220px]"
                />
              </div>

              {/* Panel de Previsualización en Tiempo Real */}
              <div className={`flex flex-col space-y-1.5 ${mobileTab === 'edit' ? 'hidden sm:flex' : 'flex'}`}>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold">Vista Previa:</span>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 min-h-[220px] max-h-[350px] overflow-y-auto">
                  {previewSections.map(section => {
                    const isChorus = section.type === 'chorus';

                    return (
                      <div 
                        key={section.id} 
                        className={`p-2.5 rounded-lg border ${
                          isChorus 
                            ? 'bg-slate-900 border-l-4 border-emerald-500 border-slate-800' 
                            : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${
                          isChorus ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {section.label}
                        </span>

                        <div className="space-y-1.5 text-xs">
                          {isMusicianMode ? (
                            section.lines.map((line, idx) => {
                              const tokens = parseChordProLine(line);
                              return (
                                <div key={idx} className="flex flex-wrap items-end gap-x-1.5 py-0.5">
                                  {tokens.map((token, tIdx) => (
                                    <span key={tIdx} className="inline-flex flex-col">
                                      {token.chord ? (
                                        <span className="text-[10px] font-bold text-emerald-400 leading-none">
                                          {token.chord}
                                        </span>
                                      ) : (
                                        <span className="h-2 leading-none select-none"></span>
                                      )}
                                      <span className="text-slate-200 whitespace-pre">
                                        {token.text || ' '}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              );
                            })
                          ) : (
                            getCleanLyrics(section.lines).map((cleanLine, idx) => (
                              <p key={idx} className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                                {cleanLine || <br />}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {previewSections.length === 0 && (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Escribe la letra para previsualizar aquí.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Barra Inferior de Guardado (Fija al Fondo del Modal) */}
          <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              {activeSedeId !== 'general' && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-400 font-medium">Destino:</label>
                  <select
                    value={saveTarget}
                    onChange={e => setSaveTarget(e.target.value as 'general' | 'sede')}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-semibold text-emerald-300 focus:outline-none"
                  >
                    <option value="sede">Versión de mi Sede ({activeSedeId})</option>
                    <option value="general">Catálogo General Nacional</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Canción</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
