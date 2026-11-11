import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const sections: SongSection[] = song.sections || [];
  const safeSectionIndex = sections.length === 0 ? 0 : Math.min(currentSectionIndex, sections.length - 1);
  const currentSection = sections[safeSectionIndex];
  const cleanLines = currentSection ? getCleanLyrics(currentSection.lines) : [];

  useEffect(() => {
    setCurrentSectionIndex(0);
  }, [song.id]);

  useEffect(() => {
    setCurrentSectionIndex(prev => (sections.length === 0 ? 0 : Math.min(prev, sections.length - 1)));
  }, [sections.length]);

  const handleNext = useCallback(() => {
    if (safeSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(safeSectionIndex + 1);
    }
  }, [safeSectionIndex, sections.length]);

  const handlePrev = useCallback(() => {
    if (safeSectionIndex > 0) {
      setCurrentSectionIndex(safeSectionIndex - 1);
    }
  }, [safeSectionIndex]);

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

  // Manejo de teclado para proyeccionista con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
          if (targetTag && ['BUTTON', 'A'].includes(targetTag) && (e.key === ' ' || e.key === 'Enter')) {
            return;
          }
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

  // Manejo de gestos táctiles (Swipe) para móviles
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.changedTouches[0].screenX;
    touchStartYRef.current = e.changedTouches[0].screenY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].screenX;
    const endY = e.changedTouches[0].screenY;
    const deltaX = touchStartXRef.current - endX;
    const deltaY = touchStartYRef.current - endY;

    // Solo si el movimiento horizontal es mayor al vertical (para no interferir con scroll)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      if (deltaX > 0) {
        handleNext(); // Deslizó hacia la izquierda -> avanzar
      } else {
        handlePrev(); // Deslizó hacia la derecha -> retroceder
      }
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseMove={() => setShowControls(true)}
      className="fixed inset-0 bg-black z-50 flex flex-col justify-between select-none overflow-hidden"
    >
      {/* Barra superior de controles flotantes */}
      <div
        className={`p-3 sm:p-4 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 max-w-[65%]">
          <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
            {song.title}
          </span>
          <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
            {sections.length > 0
              ? `${safeSectionIndex + 1}/${sections.length} • ${currentSection?.label || ''}`
              : 'Sin estrofas'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Botón Blackout */}
          <button
            onClick={e => {
              e.currentTarget.blur();
              setIsBlackout(!isBlackout);
            }}
            title="Pantalla en negro [B]"
            className={`p-1.5 sm:p-2 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
              isBlackout
                ? 'bg-amber-500 text-black border-amber-400 font-bold'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {isBlackout ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span className="hidden md:inline">Blackout [B]</span>
          </button>

          <button
            onClick={e => {
              e.currentTarget.blur();
              toggleFullScreen();
            }}
            title="Pantalla Completa"
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            onClick={onClose}
            title="Cerrar Proyector (Esc)"
            className="p-1.5 sm:p-2 rounded-lg bg-rose-950/70 border border-rose-800 hover:bg-rose-900 text-rose-200 transition-colors"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Área Principal de Proyección con zonas táctiles laterales */}
      <div className="relative flex-1 flex items-center justify-center p-4 sm:p-10 md:p-16 text-center">
        {/* Zona táctil izquierda para retroceder con pulgar */}
        {!isBlackout && (
          <div
            onClick={handlePrev}
            className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
            title="Tocar para retroceder"
          />
        )}

        {/* Zona táctil derecha para avanzar con pulgar */}
        {!isBlackout && (
          <div
            onClick={handleNext}
            className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
            title="Tocar para avanzar"
          />
        )}

        {isBlackout ? (
          <button
            type="button"
            onClick={() => setIsBlackout(false)}
            className="w-full h-full flex items-center justify-center text-slate-700 hover:text-slate-500 text-xs sm:text-sm cursor-pointer z-20"
          >
            [Pantalla en negro - Toca para reactivar]
          </button>
        ) : sections.length === 0 ? (
          <div className="text-slate-400 text-base sm:text-xl font-medium">
            Esta canción aún no tiene estrofas disponibles para proyectar.
          </div>
        ) : (
          <div className="max-w-5xl space-y-3 sm:space-y-6 z-0 pointer-events-none">
            {cleanLines.map((line, idx) => (
              <p
                key={idx}
                className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-wide leading-tight sm:leading-tight drop-shadow-md"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Barra Inferior de Navegación y Secciones */}
      <div
        className={`p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        {/* Selector directo de secciones deslizable */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto max-w-[70%] sm:max-w-xl py-1 no-scrollbar">
          {sections.map((sec, idx) => (
            <button
              key={sec.id}
              onClick={e => {
                e.currentTarget.blur();
                setCurrentSectionIndex(idx);
              }}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                idx === safeSectionIndex
                  ? 'bg-white text-black shadow-lg scale-105'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Flechas de navegación táctiles grandes */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={e => {
              e.currentTarget.blur();
              handlePrev();
            }}
            disabled={sections.length <= 1 || safeSectionIndex === 0}
            className="p-2 sm:p-3 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 disabled:opacity-20 transition-all"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={e => {
              e.currentTarget.blur();
              handleNext();
            }}
            disabled={sections.length <= 1 || safeSectionIndex >= sections.length - 1}
            className="p-2 sm:p-3 rounded-full bg-white text-black hover:bg-slate-200 disabled:opacity-20 transition-all shadow-lg"
            title="Siguiente"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
