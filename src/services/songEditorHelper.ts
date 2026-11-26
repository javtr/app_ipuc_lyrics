import { BaseSong, DisplaySong, SedeSongOverride, SongSection } from '../types';
import { getCleanLyrics } from './chordParser';
import { isSongVisibleInSede, resolveSongForDisplay } from './songResolver';

/**
 * Normaliza texto removiendo tildes/diacríticos y espacios extremos para búsquedas y slugs en español.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Genera un slug URL-safe único sin tildes ni guiones colgantes, evitando colisiones con IDs existentes.
 */
export function generateUniqueSongSlug(
  title: string,
  existingIds: Iterable<string>
): string {
  const baseSlug = normalizeSearchText(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `cancion-${Date.now()}`;

  const used = new Set(existingIds);
  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (used.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }
  return `${baseSlug}-${suffix}`;
}

/**
 * Indica si un arreglo de secciones contiene anotaciones ChordPro (`[...]`).
 */
export function hasChordAnnotations(sections: SongSection[]): boolean {
  return sections.some(sec => sec.lines.some(line => /\[[^\]]+\]/.test(line)));
}

function stripChordsFromLine(line: string): string {
  return line.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Preserva los acordes ChordPro originales de toda línea cuyo texto lírico limpio
 * no fue alterado al editar en Modo Lector (sin acordes visibles).
 */
export function restoreChordsInEditedSections(
  editedSections: SongSection[],
  originalSections: SongSection[]
): SongSection[] {
  if (!hasChordAnnotations(originalSections)) {
    return editedSections;
  }

  const originalByCleanLine = new Map<string, string[]>();
  for (const section of originalSections) {
    for (const line of section.lines) {
      if (!/\[[^\]]+\]/.test(line)) continue;
      const cleanKey = stripChordsFromLine(line);
      if (!cleanKey) continue;
      const queue = originalByCleanLine.get(cleanKey) || [];
      queue.push(line);
      originalByCleanLine.set(cleanKey, queue);
    }
  }

  return editedSections.map(section => ({
    ...section,
    lines: section.lines.map(line => {
      if (/\[[^\]]+\]/.test(line)) {
        return line;
      }
      const cleanKey = stripChordsFromLine(line);
      const queue = originalByCleanLine.get(cleanKey);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
      return line;
    })
  }));
}

/**
 * Construye el título para una variante de sede sin duplicar sufijos de versión al re-editar.
 */
export function buildOverrideTitle(
  inputTitle: string,
  baseTitle: string,
  sedeLabel: string,
  existingCustomTitle?: string
): string {
  const cleanInput = inputTitle.trim();
  if (!cleanInput) {
    return `${baseTitle} (${sedeLabel})`;
  }

  if (existingCustomTitle && cleanInput === existingCustomTitle) {
    return cleanInput;
  }

  const hasVersionMarker = /\((?:versi[oó]n|sede)\b/i.test(cleanInput) || cleanInput.includes(sedeLabel);
  if (cleanInput !== baseTitle.trim() || hasVersionMarker) {
    return cleanInput;
  }

  return `${cleanInput} (${sedeLabel})`;
}

/**
 * Extrae la primera línea limpia de letra (sin corchetes de acordes) para previsualización en catálogo.
 */
export function getSongOpeningLine(sections: SongSection[]): string {
  for (const section of sections) {
    const cleanLines = getCleanLyrics(section.lines);
    for (const line of cleanLines) {
      const trimmed = line.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return '';
}

/**
 * Filtra una canción comparando una consulta normalizada contra su título y la letra limpia de sus estrofas.
 */
export function matchesSongTitleOrLyrics(
  song: BaseSong,
  query: string,
  resolvedSections?: SongSection[],
  resolvedTitle?: string
): boolean {
  const normalizedQuery = normalizeSearchText(query).replace(/\s+/g, ' ');
  if (!normalizedQuery) return true;

  if (normalizeSearchText(song.title).replace(/\s+/g, ' ').includes(normalizedQuery)) {
    return true;
  }
  if (resolvedTitle && normalizeSearchText(resolvedTitle).replace(/\s+/g, ' ').includes(normalizedQuery)) {
    return true;
  }

  const sections = resolvedSections || song.sections;
  const allCleanLyrics = sections
    .flatMap(sec => getCleanLyrics(sec.lines))
    .join(' ')
    .replace(/\s+/g, ' ');

  return normalizeSearchText(allCleanLyrics).includes(normalizedQuery);
}

export const ALPHABET_LETTERS: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Extrae la letra inicial alfabética (A-Z) ignorando tildes y signos iniciales (¡, ¿, ");
 * si inicia con dígito o símbolo devuelve '#'.
 */
export function getSongInitialLetter(title: string): string {
  const normalized = normalizeSearchText(title).replace(/^[^a-z0-9]+/i, '');
  const first = normalized.charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * Compara títulos alfabéticamente en español ignorando signos iniciales de apertura.
 */
export function compareSongTitlesEs(titleA: string, titleB: string): number {
  const cleanA = titleA.replace(/^[¡¿"'(\s]+/, '');
  const cleanB = titleB.replace(/^[¡¿"'(\s]+/, '');
  return cleanA.localeCompare(cleanB, 'es', { sensitivity: 'base' });
}

export interface AlphabeticalGroup<T> {
  letter: string;
  items: T[];
}

/**
 * Ordena alfabéticamente por título y agrupa en secciones por letra inicial ('A'..'Z', '#').
 */
export function groupEntriesAlphabetically<T>(
  entries: T[],
  getTitle: (entry: T) => string
): AlphabeticalGroup<T>[] {
  const sorted = [...entries].sort((a, b) => compareSongTitlesEs(getTitle(a), getTitle(b)));
  const buckets = new Map<string, T[]>();

  for (const entry of sorted) {
    const letter = getSongInitialLetter(getTitle(entry));
    const groupItems = buckets.get(letter) || [];
    groupItems.push(entry);
    buckets.set(letter, groupItems);
  }

  const orderedEntries = Array.from(buckets.entries()).sort(([a], [b]) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  return orderedEntries.map(([letter, items]) => ({ letter, items }));
}

/**
 * Filtra y ordena canciones por título para el buscador de Repertorios (prefijo antes que coincidencia parcial).
 */
export function filterAndSortSongsByTitle(
  songs: BaseSong[],
  query: string,
  limit: number = 30
): { matches: BaseSong[]; totalMatching: number } {
  const normalizedQuery = normalizeSearchText(query).replace(/\s+/g, ' ');
  const sorted = [...songs].sort((a, b) => compareSongTitlesEs(a.title, b.title));

  if (!normalizedQuery) {
    return { matches: sorted.slice(0, limit), totalMatching: sorted.length };
  }

  const startsWithMatches: BaseSong[] = [];
  const containsMatches: BaseSong[] = [];

  for (const song of sorted) {
    const normTitle = normalizeSearchText(song.title).replace(/\s+/g, ' ');
    if (normTitle.startsWith(normalizedQuery)) {
      startsWithMatches.push(song);
    } else if (normTitle.includes(normalizedQuery)) {
      containsMatches.push(song);
    }
  }

  const combined = [...startsWithMatches, ...containsMatches];
  return { matches: combined.slice(0, limit), totalMatching: combined.length };
}

export const CATALOG_PAGE_SIZE = 30;

export interface IndexedCatalogItem {
  song: BaseSong;
  resolvedItem: DisplaySong;
  letter: string;
  openingLine: string;
  normTitle: string;
  normLyrics: string;
}

/**
 * Pre-indexa en memoria las canciones visibles de la sede activa con título, letra limpia
 * y orden alfabético precalculados para filtrar en < 5 ms sin reprocesar ChordPro en cada tecla.
 */
export function buildIndexedCatalog(
  songs: BaseSong[],
  activeSedeId: string,
  overrides: SedeSongOverride[],
  sedeLabel: string
): IndexedCatalogItem[] {
  const sedeOverrideMap = new Map<string, SedeSongOverride>();
  if (activeSedeId && activeSedeId !== 'general') {
    for (const ov of overrides) {
      if (ov.sedeId === activeSedeId) {
        sedeOverrideMap.set(ov.baseSongId, ov);
      }
    }
  }

  const visible = songs
    .filter(song => isSongVisibleInSede(song, activeSedeId))
    .sort((a, b) => compareSongTitlesEs(a.title, b.title));

  return visible.map(song => {
    const ov = sedeOverrideMap.get(song.id);
    const resolvedItem = ov
      ? resolveSongForDisplay(song, activeSedeId, [ov], { sedeLabel })
      : resolveSongForDisplay(song, activeSedeId, [], { sedeLabel });

    const cleanLyrics = resolvedItem.sections
      .flatMap(sec => getCleanLyrics(sec.lines))
      .join(' ')
      .replace(/\s+/g, ' ');

    return {
      song,
      resolvedItem,
      letter: getSongInitialLetter(song.title),
      openingLine: getSongOpeningLine(resolvedItem.sections),
      normTitle: normalizeSearchText(`${song.title} ${resolvedItem.title}`).replace(/\s+/g, ' '),
      normLyrics: normalizeSearchText(cleanLyrics).replace(/\s+/g, ' ')
    };
  });
}

/**
 * Filtra el índice precalculado priorizando coincidencias en el título sobre coincidencias en estrofas.
 */
export function filterIndexedCatalog(
  indexedItems: IndexedCatalogItem[],
  query: string
): IndexedCatalogItem[] {
  const normQuery = normalizeSearchText(query).replace(/\s+/g, ' ');
  if (!normQuery) {
    return indexedItems;
  }

  const titleMatches: IndexedCatalogItem[] = [];
  const lyricsMatches: IndexedCatalogItem[] = [];

  for (const item of indexedItems) {
    if (item.normTitle.includes(normQuery)) {
      titleMatches.push(item);
    } else if (item.normLyrics.includes(normQuery)) {
      lyricsMatches.push(item);
    }
  }

  return [...titleMatches, ...lyricsMatches];
}

/**
 * Pagina el catálogo filtrado a bloques de tamaño fijo (por defecto 30 canciones).
 */
export function paginateCatalogItems<T>(
  items: T[],
  requestedPage: number,
  pageSize: number = CATALOG_PAGE_SIZE
): {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    pageItems,
    currentPage,
    totalPages,
    startIndex,
    endIndex: startIndex + pageItems.length
  };
}
