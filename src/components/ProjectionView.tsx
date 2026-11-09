import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  EyeOff, 
  Eye 
} from 'lucide-react';
import { DisplaySong, SongSection } from '../types';
import { getCleanLyrics } from '../services/chordParser';

interface ProjectionViewProps {
  song: DisplaySong;
  onClose: () => void;
}

export const ProjectionView: React.FC<ProjectionViewProps> = ({ song, onClose }) => {
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);

  const sections: SongSection[] = song.sections;
  const currentSection = sections[currentSectionIndex] || sections[0];
  const cleanLines = currentSection ? getCleanLyrics(currentSection.lines) : [];

  const handleNext = useCallback(() => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
    }
  }, [currentSectionIndex, sections.length]);

  const handlePrev = useCallback(() => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
    }
  }, [currentSectionIndex]);

  const jumpToChorus = useCallback(() => {
    const chorusIndex = sections.findIndex(s => s.type === 'chorus');
    if (chorusIndex !== -1) {
      setCurrentSectionIndex(chorusIndex);
    }
  }, [sections]);

  const jumpToVerse1 = useCallback(() => {
    const verseIndex = sections.findIndex(s => s.type === 'verse');
    if (verseIndex !== -1) {
      setCurrentSectionIndex(verseIndex);
    }
  }, [sections]);

  // Manejo de teclado para la persona de medios/proyección
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si se está escribiendo en un input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          handlePrev();
          break;
        case 'b':
        case 'B':
          setIsBlackout(prev => !prev);
          break;
        case 'c':
        case 'C':
          jumpToChorus();
          break;
        case 'v':
        case 'V':
          jumpToVerse1();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, jumpToChorus, jumpToVerse1, onClose]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      onMouseMove={() => setShowControls(true)}
      className="fixed inset-0 bg-black z-50 flex flex-col justify-between select-none overflow-hidden"
    >
      {/* Barra superior de controles flotantes (desvanecible) */}
      <div
        className={`p-4 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-wide">
            {song.title}
          </span>
          <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
            {currentSectionIndex + 1} / {sections.length} • {currentSection?.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Blackout (Pantalla Negra) */}
          <button
            onClick={() => setIsBlackout(!isBlackout)}
            title="Pantalla en negro (Atajo: tecla B)"
            className={`p-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              isBlackout
                ? 'bg-amber-500 text-black border-amber-400 font-bold'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {isBlackout ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="hidden sm:inline">Blackout [B]</span>
          </button>

          <button
            onClick={toggleFullScreen}
            title="Pantalla Completa"
            className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Maximize className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            title="Cerrar Proyector (Esc)"
            className="p-2 rounded-lg bg-rose-950/70 border border-rose-800 hover:bg-rose-900 text-rose-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Área Principal de Proyección (Pantalla Limpia de Alto Contraste) */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-16 text-center">
        {isBlackout ? (
          <div className="text-slate-800 text-sm select-none">
            [Pantalla en negro - Presiona 'B' para reactivar]
          </div>
        ) : (
          <div className="max-w-5xl space-y-4 sm:space-y-6">
            {cleanLines.map((line, idx) => (
              <p
                key={idx}
                className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-wide leading-tight drop-shadow-md"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Barra Inferior de Navegación y Secciones */}
      <div
        className={`p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        {/* Selector directo de secciones */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-xl py-1">
          {sections.map((sec, idx) => (
            <button
              key={sec.id}
              onClick={() => setCurrentSectionIndex(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                idx === currentSectionIndex
                  ? 'bg-white text-black shadow-lg scale-105'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Flechas de navegación */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={currentSectionIndex === 0}
            className="p-3 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 disabled:opacity-20 transition-all"
            title="Anterior (Flecha izquierda)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            disabled={currentSectionIndex === sections.length - 1}
            className="p-3 rounded-full bg-white text-black hover:bg-slate-200 disabled:opacity-20 transition-all shadow-lg"
            title="Siguiente (Barra espaciadora o Flecha derecha)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
