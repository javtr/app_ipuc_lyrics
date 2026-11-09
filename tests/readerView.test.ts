import { describe, it, expect } from 'vitest';
import { getCleanLyrics } from '../src/services/chordParser';
import { DisplaySong } from '../src/types';

describe('ReaderView data processing', () => {
  const mockSong: DisplaySong = {
    id: 'sublime-gracia',
    title: 'Sublime Gracia',
    artist: 'John Newton',
    key: 'G',
    bpm: 72,
    timeSignature: '3/4',
    isLocalOverride: false,
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          '[G]Sublime gracia del [C]Señor[G]',
          'Que a un [Em]infeliz sal[D]vó'
        ]
      },
      {
        id: 'c1',
        type: 'chorus',
        label: 'Coro',
        lines: [
          '[G]¡Aleluya! [C]¡Ale[G]luya!',
          'A [Em]Cristo daré [D]loor'
        ]
      }
    ]
  };

  it('debe filtrar y presentar únicamente texto limpio para el usuario normal', () => {
    const verseLines = getCleanLyrics(mockSong.sections[0].lines);
    const chorusLines = getCleanLyrics(mockSong.sections[1].lines);

    expect(verseLines).toEqual([
      'Sublime gracia del Señor',
      'Que a un infeliz salvó'
    ]);

    expect(chorusLines).toEqual([
      '¡Aleluya! ¡Aleluya!',
      'A Cristo daré loor'
    ]);

    // Verificar que no queden corchetes ni notas musicales
    expect(verseLines.join(' ')).not.toContain('[');
    expect(verseLines.join(' ')).not.toContain(']');
    expect(chorusLines.join(' ')).not.toContain('[');
    expect(chorusLines.join(' ')).not.toContain(']');
  });
});
