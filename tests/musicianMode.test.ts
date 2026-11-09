import { describe, it, expect } from 'vitest';
import { getCleanLyrics, parseChordProLine } from '../src/services/chordParser';
import { serializeSectionsToText, parseTextToSections } from '../src/services/chordSerializer';
import { SongSection } from '../src/types';

describe('Musician Mode vs Reader Mode Data Integrity', () => {
  const sampleChordProText = `{verse: Verso 1}
[G]Sublime gracia del [C]Señor[G]
Que a un [Em]infeliz sal[D]vó

{chorus: Coro}
[G]¡Aleluya! [C]¡Ale[G]luya!
[D]Por siempre y para [G]siempre`;

  it('debe limpiar todos los acordes en Modo Lector para que el usuario no vea teoría musical', () => {
    const sections: SongSection[] = parseTextToSections(sampleChordProText);
    expect(sections.length).toBe(2);

    const verseClean = getCleanLyrics(sections[0].lines);
    const chorusClean = getCleanLyrics(sections[1].lines);

    // No debe contener corchetes de acordes [G], [C], etc.
    expect(verseClean[0]).toBe('Sublime gracia del Señor');
    expect(verseClean[1]).toBe('Que a un infeliz salvó');
    expect(verseClean.join('\n')).not.toMatch(/\[.*?\]/);

    expect(chorusClean[0]).toBe('¡Aleluya! ¡Aleluya!');
    expect(chorusClean[1]).toBe('Por siempre y para siempre');
    expect(chorusClean.join('\n')).not.toMatch(/\[.*?\]/);
  });

  it('debe preservar la posición exacta de los acordes en Modo Músico', () => {
    const line = '[G]Sublime gracia del [C]Señor[G]';
    const tokens = parseChordProLine(line);

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].chord).toBe('G');
    expect(tokens[0].text).toBe('Sublime gracia del ');
    expect(tokens[1].chord).toBe('C');
    expect(tokens[1].text).toBe('Señor');
    expect(tokens[2].chord).toBe('G');
  });

  it('debe permitir serializar y deserializar secciones sin alterar la letra lírica', () => {
    const sections = parseTextToSections(sampleChordProText);
    const serialized = serializeSectionsToText(sections);

    // Despojado de acordes para edición en modo lector
    const strippedLyrics = serialized.replace(/\[[^\]]+\]/g, '');
    expect(strippedLyrics).toContain('Sublime gracia del Señor');
    expect(strippedLyrics).not.toContain('[G]');
    expect(strippedLyrics).not.toContain('[C]');

    // Al parsear de nuevo la letra despojada, sigue manteniendo las secciones intactas
    const reParsed = parseTextToSections(strippedLyrics);
    expect(reParsed.length).toBe(2);
    expect(reParsed[0].label).toBe('Verso 1');
    expect(reParsed[1].label).toBe('Coro');
    expect(reParsed[0].lines[0]).toBe('Sublime gracia del Señor');
  });
});
