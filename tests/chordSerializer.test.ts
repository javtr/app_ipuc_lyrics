import { describe, it, expect } from 'vitest';
import { serializeSectionsToText, parseTextToSections } from '../src/services/chordSerializer';
import { SongSection } from '../src/types';

describe('chordSerializer service', () => {
  const sampleSections: SongSection[] = [
    {
      id: 's1',
      type: 'verse',
      label: 'Verso 1',
      lines: [
        '[G]Sublime gracia del [C]Señor[G]',
        'Que a un [Em]infeliz sal[D]vó'
      ]
    },
    {
      id: 's2',
      type: 'chorus',
      label: 'Coro',
      lines: [
        '[G]¡Aleluya! [C]¡Ale[G]luya!',
        'A [Em]Cristo daré [D]loor'
      ]
    }
  ];

  it('debe serializar secciones a texto con directivas legibles', () => {
    const text = serializeSectionsToText(sampleSections);

    expect(text).toContain('{verse: Verso 1}');
    expect(text).toContain('[G]Sublime gracia del [C]Señor[G]');
    expect(text).toContain('{chorus: Coro}');
    expect(text).toContain('[G]¡Aleluya! [C]¡Ale[G]luya!');
  });

  it('debe parsear texto con directivas de regreso a SongSection[] estructurado', () => {
    const rawText = `{verse: Verso 1}
[G]Sublime gracia del [C]Señor[G]
Que a un [Em]infeliz sal[D]vó

{chorus: Coro}
[G]¡Aleluya! [C]¡Ale[G]luya!
A [Em]Cristo daré [D]loor`;

    const parsed = parseTextToSections(rawText);

    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe('verse');
    expect(parsed[0].label).toBe('Verso 1');
    expect(parsed[0].lines).toEqual([
      '[G]Sublime gracia del [C]Señor[G]',
      'Que a un [Em]infeliz sal[D]vó'
    ]);

    expect(parsed[1].type).toBe('chorus');
    expect(parsed[1].label).toBe('Coro');
    expect(parsed[1].lines).toEqual([
      '[G]¡Aleluya! [C]¡Ale[G]luya!',
      'A [Em]Cristo daré [D]loor'
    ]);
  });

  it('debe inferir secciones automáticas para texto plano separado por líneas vacías', () => {
    const plainText = `Primera estrofa sin etiquetas
Segunda linea de estrofa

Tercera linea en otra estrofa
Cuarta linea`;

    const parsed = parseTextToSections(plainText);

    expect(parsed.length).toBe(2);
    expect(parsed[0].label).toBe('Verso 1');
    expect(parsed[1].label).toBe('Verso 2');
  });
});
