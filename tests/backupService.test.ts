import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importBackupFromJson, BackupPayload } from '../src/services/backupService';
import { db } from '../src/db';

describe('backupService', () => {
  beforeEach(() => {
    vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);
    vi.spyOn(db.overrides, 'bulkPut').mockResolvedValue('ok' as never);
    vi.spyOn(db.setlists, 'bulkPut').mockResolvedValue('ok' as never);
  });

  const validPayload: BackupPayload = {
    app: 'AppLyrics',
    version: '1.0',
    exportedAt: '2026-11-09T12:00:00Z',
    data: {
      songs: [
        {
          id: 'sublime-gracia',
          title: 'Sublime Gracia',
          originalKey: 'G',
          updatedAt: '2026-01-01',
          sections: [
            { id: 'v1', type: 'verse', label: 'Verso 1', lines: ['[G]Sublime gracia'] }
          ]
        }
      ],
      overrides: [
        {
          id: 'sublime-gracia_sede-palestina',
          baseSongId: 'sublime-gracia',
          sedeId: 'sede-palestina',
          customKey: 'A',
          updatedAt: '2026-01-01'
        }
      ],
      setlists: [
        {
          id: 'setlist_1',
          name: 'Culto Domingo',
          date: '2026-11-15',
          sedeId: 'sede-palestina',
          createdAt: '2026-11-09',
          items: [{ songId: 'sublime-gracia', key: 'A', order: 1 }]
        }
      ]
    }
  };

  it('debe importar y sincronizar un archivo de respaldo válido', async () => {
    const jsonString = JSON.stringify(validPayload);
    const stats = await importBackupFromJson(jsonString);

    expect(stats.songsCount).toBe(1);
    expect(stats.overridesCount).toBe(1);
    expect(stats.setlistsCount).toBe(1);

    expect(db.songs.bulkPut).toHaveBeenCalledWith(validPayload.data.songs);
    expect(db.overrides.bulkPut).toHaveBeenCalledWith(validPayload.data.overrides);
    expect(db.setlists.bulkPut).toHaveBeenCalledWith(validPayload.data.setlists);
  });

  it('debe rechazar un archivo con JSON inválido', async () => {
    await expect(importBackupFromJson('texto_invalido_no_json')).rejects.toThrow(
      'El archivo seleccionado no contiene un formato JSON válido.'
    );
  });

  it('debe rechazar un archivo con firma de aplicación diferente', async () => {
    const wrongAppJson = JSON.stringify({
      app: 'OtherMusicApp',
      data: {}
    });

    await expect(importBackupFromJson(wrongAppJson)).rejects.toThrow(
      'El archivo no es una copia de seguridad válida de App Lyrics.'
    );
  });
});
