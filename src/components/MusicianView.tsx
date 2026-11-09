import React, { useState, useEffect, useRef } from 'react';
import { 
  Music2, 
  Minus, 
  Plus, 
  RotateCcw, 
  Play, 
  Pause, 
  Edit3, 
  Sparkles, 
  Info,
  Maximize2,
  ArrowLeft,
  Sun,
  Moon,
  Type,
  BookOpen
} from 'lucide-react';
import { DisplaySong, SedeSongOverride } from '../types';
import { parseChordProLine, transposeChord, transposeLine } from '../services/chordParser';
import { useWakeLock } from '../hooks/useWakeLock';
import { db } from '../db';

interface MusicianViewProps {
  song: DisplaySong;
  activeSedeId: string;
  onEnterProjection: () => void;
  onSongUpdated: () => void;
  onBackToCatalog?: () => void;
  onEditFullSong?: () => void;
  onSwitchToLyrics?: () => void;
}

type FontSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

const FONT_CLASSES: Record<FontSize, { lyric: string; chord: string }> = {
  sm: { lyric: 'text-xs sm:text-sm', chord: 'text-[11px] sm:text-xs' },
  base: { lyric: 'text-sm sm:text-base', chord: 'text-xs sm:text-sm' },
  lg: { lyric: 'text-base sm:text-lg', chord: 'text-sm sm:text-base' },
  xl: { lyric: 'text-lg sm:text-xl', chord: 'text-base sm:text-lg' },
  '2xl': { lyric: 'text-xl sm:text-2xl', chord: 'text-lg sm:text-xl' }
};

export const MusicianView: React.FC<MusicianViewProps> = ({
  song,
  activeSedeId,
  onEnterProjection,
  onSongUpdated,
  onBackToCatalog,
  onEditFullSong,
  onSwitchToLyrics
}) => {
  const [transposeOffset, setTransposeOffset] = useState<number>(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2);
  const [fontSize, setFontSize] = useState<FontSize>('base');
  const [isEditingOverride, setIsEditingOverride] = useState<boolean>(false);
  const [overrideNotes, setOverrideNotes] = useState<string>(song.notes || '');
  const [overrideKey, setOverrideKey] = useState<string>(song.key);
  const scrollIntervalRef = useRef<number | null>(null);

  // Hook de pantalla siempre encendida para atriles móviles
  const { isSupported: isWakeLockSupported, isActive: isWakeLockActive, toggleWakeLock } = useWakeLock();

  // Reiniciar offset de transposición al cambiar de canción
  useEffect(() => {
    setTransposeOffset(0);
    setIsAutoScrolling(false);
    setOverrideNotes(song.notes || '');
    setOverrideKey(song.key);
  }, [song.id, song.key]);

  // Manejo de auto-scroll para atril
  useEffect(() => {
    if (isAutoScrolling) {
      scrollIntervalRef.current = window.setInterval(() => {
        window.scrollBy({ top: scrollSpeed, behavior: 'smooth' });
      }, 50);
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }

    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [isAutoScrolling, scrollSpeed]);

  const currentDisplayKey = transposeChord(song.key, transposeOffset);

  const handleSaveLocalOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSedeId || activeSedeId === 'general') {
      alert('Para crear una versión local, primero selecciona una sede específica en el menú superior.');
      return;
    }

    const overrideId = `${song.id}_${activeSedeId}`;
    const override: SedeSongOverride = {
      id: overrideId,
      baseSongId: song.id,
      sedeId: activeSedeId,
      customTitle: `${song.originalSong?.title || song.title} (Sede ${activeSedeId.replace('sede-', '')})`,
      customKey: overrideKey,
      localNotes: overrideNotes,
      updatedAt: new Date().toISOString()
    };

    await db.overrides.put(override);
    setIsEditingOverride(false);
    onSongUpdated();
  };

  const handleRemoveOverride = async () => {
    if (!confirm('¿Deseas restaurar esta canción a la versión general para tu sede?')) return;
    const overrideId = `${song.id}_${activeSedeId}`;
    await db.overrides.delete(overrideId);
    setIsEditingOverride(false);
    onSongUpdated();
  };

  const increaseFontSize = () => {
    const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl', '2xl'];
    const idx = sizes.indexOf(fontSize);
    if (idx < sizes.length - 1) setFontSize(sizes[idx + 1]);
  };

  const decreaseFontSize = () => {
    const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl', '2xl'];
    const idx = sizes.indexOf(fontSize);
    if (idx > 0) setFontSize(sizes[idx - 1]);
  };

  return (
    <div className="max-w-4xl mx-auto pb-32">
      {/* Botón de Retorno para Móviles */}
      {onBackToCatalog && (
        <div className="lg:hidden mb-3">
          <button
            onClick={onBackToCatalog}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al cancionero</span>
          </button>
        </div>
      )}

      {/* Barra de Herramientas del Músico (Atril Responsivo) */}
      <div className="sticky top-14 sm:top-16 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2.5 sm:p-4 mb-4 sm:mb-6 shadow-xl flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {/* Tono y Transposición */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-950 border border-slate-700 rounded-xl">
            <Music2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            <span className="text-[11px] sm:text-xs text-slate-400 hidden xs:inline">Tono:</span>
            <span className="text-xs sm:text-sm font-bold text-white min-w-[24px] text-center">
              {currentDisplayKey}
            </span>
            {transposeOffset !== 0 && (
              <span className="text-[10px] text-emerald-400 font-mono">
                ({transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset})
              </span>
            )}
          </div>

          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setTransposeOffset(prev => prev - 1)}
              title="Bajar medio tono"
              className="p-1.5 sm:p-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              onClick={() => setTransposeOffset(0)}
              title="Restaurar tono original"
              disabled={transposeOffset === 0}
              className="p-1.5 sm:p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
            >
              <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              onClick={() => setTransposeOffset(prev => prev + 1)}
              title="Subir medio tono"
              className="p-1.5 sm:p-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        </div>

        {/* Controles de Vista: Tamaño de Letra, WakeLock y Auto-Scroll */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Ajuste de Tamaño de Letra */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
            <button
              onClick={decreaseFontSize}
              title="Reducir tamaño de letra"
              disabled={fontSize === 'sm'}
              className="px-2 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              A-
            </button>
            <span className="px-1 text-[10px] text-slate-500 hidden sm:inline">
              <Type className="w-3 h-3 inline" />
            </span>
            <button
              onClick={increaseFontSize}
              title="Aumentar tamaño de letra"
              disabled={fontSize === '2xl'}
              className="px-2 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              A+
            </button>
          </div>

          {/* Bloqueo de pantalla (WakeLock) */}
          {isWakeLockSupported && (
            <button
              onClick={toggleWakeLock}
              title={isWakeLockActive ? 'Pantalla siempre encendida (Activo)' : 'Evitar que la pantalla se apague'}
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors ${
                isWakeLockActive
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/60'
                  : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {isWakeLockActive ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          )}

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border transition-all ${
              isAutoScrolling
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950'
                : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            {isAutoScrolling ? <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            <span className="hidden xs:inline">Scroll</span>
          </button>

          {isAutoScrolling && (
            <input
              type="range"
              min="1"
              max="5"
              value={scrollSpeed}
              onChange={e => setScrollSpeed(Number(e.target.value))}
              title="Velocidad de scroll"
              className="w-12 sm:w-16 accent-emerald-500 cursor-pointer"
            />
          )}

          {/* Botón modo proyección */}
          <button
            onClick={onEnterProjection}
            title="Abrir modo pantalla completa para proyector"
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-[11px] sm:text-xs font-medium text-slate-200 transition-colors"
          >
            <Maximize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Proyección</span>
          </button>

          {/* Conmutador a Modo Lector (Solo Letra) */}
          {onSwitchToLyrics && (
            <button
              onClick={onSwitchToLyrics}
              title="Volver a vista limpia de solo letra"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-[11px] sm:text-xs font-semibold text-slate-200 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Solo Letra</span>
            </button>
          )}

          {/* Botón Editar Letra Completa */}
          {onEditFullSong && (
            <button
              onClick={onEditFullSong}
              title="Editar letra completa y acordes"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-[11px] sm:text-xs font-medium text-slate-200 transition-colors"
            >
              <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          )}

          {/* Botón Personalizar versión de sede */}
          {activeSedeId !== 'general' && (
            <button
              onClick={() => setIsEditingOverride(true)}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-[11px] sm:text-xs font-medium text-emerald-300 transition-colors"
            >
              <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">
                {song.isLocalOverride ? 'Editar versión sede' : 'Crear versión sede'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Cabecera de la Canción */}
      <div className="mb-4 sm:mb-6 px-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            {song.title}
          </h1>

          {song.isLocalOverride && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700">
              <Sparkles className="w-3 h-3" />
              Versión Sede
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-slate-400">
          {song.artist && <span>Artista: <strong className="text-slate-300">{song.artist}</strong></span>}
          {song.bpm && <span>BPM: <strong className="text-slate-300">{song.bpm}</strong></span>}
          {song.timeSignature && <span>Compás: <strong className="text-slate-300">{song.timeSignature}</strong></span>}
          <span>Tono base: <strong className="text-slate-300">{song.originalSong?.originalKey || song.key}</strong></span>
        </div>

        {/* Notas locales de la sede si existen */}
        {song.notes && (
          <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-emerald-900/40 text-[11px] sm:text-xs text-slate-300 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-400 block mb-0.5">Notas de la Sede:</span>
              <p>{song.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Letra y Acordes formateados en secciones */}
      <div className="space-y-4 sm:space-y-6">
        {song.sections.map((section) => (
          <div
            key={section.id}
            className="p-3.5 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2.5 border-b border-slate-800/80 pb-1.5">
              <span className="text-[11px] sm:text-xs font-bold tracking-wider uppercase text-emerald-400">
                {section.label}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase">{section.type}</span>
            </div>

            <div className="space-y-3 sm:space-y-4 font-mono leading-relaxed">
              {section.lines.map((rawLine, idx) => {
                const transposedLine = transposeLine(rawLine, transposeOffset);
                const tokens = parseChordProLine(transposedLine);

                return (
                  <div key={idx} className="flex flex-wrap items-end gap-x-1.5 sm:gap-x-2 py-0.5">
                    {tokens.map((token, tIdx) => (
                      <span key={tIdx} className="inline-flex flex-col">
                        {token.chord ? (
                          <span className={`font-bold text-emerald-400 leading-none select-all font-sans ${FONT_CLASSES[fontSize].chord}`}>
                            {token.chord}
                          </span>
                        ) : (
                          <span className="h-2.5 sm:h-3 leading-none select-none"></span>
                        )}
                        <span className={`text-slate-100 font-sans whitespace-pre ${FONT_CLASSES[fontSize].lyric}`}>
                          {token.text || ' '}
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal para Personalizar Versión de Sede */}
      {isEditingOverride && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl">
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-emerald-400" />
              Personalizar para Sede: {activeSedeId}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Esta configuración es local para tu congregación y no alterará el cancionero general.
            </p>

            <form onSubmit={handleSaveLocalOverride} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tono Habitual en esta Sede
                </label>
                <input
                  type="text"
                  required
                  value={overrideKey}
                  onChange={e => setOverrideKey(e.target.value.toUpperCase())}
                  placeholder="Ej: A, G, Em"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Notas de Arreglos o Estructura para los Músicos
                </label>
                <textarea
                  rows={3}
                  value={overrideNotes}
                  onChange={e => setOverrideNotes(e.target.value)}
                  placeholder="Ej: Inicia con batería y bajo. En el puente subir intensidad."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                {song.isLocalOverride ? (
                  <button
                    type="button"
                    onClick={handleRemoveOverride}
                    className="text-xs text-rose-400 hover:text-rose-300 underline"
                  >
                    Restaurar a versión general
                  </button>
                ) : <div></div>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingOverride(false)}
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Guardar Versión
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
