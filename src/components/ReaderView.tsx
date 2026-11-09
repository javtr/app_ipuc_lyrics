import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Maximize2, 
  ArrowLeft, 
  Music, 
  Type,
  Sparkles,
  Edit3
} from 'lucide-react';
import { DisplaySong } from '../types';
import { getCleanLyrics } from '../services/chordParser';

interface ReaderViewProps {
  song: DisplaySong;
  onSwitchToChords?: () => void;
  onEnterProjection: () => void;
  onBackToCatalog?: () => void;
  onEditSong?: () => void;
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
  onSwitchToChords,
  onEnterProjection,
  onBackToCatalog,
  onEditSong
}) => {
  const [fontSize, setFontSize] = useState<ReaderFontSize>('base');
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2);
  const scrollIntervalRef = useRef<number | null>(null);

  // Auto-scroll suave para cantar sin tocar la pantalla
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
    <div className="max-w-3xl mx-auto pb-32">
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

      {/* Barra de Herramientas del Lector (Limpia y Compacta) */}
      <div className="sticky top-14 sm:top-16 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2.5 sm:p-3.5 mb-5 shadow-xl flex items-center justify-between gap-2">
        {/* Controles de Tamaño de Letra */}
        <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0">
          <button
            onClick={decreaseFontSize}
            title="Reducir tamaño de letra"
            disabled={fontSize === 'sm'}
            className="px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
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
            className="px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
          >
            A+
          </button>
        </div>

        {/* Auto-Scroll y Proyección */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Botón Auto-Scroll */}
          <button
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isAutoScrolling
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            {isAutoScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden xs:inline">Auto-Scroll</span>
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

          {/* Proyector */}
          <button
            onClick={onEnterProjection}
            title="Pantalla Completa"
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-xl text-xs font-medium text-slate-200 transition-colors flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Proyección</span>
          </button>

          {/* Botón de Editar Letra Lírica */}
          {onEditSong && (
            <button
              onClick={onEditSong}
              title="Editar letra de la canción"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Editar Letra</span>
            </button>
          )}

          {/* Conmutador a Modo Músico (opcional) */}
          {onSwitchToChords && (
            <button
              onClick={onSwitchToChords}
              title="Ver acordes para músicos"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-emerald-600/40 text-emerald-300 rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Music className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ver Acordes</span>
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

        {song.artist && (
          <p className="text-xs sm:text-sm text-slate-400">
            Autor / Artista: <strong className="text-slate-200">{song.artist}</strong>
          </p>
        )}
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
    </div>
  );
};
