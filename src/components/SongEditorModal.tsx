import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Eye,
  Music,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Minus,
  Plus
} from 'lucide-react';
import { BaseSong, SedeSongOverride, SongSection } from '../types';
import { serializeSectionsToText, parseTextToSections } from '../services/chordSerializer';
import {
  getCleanLyrics,
  getSemitoneDifference,
  transposeChord,
  transposeChordProText
} from '../services/chordParser';
import {
  buildOverrideTitle,
  generateUniqueSongSlug,
  hasChordAnnotations,
  restoreChordsInEditedSections
} from '../services/songEditorHelper';
import { db } from '../db';
import { ChordProLineView } from './ChordProLineView';

interface SongEditorModalProps {
  isOpen: boolean;
  initialSong?: BaseSong | null;
  originalSongTitle?: string;
  initialNotes?: string;
  hasLocalOverride?: boolean;
  activeSedeId: string;
  activeSedeLabel?: string;
  isMusicianMode: boolean;
  existingSongIds?: string[];
  onClose: () => void;
  onSave: (savedSong: BaseSong) => void;
  onDeleteSong?: (songId: string) => Promise<void> | void;
  onRestoreOverride?: (songId: string) => Promise<void> | void;
}

const COMMON_CHORDS = [
  'G', 'C', 'D', 'Em', 'Am', 'A', 'E', 'F', 'Dm', 'Bm', 'F#m'
];

const CHORD_EXTENSIONS = ['7', 'm7', 'sus4', 'maj7', '/B', '/F#'];

const CHORD_KEYS = [
  'C', 'C#', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Am', 'Bm', 'Cm', 'C#m', 'Dm', 'Em', 'F#m', 'Gm'
];

export const SongEditorModal: React.FC<SongEditorModalProps> = ({
  isOpen,
  initialSong,
  originalSongTitle,
  initialNotes,
  hasLocalOverride = false,
  activeSedeId,
  activeSedeLabel,
  isMusicianMode,
  existingSongIds = [],
  onClose,
  onSave,
  onDeleteSong,
  onRestoreOverride
}) => {
  const [title, setTitle] = useState('');
  const [originalKey, setOriginalKey] = useState('G');
  const [bpm, setBpm] = useState<number | ''>(72);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [rawText, setRawText] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [customChordInput, setCustomChordInput] = useState('');
  const [hasOriginalChords, setHasOriginalChords] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const originalSectionsRef = useRef<SongSection[]>([]);

  // Cargar datos al abrir el modal
  useEffect(() => {
    if (initialSong) {
      setTitle(initialSong.title);
      setOriginalKey(initialSong.originalKey);
      setBpm(initialSong.bpm || '');
      setTimeSignature(initialSong.timeSignature || '4/4');
      setLocalNotes(initialNotes || '');

      originalSectionsRef.current = initialSong.sections;
      setHasOriginalChords(hasChordAnnotations(initialSong.sections));

      const serialized = serializeSectionsToText(initialSong.sections);
      if (!isMusicianMode) {
        // En modo lector, ocultar corchetes para facilitar corrección de texto sin romper el diseño limpio
        setRawText(serialized.replace(/\[[^\]]+\]/g, ''));
      } else {
        setRawText(serialized);
      }
    } else {
      // Plantilla para nueva canción
      setTitle('');
      setOriginalKey('G');
      setBpm(72);
      setTimeSignature('4/4');
      setLocalNotes('');
      originalSectionsRef.current = [];
      setHasOriginalChords(false);

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
    }
    setMobileTab('edit');
  }, [initialSong, initialNotes, activeSedeId, isOpen, isMusicianMode]);

  if (!isOpen) return null;

  const availableKeyOptions = CHORD_KEYS.includes(originalKey)
    ? CHORD_KEYS
    : [originalKey, ...CHORD_KEYS];

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

  const isSedeExclusiveSong = Boolean(
    activeSedeId !== 'general' && (!initialSong || initialSong.sedeId === activeSedeId)
  );

  const canDeleteLocalSong = Boolean(
    initialSong && onDeleteSong && initialSong.syncSource === 'local'
  );
  const canRestoreOverride = Boolean(
    initialSong &&
      hasLocalOverride &&
      onRestoreOverride &&
      activeSedeId !== 'general' &&
      !isSedeExclusiveSong &&
      initialSong.syncSource !== 'local'
  );

  // Transponer automáticamente todos los acordes del texto al cambiar el selector de tonalidad
  const handleOriginalKeyChange = (nextKey: string) => {
    const semitones = getSemitoneDifference(originalKey, nextKey);
    if (semitones !== 0) {
      setRawText(prev => transposeChordProText(prev, semitones));
    }
    setOriginalKey(nextKey);
  };

  // Subir o bajar medio tono directo (acordes + tonalidad) al editar la canción
  const handleStepKeySemitone = (delta: number) => {
    const nextKey = transposeChord(originalKey, delta);
    setRawText(prev => transposeChordProText(prev, delta));
    setOriginalKey(nextKey);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Por favor ingresa un título para la canción.');
      return;
    }

    const parsedSections = parseTextToSections(rawText);
    if (parsedSections.length === 0) {
      alert('Por favor escribe al menos una estrofa o sección.');
      return;
    }

    // Proteger los acordes existentes en líneas cuyo texto limpio no cambió al editar en Modo Lector
    const sections =
      !isMusicianMode && originalSectionsRef.current.length > 0
        ? restoreChordsInEditedSections(parsedSections, originalSectionsRef.current)
        : parsedSections;

    let songId = initialSong?.id;
    if (!songId) {
      const dbSongs = await db.songs.toArray();
      const allIds = new Set([...existingSongIds, ...dbSongs.map(s => s.id)]);
      songId = generateUniqueSongSlug(title, allIds);
    }

    const cleanTitle = title.trim();
    const effectiveKey = isMusicianMode ? originalKey : (initialSong?.originalKey || 'G');
    const nowIso = new Date().toISOString();

    const baseSongData: BaseSong = {
      id: songId,
      title: cleanTitle,
      artist: initialSong?.artist,
      originalKey: effectiveKey,
      bpm: isMusicianMode && typeof bpm === 'number' ? bpm : initialSong?.bpm,
      timeSignature: isMusicianMode ? timeSignature : (initialSong?.timeSignature || '4/4'),
      sections,
      tags: initialSong?.tags,
      notes: isSedeExclusiveSong ? (localNotes.trim() || undefined) : initialSong?.notes,
      sedeId: isSedeExclusiveSong ? activeSedeId : initialSong?.sedeId,
      updatedAt: nowIso,
      syncSource: initialSong?.syncSource || 'local'
    };

    if (!isSedeExclusiveSong && activeSedeId !== 'general') {
      const overrideId = `${songId}_${activeSedeId}`;
      const existingOverride = await db.overrides.get(overrideId);
      const sedeReadable = activeSedeLabel || `Sede ${activeSedeId.replace(/^sede-/, '')}`;

      const override: SedeSongOverride = {
        id: overrideId,
        baseSongId: songId,
        sedeId: activeSedeId,
        customTitle: buildOverrideTitle(
          cleanTitle,
          originalSongTitle || initialSong?.title || cleanTitle,
          sedeReadable,
          existingOverride?.customTitle
        ),
        customKey: effectiveKey,
        customSections: sections,
        localNotes: localNotes.trim() || undefined,
        updatedAt: nowIso,
        syncSource: 'local'
      };

      await db.overrides.put(override);
    } else {
      await db.songs.put(baseSongData);
      if (isSedeExclusiveSong) {
        await db.overrides.delete(`${songId}_${activeSedeId}`);
      }
    }

    onSave(baseSongData);
    onClose();
  };

  const handleDelete = async () => {
    if (!initialSong || !onDeleteSong) return;
    if (!confirm(`¿Eliminar "${initialSong.title}" de tu dispositivo?`)) return;
    await onDeleteSong(initialSong.id);
    onClose();
  };

  const handleRestoreOverrideClick = async () => {
    if (!initialSong || !onRestoreOverride) return;
    if (!confirm(`¿Restaurar "${initialSong.title}" a la versión general para esta sede?`)) return;
    await onRestoreOverride(initialSong.id);
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Formulario Principal con Cuerpo Scrollable y Barra Inferior Fija */}
        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col">
          <div className="p-3 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {/* Barra Superior Desplazable: Pestañas móviles y botón Cerrar */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div className="flex sm:hidden p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
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
                type="button"
                onClick={onClose}
                title="Cerrar editor"
                aria-label="Cerrar editor"
                className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {!isMusicianMode && hasOriginalChords && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-[11px] sm:text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Esta canción contiene acordes guardados. Las líneas cuya letra no modifiques conservarán sus acordes automáticamente; si reescribes una línea completa, usa <strong>Modo Músico</strong> para reubicar sus acordes.
                </p>
              </div>
            )}

            {/* Metadatos Básicos */}
            <div className={`grid gap-3 ${isMusicianMode ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'}`}>
              <div className={isMusicianMode ? 'col-span-2 sm:col-span-1' : ''}>
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

              {/* Campos de teoría musical (Solo visibles en Modo Músico) */}
              {isMusicianMode && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      {activeSedeId !== 'general' ? 'Tono en esta Sede *' : 'Tono Original *'}
                    </label>
                    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden focus-within:border-emerald-500">
                      <button
                        type="button"
                        onClick={() => handleStepKeySemitone(-1)}
                        title="Bajar medio tono"
                        aria-label="Bajar medio tono"
                        className="px-2 py-2 text-slate-300 hover:text-white hover:bg-slate-800 border-r border-slate-800 transition-colors shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <select
                        value={originalKey}
                        onChange={e => handleOriginalKeyChange(e.target.value)}
                        className="w-full min-w-0 px-1.5 py-2 bg-transparent text-xs sm:text-sm text-emerald-400 font-bold text-center focus:outline-none"
                      >
                        {availableKeyOptions.map(k => (
                          <option key={k} value={k} className="bg-slate-950 text-white">{k}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleStepKeySemitone(1)}
                        title="Subir medio tono"
                        aria-label="Subir medio tono"
                        className="px-2 py-2 text-slate-300 hover:text-white hover:bg-slate-800 border-l border-slate-800 transition-colors shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

            {activeSedeId !== 'general' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Notas de Arreglo para los Músicos (Sede)
                </label>
                <input
                  type="text"
                  value={localNotes}
                  onChange={e => setLocalNotes(e.target.value)}
                  placeholder="Ej: Entrada con guitarra acústica y pad suave..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Asistente de inserción táctil */}
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
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

              {/* Atajos de secciones */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
                            section.lines.map((line, idx) => (
                              <ChordProLineView
                                key={idx}
                                line={line}
                                chordClassName="text-[10px]"
                                lyricClassName="text-xs"
                                spacerHeightClass="h-2"
                              />
                            ))
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

          {/* Barra Inferior Fija en Una Sola Fila */}
          <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0 flex-nowrap">
            <div className="flex items-center shrink-0">
              {canDeleteLocalSong ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  title="Eliminar canción"
                  aria-label="Eliminar canción"
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/50 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Eliminar</span>
                </button>
              ) : canRestoreOverride ? (
                <button
                  type="button"
                  onClick={handleRestoreOverrideClick}
                  title="Restaurar a versión general"
                  aria-label="Restaurar a versión general"
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-amber-300 hover:bg-amber-950/40 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Restaurar general</span>
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3 sm:px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950 transition-colors whitespace-nowrap"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>Guardar</span>
                <span className="hidden sm:inline">Canción</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
