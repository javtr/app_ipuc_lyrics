import { SongSection } from '../types';

export const CHROMATIC_SCALE = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

const FLAT_TO_SHARP_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
  'Fb': 'E',
  'B#': 'C',
  'E#': 'F'
};

/**
 * Normaliza una nota raíz en sostenido o bemol al índice cromático equivalente.
 */
function normalizeRootNote(note: string): string {
  return FLAT_TO_SHARP_MAP[note] || note;
}

/**
 * Extrae la nota raíz principal de una tonalidad o acorde (ej. "Am" -> "A", "F#m" -> "F#").
 */
function extractRootFromKey(key: string): string | null {
  const trimmed = key.trim();
  const match = trimmed.match(/^([A-G][#b]?)/);
  return match ? match[1] : null;
}

/**
 * Calcula la diferencia mínima en semitonos con signo (en rango [-5, +6]) entre dos tonalidades.
 */
export function getSemitoneDifference(fromKey: string, toKey: string): number {
  const fromRoot = extractRootFromKey(fromKey);
  const toRoot = extractRootFromKey(toKey);
  if (!fromRoot || !toRoot) return 0;

  const fromIdx = CHROMATIC_SCALE.indexOf(normalizeRootNote(fromRoot));
  const toIdx = CHROMATIC_SCALE.indexOf(normalizeRootNote(toRoot));
  if (fromIdx === -1 || toIdx === -1) return 0;

  const rawDelta = (toIdx - fromIdx + 12) % 12;
  return rawDelta > 6 ? rawDelta - 12 : rawDelta;
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

  const trimmed = chord.trim();

  // Manejo de acordes con bajo invertido (ej. D/F#)
  if (trimmed.includes('/')) {
    const [mainChord, bassChord] = trimmed.split('/');
    return `${transposeChord(mainChord, semitones)}/${transposeChord(bassChord, semitones)}`;
  }

  // Regex para extraer nota raíz (A-G seguido opcionalmente de # o b) y el resto del sufijo
  const match = trimmed.match(/^([A-G][#b]?)(.*)$/);
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

export interface ChordWordGroup {
  isSpace: boolean;
  tokens: ChordLyricToken[];
}

/**
 * Parsea una línea de texto ChordPro en tokens de acorde + texto para alinear visualmente los acordes sobre las sílabas.
 */
export function parseChordProLine(line: string): ChordLyricToken[] {
  const firstBracket = line.indexOf('[');
  if (firstBracket === -1) {
    return [{ text: line }];
  }

  const tokens: ChordLyricToken[] = [];
  const regex = /\[([^\]]+)\]([^\[]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let hasMatch = false;

  if (firstBracket > 0) {
    tokens.push({
      text: line.substring(0, firstBracket)
    });
    lastIndex = firstBracket;
  }

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex && hasMatch) {
      tokens.push({ text: line.substring(lastIndex, match.index) });
    }
    hasMatch = true;
    tokens.push({
      chord: match[1],
      text: match[2]
    });
    lastIndex = regex.lastIndex;
  }

  if (!hasMatch) {
    return [{ text: line }];
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex) });
  }

  return tokens;
}

/**
 * Agrupa tokens ChordPro por límites de palabra para evitar cortes visuales dentro de una sílaba
 * (ej. "Per[Em]dido") sin romper el salto natural entre palabras en pantallas móviles.
 */
export function groupChordTokensIntoWords(tokens: ChordLyricToken[]): ChordWordGroup[] {
  const groups: ChordWordGroup[] = [];
  let currentWordTokens: ChordLyricToken[] = [];

  const flushWord = () => {
    if (currentWordTokens.length > 0) {
      groups.push({ isSpace: false, tokens: currentWordTokens });
      currentWordTokens = [];
    }
  };

  for (const token of tokens) {
    const rawText = token.text;
    if (!rawText) {
      if (token.chord) {
        currentWordTokens.push({ chord: token.chord, text: '' });
      }
      continue;
    }

    const parts = rawText.split(/(\s+)/).filter(part => part.length > 0);
    let chordUsed = !token.chord;

    for (const part of parts) {
      const isWhitespace = /^\s+$/.test(part);
      if (isWhitespace) {
        flushWord();
        if (!chordUsed && token.chord) {
          groups.push({ isSpace: true, tokens: [{ chord: token.chord, text: part }] });
          chordUsed = true;
        } else {
          groups.push({ isSpace: true, tokens: [{ text: part }] });
        }
      } else {
        if (!chordUsed && token.chord) {
          currentWordTokens.push({ chord: token.chord, text: part });
          chordUsed = true;
        } else {
          currentWordTokens.push({ text: part });
        }
      }
    }
  }

  flushWord();
  return groups;
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

/**
 * Transpone todos los acordes ChordPro dentro de un texto multilínea,
 * preservando directivas de sección como `{verse: Verso 1}` sin alterarlas.
 */
export function transposeChordProText(rawText: string, semitones: number): string {
  if (semitones === 0) return rawText;

  return rawText
    .split(/\r?\n/)
    .map(line => {
      if (/^\s*\{[^}]+\}\s*$/.test(line)) {
        return line;
      }
      return transposeLine(line, semitones);
    })
    .join('\n');
}
