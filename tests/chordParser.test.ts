import { describe, it, expect } from 'vitest';
import { 
  getCleanLyrics, 
  transposeChord, 
  transposeLine, 
  parseChordProLine 
} from '../src/services/chordParser';

describe('chordParser service', () => {
  describe('getCleanLyrics', () => {
    it('debe remover acordes entre corchetes dejando solo el texto para proyección', () => {
      const rawLines = [
        '[G]Sublime gracia del [C]Señor[G]',
        'Que a un [Em]infeliz sal[D]vó'
      ];

      const clean = getCleanLyrics(rawLines);

      expect(clean).toEqual([
        'Sublime gracia del Señor',
        'Que a un infeliz salvó'
      ]);
    });

    it('debe preservar líneas que no tienen acordes', () => {
      const rawLines = ['Línea sin acordes', 'Otra línea de alabanza'];
      expect(getCleanLyrics(rawLines)).toEqual(rawLines);
    });
  });

  describe('transposeChord', () => {
    it('debe transponer notas simples hacia arriba y hacia abajo', () => {
      expect(transposeChord('C', 2)).toBe('D');
      expect(transposeChord('G', 2)).toBe('A');
      expect(transposeChord('A', -2)).toBe('G');
      expect(transposeChord('B', 1)).toBe('C');
      expect(transposeChord('C', -1)).toBe('B');
    });

    it('debe preservar sufijos como m, 7, maj7, sus4, add9', () => {
      expect(transposeChord('Am', 2)).toBe('Bm');
      expect(transposeChord('F#m7', 1)).toBe('Gm7');
      expect(transposeChord('Dsus4', 2)).toBe('Esus4');
      expect(transposeChord('Cmaj7', 3)).toBe('D#maj7');
    });

    it('debe transponer acordes con bajo invertido (slash chords)', () => {
      expect(transposeChord('G/B', 2)).toBe('A/C#');
      expect(transposeChord('D/F#', 2)).toBe('E/G#');
    });

    it('debe normalizar bemoles correctamente', () => {
      expect(transposeChord('Bb', 2)).toBe('C'); // Bb = A# -> +2 -> C
      expect(transposeChord('Eb', 1)).toBe('E'); // Eb = D# -> +1 -> E
    });
  });

  describe('transposeLine', () => {
    it('debe transponer todos los acordes dentro de una línea ChordPro', () => {
      const line = '[G]Sublime gracia del [C]Señor[G]';
      const transposed = transposeLine(line, 2);
      expect(transposed).toBe('[A]Sublime gracia del [D]Señor[A]');
    });
  });

  describe('parseChordProLine', () => {
    it('debe descomponer una línea en tokens de acorde y texto alineables', () => {
      const line = '[G]Sublime [C]gracia';
      const tokens = parseChordProLine(line);

      expect(tokens).toEqual([
        { chord: 'G', text: 'Sublime ' },
        { chord: 'C', text: 'gracia' }
      ]);
    });
  });
});
