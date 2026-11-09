import { describe, it, expect } from 'vitest';
import { resolveSongForDisplay } from '../src/services/songResolver';
import { BaseSong, SedeSongOverride } from '../src/types';

describe('songResolver service', () => {
  const mockBaseSong: BaseSong = {
    id: 'sublime-gracia',
    title: 'Sublime Gracia',
    artist: 'John Newton',
    originalKey: 'G',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: ['[G]Sublime gracia del [C]Señor[G]']
      }
    ]
  };

  const mockOverrides: SedeSongOverride[] = [
    {
      id: 'sublime-gracia_sede-palestina',
      baseSongId: 'sublime-gracia',
      sedeId: 'sede-palestina',
      customTitle: 'Sublime Gracia (Palestina Acústica)',
      customKey: 'A',
      localNotes: 'Tocar con guitarra y cello',
      updatedAt: '2026-01-02',
      customSections: [
        {
          id: 'v1',
          type: 'verse',
          label: 'Verso 1 (Local)',
          lines: ['[A]Sublime gracia del [D]Señor[A]']
        }
      ]
    }
  ];

  it('debe devolver la canción base cuando la sede activa es general', () => {
    const resolved = resolveSongForDisplay(mockBaseSong, 'general', mockOverrides);

    expect(resolved.id).toBe('sublime-gracia');
    expect(resolved.title).toBe('Sublime Gracia');
    expect(resolved.key).toBe('G');
    expect(resolved.isLocalOverride).toBe(false);
  });

  it('debe devolver la versión local cuando la sede tiene un override registrado', () => {
    const resolved = resolveSongForDisplay(mockBaseSong, 'sede-palestina', mockOverrides);

    expect(resolved.id).toBe('sublime-gracia');
    expect(resolved.title).toBe('Sublime Gracia (Palestina Acústica)');
    expect(resolved.key).toBe('A');
    expect(resolved.notes).toBe('Tocar con guitarra y cello');
    expect(resolved.isLocalOverride).toBe(true);
    expect(resolved.sections[0].label).toBe('Verso 1 (Local)');
    expect(resolved.originalSong?.title).toBe('Sublime Gracia');
  });

  it('debe devolver la canción base si la sede no tiene un override registrado para esa canción', () => {
    const resolved = resolveSongForDisplay(mockBaseSong, 'sede-central', mockOverrides);

    expect(resolved.id).toBe('sublime-gracia');
    expect(resolved.title).toBe('Sublime Gracia');
    expect(resolved.key).toBe('G');
    expect(resolved.isLocalOverride).toBe(false);
  });
});
