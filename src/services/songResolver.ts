import { BaseSong, SedeSongOverride, DisplaySong } from '../types';
import { getSemitoneDifference, transposeSections } from './chordParser';

export interface ResolveSongOptions {
  expectedSedeId?: string;
  isSedeSynced?: boolean;
  sedeLabel?: string;
}

function toBaseDisplaySong(baseSong: BaseSong, fallbackNotice?: string): DisplaySong {
  return {
    id: baseSong.id,
    title: baseSong.title,
    artist: baseSong.artist,
    key: baseSong.originalKey,
    bpm: baseSong.bpm,
    timeSignature: baseSong.timeSignature,
    sections: baseSong.sections,
    notes: baseSong.notes,
    sedeId: baseSong.sedeId,
    isLocalOverride: false,
    originalSong: baseSong,
    fallbackNotice
  };
}

/**
 * Determina si una canción debe ser visible dentro de la sede indicada.
 * Las canciones sin sede o marcadas como 'general' son públicas en todas las sedes;
 * las canciones creadas para una sede específica solo son visibles dentro de esa sede.
 */
export function isSongVisibleInSede(song: BaseSong, targetSedeId: string): boolean {
  if (!song.sedeId || song.sedeId === 'general') {
    return true;
  }
  return song.sedeId === targetSedeId;
}

/**
 * Resuelve una canción para mostrar en la interfaz según la sede seleccionada.
 * Si la sede activa (o esperada desde un repertorio) tiene una versión local (override),
 * la aplica respetando el cancionero base original. Si el override solo cambia el tono,
 * transpone automáticamente los acordes de la base. Si falta sincronizar esa sede,
 * aplica fallback seguro al catálogo general con un aviso discreto.
 */
export function resolveSongForDisplay(
  baseSong: BaseSong,
  activeSedeId: string,
  overrides: SedeSongOverride[],
  options?: ResolveSongOptions
): DisplaySong {
  const targetSedeId = options?.expectedSedeId || activeSedeId;

  // Si estamos en el catálogo general, se retorna la versión base pura
  if (!targetSedeId || targetSedeId === 'general') {
    return toBaseDisplaySong(baseSong);
  }

  // Buscar si la sede objetivo tiene una sobreescritura/versión local de esta canción
  const override = overrides.find(
    o => o.baseSongId === baseSong.id && o.sedeId === targetSedeId
  );

  if (override) {
    const resolvedKey = override.customKey || baseSong.originalKey;
    const hasCustomSections = Boolean(override.customSections && override.customSections.length > 0);
    const semitoneShift = !hasCustomSections
      ? getSemitoneDifference(baseSong.originalKey, resolvedKey)
      : 0;
    const resolvedSections = hasCustomSections
      ? override.customSections!
      : transposeSections(baseSong.sections, semitoneShift);

    const friendlySede = options?.sedeLabel || `Sede ${targetSedeId.replace(/^sede-/, '')}`;

    return {
      id: baseSong.id,
      title: override.customTitle || `${baseSong.title} (${friendlySede})`,
      artist: baseSong.artist,
      key: resolvedKey,
      bpm: baseSong.bpm,
      timeSignature: baseSong.timeSignature,
      sections: resolvedSections,
      notes: override.localNotes,
      isLocalOverride: true,
      sedeId: targetSedeId,
      originalSong: baseSong
    };
  }

  // Si la sede esperada aún no ha sido sincronizada (ej. repertorio recibido offline), emitir aviso seguro
  const isSynced = options?.isSedeSynced ?? true;
  const fallbackNotice = !isSynced
    ? `Mostrando versión base del catálogo general (la adaptación de ${options?.sedeLabel || targetSedeId} requiere conexión para sincronizarse).`
    : undefined;

  return toBaseDisplaySong(baseSong, fallbackNotice);
}

/**
 * Resuelve una lista completa de canciones para la sede activa.
 */
export function resolveAllSongsForDisplay(
  baseSongs: BaseSong[],
  activeSedeId: string,
  overrides: SedeSongOverride[]
): DisplaySong[] {
  return baseSongs
    .filter(song => isSongVisibleInSede(song, activeSedeId))
    .map(song => resolveSongForDisplay(song, activeSedeId, overrides));
}
