import { describe, it, expect } from 'vitest';
import { compressSetlist, decompressSetlist } from '../src/services/urlSharing';
import { Setlist } from '../src/types';

describe('urlSharing service', () => {
  const mockSetlist: Setlist = {
    id: 'setlist_123',
    name: 'Culto Dominical Central',
    date: '2026-11-15',
    sedeId: 'sede-palestina',
    createdAt: '2026-11-09T12:00:00Z',
    items: [
      { songId: 'sublime-gracia', key: 'A', order: 1, notes: 'Intro suave' },
      { songId: 'cuan-grande-es-el', key: 'A', order: 2 },
      { songId: 'la-bondad-de-dios', key: 'G', order: 3 }
    ]
  };

  it('debe comprimir y descomprimir un repertorio sin pérdida de información', () => {
    const compressed = compressSetlist(mockSetlist);

    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = decompressSetlist(compressed);

    expect(decompressed).not.toBeNull();
    expect(decompressed?.name).toBe('Culto Dominical Central');
    expect(decompressed?.date).toBe('2026-11-15');
    expect(decompressed?.sedeId).toBe('sede-palestina');
    expect(decompressed?.items.length).toBe(3);
    expect(decompressed?.items[0]).toEqual({
      songId: 'sublime-gracia',
      key: 'A',
      order: 1,
      notes: 'Intro suave'
    });
    expect(decompressed?.items[1]).toEqual({
      songId: 'cuan-grande-es-el',
      key: 'A',
      order: 2,
      notes: undefined
    });
  });

  it('debe retornar null cuando el string comprimido es inválido o corrupto', () => {
    expect(decompressSetlist('invalid_corrupted_data_string')).toBeNull();
  });
});
