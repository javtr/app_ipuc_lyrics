import { BaseSong, SedeSongOverride, DisplaySong } from '../types';

/**
 * Resuelve una canción para mostrar en la interfaz según la sede seleccionada.
 * Si la sede activa tiene una versión local (override), la aplica respetando
 * el cancionero base original sin alterarlo destructivamente.
 */
export function resolveSongForDisplay(
  baseSong: BaseSong,
  activeSedeId: string,
  overrides: SedeSongOverride[]
): DisplaySong {
  // Si estamos en el catálogo general, se retorna la versión base pura
  if (!activeSedeId || activeSedeId === 'general') {
    return {
      id: baseSong.id,
      title: baseSong.title,
      artist: baseSong.artist,
      key: baseSong.originalKey,
      bpm: baseSong.bpm,
      timeSignature: baseSong.timeSignature,
      sections: baseSong.sections,
      isLocalOverride: false,
      originalSong: baseSong
    };
  }

  // Buscar si la sede activa tiene una sobreescritura/versión local de esta canción
  const override = overrides.find(
    o => o.baseSongId === baseSong.id && o.sedeId === activeSedeId
  );

  if (override) {
    return {
      id: baseSong.id,
      title: override.customTitle || `${baseSong.title} (Versión ${activeSedeId})`,
      artist: baseSong.artist,
      key: override.customKey || baseSong.originalKey,
      bpm: baseSong.bpm,
      timeSignature: baseSong.timeSignature,
      sections: override.customSections && override.customSections.length > 0
        ? override.customSections
        : baseSong.sections,
      notes: override.localNotes,
      isLocalOverride: true,
      sedeId: activeSedeId,
      originalSong: baseSong
    };
  }

  // Si la sede no ha personalizado esta canción, se muestra la base original
  return {
    id: baseSong.id,
    title: baseSong.title,
    artist: baseSong.artist,
    key: baseSong.originalKey,
    bpm: baseSong.bpm,
    timeSignature: baseSong.timeSignature,
    sections: baseSong.sections,
    isLocalOverride: false,
    originalSong: baseSong
  };
}

/**
 * Resuelve una lista completa de canciones para la sede activa.
 */
export function resolveAllSongsForDisplay(
  baseSongs: BaseSong[],
  activeSedeId: string,
  overrides: SedeSongOverride[]
): DisplaySong[] {
  return baseSongs.map(song => resolveSongForDisplay(song, activeSedeId, overrides));
}
