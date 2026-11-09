import { SongSection } from '../types';

export const CHROMATIC_SCALE = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

const FLAT_TO_SHARP_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#'
};

/**
 * Normaliza un acorde bemol a su equivalente en sostenido para simplificar la transposición.
 */
function normalizeRootNote(note: string): string {
  return FLAT_TO_SHARP_MAP[note] || note;
}

/**
 * Transpone una nota raíz individual un número de semitonos.
 */
function transposeRootNote(root: string, semitones: number): string {
  const normalized = normalizeRootNote(root);
  const currentIndex = CHROMATIC_SCALE.indexOf(normalized);
  if (currentIndex === -1) {
    return root; // No se reconoce como nota válida, se retorna igual
  }

  const newIndex = (currentIndex + semitones + 1200) % 12;
  return CHROMATIC_SCALE[newIndex];
}

/**
 * Transpone un acorde completo (soporta acordes con slash como G/B o D/F#, y extensiones como m7, sus4, maj7, dim, aug).
 */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;

  // Manejo de acordes con bajo invertido (ej. D/F#)
  if (chord.includes('/')) {
    const [mainChord, bassChord] = chord.split('/');
    return `${transposeChord(mainChord, semitones)}/${transposeChord(bassChord, semitones)}`;
  }

  // Regex para extraer nota raíz (A-G seguido opcionalmente de # o b) y el resto del sufijo
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chord;

  const [, root, suffix] = match;
  const newRoot = transposeRootNote(root, semitones);
  return `${newRoot}${suffix}`;
}

/**
 * Transpone todos los acordes encerrados entre corchetes dentro de una línea de texto ChordPro.
 */
export function transposeLine(line: string, semitones: number): string {
  if (semitones === 0) return line;
  return line.replace(/\[([^\]]+)\]/g, (_, chord) => `[${transposeChord(chord, semitones)}]`);
}

/**
 * Extrae solo la letra limpia removiendo todos los acordes entre corchetes.
 * Ideal para el proyector de video beam / pantalla de audiovisuales.
 */
export function getCleanLyrics(lines: string[]): string[] {
  return lines.map(line => line.replace(/\[[^\]]+\]/g, ''));
}

export interface ChordLyricToken {
  chord?: string;
  text: string;
}

/**
 * Parsea una línea de texto ChordPro en tokens de acorde + texto para alinear visualmente los acordes sobre las sílabas.
 */
export function parseChordProLine(line: string): ChordLyricToken[] {
  const tokens: ChordLyricToken[] = [];
  const regex = /\[([^\]]+)\]([^\[]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Si la línea comienza con texto antes del primer acorde
  const firstBracket = line.indexOf('[');
  if (firstBracket > 0) {
    tokens.push({
      text: line.substring(0, firstBracket)
    });
  } else if (firstBracket === -1) {
    // Línea sin acordes
    return [{ text: line }];
  }

  while ((match = regex.exec(line)) !== null) {
    tokens.push({
      chord: match[1],
      text: match[2]
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length && firstBracket === -1) {
    tokens.push({ text: line.substring(lastIndex) });
  }

  return tokens;
}

/**
 * Transpone todas las secciones de una canción.
 */
export function transposeSections(sections: SongSection[], semitones: number): SongSection[] {
  if (semitones === 0) return sections;
  return sections.map(sec => ({
    ...sec,
    lines: sec.lines.map(line => transposeLine(line, semitones))
  }));
}
