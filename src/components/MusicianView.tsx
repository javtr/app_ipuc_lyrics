import React, { useState } from 'react';
import {
  Edit3,
  Sparkles,
  Info,
  Maximize2,
  ArrowLeft,
  Sun,
  Moon,
  Type
} from 'lucide-react';
import { DisplaySong } from '../types';
import {
  getSemitoneDifference,
  transposeLine
} from '../services/chordParser';
import { useWakeLock } from '../hooks/useWakeLock';
import { FallbackNoticeBanner } from './FallbackNoticeBanner';
import { ChordProLineView } from './ChordProLineView';
import { ReportChangesButton } from './ReportChangesButton';
import { SetlistNavControls, SetlistNavProps } from './SetlistNavControls';

interface MusicianViewProps {
  song: DisplaySong;
  expectedKey?: string;
  setlistNav?: SetlistNavProps;
  onEnterProjection: () => void;
  onBackToCatalog?: () => void;
  onEditFullSong?: () => void;
  onReportCorrection?: () => void;
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
  expectedKey,
  setlistNav,
  onEnterProjection,
  onBackToCatalog,
  onEditFullSong,
  onReportCorrection
}) => {
  const [fontSize, setFontSize] = useState<FontSize>('base');

  // Hook de pantalla siempre encendida para atriles móviles
  const { isSupported: isWakeLockSupported, isActive: isWakeLockActive, toggleWakeLock } = useWakeLock();

  // Transposición automática de lectura cuando el repertorio fija un tono específico
  const transposeOffset = expectedKey ? getSemitoneDifference(song.key, expectedKey) : 0;

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
    <div className="max-w-4xl mx-auto pb-8">
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

      {/* Barra de Herramientas del Músico en Una Sola Fila */}
      <div className="sticky top-2 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2 sm:p-3.5 mb-4 sm:mb-6 shadow-xl flex items-center justify-between gap-1.5 sm:gap-2 flex-nowrap">
        {/* Grupo Izquierdo: Tamaño de Letra + Navegación de Repertorio */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
          {/* Ajuste de Tamaño de Letra */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0">
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

          {setlistNav && <SetlistNavControls {...setlistNav} />}
        </div>

        {/* Grupo Derecho: WakeLock, Proyección y Edición */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Bloqueo de pantalla (WakeLock) */}
          {isWakeLockSupported && (
            <button
              onClick={toggleWakeLock}
              title={isWakeLockActive ? 'Pantalla siempre encendida (Activo)' : 'Evitar que la pantalla se apague'}
              aria-label="Evitar que la pantalla se apague"
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors ${
                isWakeLockActive
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/60'
                  : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {isWakeLockActive ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          )}

          {/* Botón modo proyección */}
          <button
            onClick={onEnterProjection}
            title="Abrir modo pantalla completa para proyector"
            aria-label="Abrir modo proyección"
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-[11px] sm:text-xs font-medium text-slate-200 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Proyección</span>
          </button>

          {/* Botón único de Edición (Solo Ícono, guarda en la sede activa) */}
          {onEditFullSong && (
            <button
              onClick={onEditFullSong}
              title="Editar canción para esta sede"
              aria-label="Editar canción"
              className="p-1.5 sm:p-2 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-slate-200 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
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
          {song.bpm && <span>BPM: <strong className="text-slate-300">{song.bpm}</strong></span>}
          {song.timeSignature && <span>Compás: <strong className="text-slate-300">{song.timeSignature}</strong></span>}
          {expectedKey && expectedKey !== song.key ? (
            <span>
              Tono en repertorio: <strong className="text-emerald-300">{expectedKey}</strong>{' '}
              <span className="text-slate-500">({song.isLocalOverride ? 'Sede' : 'Guardado'}: {song.key})</span>
            </span>
          ) : song.isLocalOverride && song.originalSong && song.originalSong.originalKey !== song.key ? (
            <span>
              Tono en sede: <strong className="text-emerald-300">{song.key}</strong>{' '}
              <span className="text-slate-500">(General: {song.originalSong.originalKey})</span>
            </span>
          ) : (
            <span>Tono guardado: <strong className="text-slate-300">{song.key}</strong></span>
          )}
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

        <FallbackNoticeBanner message={song.fallbackNotice} />
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
                return (
                  <ChordProLineView
                    key={idx}
                    line={transposedLine}
                    chordClassName={FONT_CLASSES[fontSize].chord}
                    lyricClassName={FONT_CLASSES[fontSize].lyric}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ReportChangesButton onClick={onReportCorrection} />
    </div>
  );
};
