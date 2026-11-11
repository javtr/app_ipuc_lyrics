import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSedeBranch, getRawFileUrl, GIT_CONFIG } from '../src/config/gitConfig';
import {
  syncGeneralCatalog,
  syncSedeFromGitHub,
  isSedeSynced,
  getStoredSedes,
  getLastSyncAt
} from '../src/services/gitSyncService';
import { resolveSongForDisplay } from '../src/services/songResolver';
import { db } from '../src/db';
import { BaseSong, SedeProfile, SedeSongOverride } from '../src/types';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('gitConfig y gitSyncService (Etapa A)', () => {
  let memoryStorage: ReturnType<typeof createMemoryStorage>;

  const remoteSong: BaseSong = {
    id: 'sublime-gracia',
    title: 'Sublime Gracia (Oficial)',
    artist: 'John Newton',
    originalKey: 'G',
    updatedAt: '2026-11-11T10:00:00.000Z',
    sections: [
      { id: 'v1', type: 'verse', label: 'Verso 1', lines: ['[G]Sublime gracia'] }
    ]
  };

  const remoteSedes: SedeProfile[] = [
    { id: 'general', name: 'Catálogo General', shortName: 'General', isDefault: true },
    { id: 'sede-palestina', name: 'Sede Palestina', shortName: 'Palestina' }
  ];

  const remoteOverride: SedeSongOverride = {
    id: 'sublime-gracia_sede-palestina',
    baseSongId: 'sublime-gracia',
    sedeId: 'sede-palestina',
    customTitle: 'Sublime Gracia (Palestina)',
    customKey: 'A',
    updatedAt: '2026-11-11T10:05:00.000Z'
  };

  beforeEach(() => {
    memoryStorage = createMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    vi.stubGlobal('navigator', { onLine: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('debe mapear correctamente las ramas de datos por sede y construir URLs Raw', () => {
    expect(getSedeBranch('general')).toBe(GIT_CONFIG.catalogBranch);
    expect(getSedeBranch(undefined)).toBe(GIT_CONFIG.catalogBranch);
    expect(getSedeBranch('sede-palestina')).toBe('sede/palestina');

    const url = getRawFileUrl('sede/palestina', 'overrides.json', 12345);
    expect(url).toBe(
      `https://raw.githubusercontent.com/${GIT_CONFIG.owner}/${GIT_CONFIG.repo}/sede/palestina/overrides.json?t=12345`
    );
  });

  it('debe sincronizar el catálogo general y actualizar registros semilla sin pisar ediciones locales recientes', async () => {
    const localSeedSong: BaseSong = {
      ...remoteSong,
      title: 'Sublime Gracia (Semilla)',
      updatedAt: '2026-12-01T00:00:00.000Z', // incluso con fecha mayor, syncSource 'seed' se actualiza
      syncSource: 'seed'
    };

    const newerLocalEditedSong: BaseSong = {
      id: 'cancion-local-nueva',
      title: 'Mi Borrador Local',
      originalKey: 'C',
      updatedAt: '2026-11-12T10:00:00.000Z',
      syncSource: 'local',
      sections: [{ id: 'v1', type: 'verse', label: 'Verso 1', lines: ['Texto local'] }]
    };

    const olderRemoteVersionOfLocal: BaseSong = {
      ...newerLocalEditedSong,
      title: 'Versión Antigua Remota',
      updatedAt: '2026-11-10T10:00:00.000Z'
    };

    vi.spyOn(db.songs, 'toArray').mockResolvedValue([localSeedSong, newerLocalEditedSong]);
    const bulkPutSpy = vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('sedes.json')) {
        return new Response(JSON.stringify(remoteSedes), { status: 200 });
      }
      if (url.includes('catalog.json')) {
        return new Response(
          JSON.stringify([remoteSong, olderRemoteVersionOfLocal]),
          { status: 200 }
        );
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncGeneralCatalog({ force: true });

    expect(result.status).toBe('synced');
    expect(result.updatedSongs).toBe(1);
    expect(bulkPutSpy).toHaveBeenCalledTimes(1);
    expect(bulkPutSpy).toHaveBeenCalledWith([
      { ...remoteSong, syncSource: 'remote' }
    ]);
    expect(getStoredSedes([])).toEqual(remoteSedes);
    expect(getLastSyncAt()).not.toBeNull();
  });

  it('debe sincronizar variantes de una sede y manejar 404 grácilmente si aún no tiene overrides en Git', async () => {
    vi.spyOn(db.overrides, 'toArray').mockResolvedValue([]);
    const ovBulkPutSpy = vi.spyOn(db.overrides, 'bulkPut').mockResolvedValue('ok' as never);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sede/palestina/overrides.json')) {
        return new Response(JSON.stringify([remoteOverride]), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const palResult = await syncSedeFromGitHub('sede-palestina');
    expect(palResult.status).toBe('synced');
    expect(palResult.updatedOverrides).toBe(1);
    expect(ovBulkPutSpy).toHaveBeenCalledWith([
      { ...remoteOverride, syncSource: 'remote' }
    ]);
    expect(isSedeSynced('sede-palestina')).toBe(true);

    const centralResult = await syncSedeFromGitHub('sede-central');
    expect(centralResult.status).toBe('synced');
    expect(centralResult.updatedOverrides).toBe(0);
    expect(isSedeSynced('sede-central')).toBe(true);
  });

  it('debe omitir peticiones de red cuando el navegador está offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await syncGeneralCatalog();
    expect(res.status).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debe generar aviso de fallback seguro cuando una sede esperada no está sincronizada', () => {
    const resolved = resolveSongForDisplay(remoteSong, 'general', [], {
      expectedSedeId: 'sede-central',
      isSedeSynced: false,
      sedeLabel: 'Sede Central'
    });

    expect(resolved.isLocalOverride).toBe(false);
    expect(resolved.title).toBe('Sublime Gracia (Oficial)');
    expect(resolved.fallbackNotice).toContain('Mostrando versión base del catálogo general');
    expect(resolved.fallbackNotice).toContain('Sede Central');

    const resolvedSynced = resolveSongForDisplay(remoteSong, 'general', [], {
      expectedSedeId: 'sede-central',
      isSedeSynced: true,
      sedeLabel: 'Sede Central'
    });
    expect(resolvedSynced.fallbackNotice).toBeUndefined();
  });
});
