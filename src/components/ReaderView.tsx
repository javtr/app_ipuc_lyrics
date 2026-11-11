import React, { useState } from 'react';
import {
  Maximize2,
  ArrowLeft,
  Type,
  Sparkles,
  Edit3
} from 'lucide-react';
import { DisplaySong } from '../types';
import { getCleanLyrics } from '../services/chordParser';
import { FallbackNoticeBanner } from './FallbackNoticeBanner';
import { ReportChangesButton } from './ReportChangesButton';
import { SetlistNavControls, SetlistNavProps } from './SetlistNavControls';

interface ReaderViewProps {
  song: DisplaySong;
  setlistNav?: SetlistNavProps;
  onEnterProjection: () => void;
  onBackToCatalog?: () => void;
  onEditSong?: () => void;
  onReportCorrection?: () => void;
}

type ReaderFontSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

const READER_FONT_CLASSES: Record<ReaderFontSize, string> = {
  sm: 'text-base sm:text-lg leading-relaxed',
  base: 'text-lg sm:text-xl leading-relaxed',
  lg: 'text-xl sm:text-2xl leading-relaxed font-medium',
  xl: 'text-2xl sm:text-3xl leading-relaxed font-medium',
  '2xl': 'text-3xl sm:text-4xl leading-tight font-semibold'
};

export const ReaderView: React.FC<ReaderViewProps> = ({
  song,
  setlistNav,
  onEnterProjection,
  onBackToCatalog,
  onEditSong,
  onReportCorrection
}) => {
  const [fontSize, setFontSize] = useState<ReaderFontSize>('base');

  const increaseFontSize = () => {
    const sizes: ReaderFontSize[] = ['sm', 'base', 'lg', 'xl', '2xl'];
    const idx = sizes.indexOf(fontSize);
    if (idx < sizes.length - 1) setFontSize(sizes[idx + 1]);
  };

  const decreaseFontSize = () => {
    const sizes: ReaderFontSize[] = ['sm', 'base', 'lg', 'xl', '2xl'];
    const idx = sizes.indexOf(fontSize);
    if (idx > 0) setFontSize(sizes[idx - 1]);
  };

  return (
    <div className="max-w-3xl mx-auto pb-8">
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

      {/* Barra de Herramientas del Lector (Limpia y Compacta en Una Sola Fila) */}
      <div className="sticky top-2 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2 sm:p-3.5 mb-5 shadow-xl flex items-center justify-between gap-1.5 sm:gap-2 flex-nowrap">
        {/* Grupo Izquierdo: Tamaño de Letra + Navegación de Repertorio */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
          {/* Controles de Tamaño de Letra */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0">
            <button
              onClick={decreaseFontSize}
              title="Reducir tamaño de letra"
              disabled={fontSize === 'sm'}
              className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              A-
            </button>
            <span className="px-1 text-[10px] text-slate-500 hidden sm:inline">
              <Type className="w-3.5 h-3.5 inline" />
            </span>
            <button
              onClick={increaseFontSize}
              title="Aumentar tamaño de letra"
              disabled={fontSize === '2xl'}
              className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              A+
            </button>
          </div>

          {setlistNav && <SetlistNavControls {...setlistNav} />}
        </div>

        {/* Proyección y Edición */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Proyector */}
          <button
            onClick={onEnterProjection}
            title="Pantalla Completa"
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-xs font-medium text-slate-200 transition-colors flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Proyección</span>
          </button>

          {/* Botón de Editar Letra (Solo Ícono) */}
          {onEditSong && (
            <button
              onClick={onEditSong}
              title="Editar letra de la canción"
              aria-label="Editar letra de la canción"
              className="p-1.5 sm:p-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl shadow-sm transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </button>
          )}
        </div>
      </div>

      {/* Cabecera de la Canción para la Congregación */}
      <div className="mb-6 px-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            {song.title}
          </h1>

          {song.isLocalOverride && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700">
              <Sparkles className="w-3 h-3" />
              Versión Sede
            </span>
          )}
        </div>

        <FallbackNoticeBanner message={song.fallbackNotice} />
      </div>

      {/* Letra Limpia Organizada por Secciones */}
      <div className="space-y-6 sm:space-y-8">
        {song.sections.map((section) => {
          const cleanLines = getCleanLyrics(section.lines);
          const isChorus = section.type === 'chorus';
          const isBridge = section.type === 'bridge';

          return (
            <div
              key={section.id}
              className={`p-4 sm:p-6 rounded-2xl transition-all ${
                isChorus
                  ? 'bg-slate-900/90 border-l-4 border-emerald-500 border-y border-r border-slate-800 shadow-md'
                  : isBridge
                  ? 'bg-slate-900/70 border-l-4 border-blue-500 border-y border-r border-slate-800'
                  : 'bg-slate-900/40 border border-slate-800/80'
              }`}
            >
              {/* Etiqueta de la Sección */}
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-1.5">
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  isChorus ? 'text-emerald-400' : isBridge ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {section.label}
                </span>
                {isChorus && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    CORO
                  </span>
                )}
              </div>

              {/* Líneas de Letra Limpia */}
              <div className={`space-y-2 text-slate-100 ${READER_FONT_CLASSES[fontSize]}`}>
                {cleanLines.map((line, idx) => (
                  <p key={idx} className="whitespace-pre-wrap">
                    {line || <br />}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ReportChangesButton onClick={onReportCorrection} />
    </div>
  );
};
