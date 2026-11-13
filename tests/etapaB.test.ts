import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { signJwt, verifyJwt } from '../functions/_lib/jwt';
import { onRequestPost as authPost } from '../functions/api/auth';
import { onRequestPost as commitPost } from '../functions/api/commit';
import { onRequestPost as suggestPost } from '../functions/api/suggest-correction';
import { onRequestPost as createSedePost } from '../functions/api/create-sede';
import { onRequestGet as syncGet } from '../functions/api/sync';
import { Env } from '../functions/_lib/types';
import {
  flushPendingSyncQueue,
  publishOrQueueChange,
  saveStoredSession,
  submitCorrectionSuggestion
} from '../src/services/cloudApiService';
import { syncGeneralCatalog, syncSedeFromGitHub } from '../src/services/gitSyncService';
import { db } from '../src/db';
import { BaseSong, SedeSongOverride } from '../src/types';

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

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

describe('Etapa B: Cloudflare Pages Functions, JWT, Issues y Cola Offline', () => {
  const testEnv: Env = {
    GITHUB_PAT: 'ghp_test_token',
    JWT_SECRET: 'super-secret-jwt-key-for-tests-2026',
    MASTER_PASSWORD: 'master-secret-password',
    SEDE_PASSWORDS_JSON: JSON.stringify({
      'sede-palestina': 'palestina-2026',
      'sede-central': 'central-2026'
    }),
    GITHUB_OWNER: 'javtr',
    GITHUB_REPO: 'app_ipuc_lyrics',
    CATALOG_BRANCH: 'catalog'
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('firma, verifica y rechaza JWT manipulados o expirados con Web Crypto', async () => {
    const token = await signJwt(
      {
        role: 'sede',
        sedeId: 'sede-palestina',
        branch: 'sede/palestina',
        iat: Date.now(),
        exp: Date.now() + 60_000
      },
      testEnv.JWT_SECRET
    );

    const verified = await verifyJwt(token, testEnv.JWT_SECRET);
    expect(verified?.role).toBe('sede');
    expect(verified?.sedeId).toBe('sede-palestina');

    // Firma inválida
    expect(await verifyJwt(token, 'wrong-secret')).toBeNull();
    const parts = token.split('.');
    expect(await verifyJwt(`${parts[0]}.${parts[1]}.tampered`, testEnv.JWT_SECRET)).toBeNull();

    // Token expirado
    const expired = await signJwt(
      {
        role: 'master',
        sedeId: 'general',
        branch: 'catalog',
        iat: Date.now() - 10_000,
        exp: Date.now() - 1000
      },
      testEnv.JWT_SECRET
    );
    expect(await verifyJwt(expired, testEnv.JWT_SECRET)).toBeNull();
  });

  it('POST /api/auth valida claves de sede y clave maestra', async () => {
    // Login sede válido
    const sedeRes = await authPost({
      request: new Request('https://app.pages.dev/api/auth', {
        method: 'POST',
        body: JSON.stringify({ sedeId: 'sede-palestina', password: 'palestina-2026' })
      }),
      env: testEnv
    });
    expect(sedeRes.status).toBe(200);
    const sedeBody = (await sedeRes.json()) as { role: string; sedeId: string; token: string };
    expect(sedeBody.role).toBe('sede');
    expect(sedeBody.sedeId).toBe('sede-palestina');
    expect(sedeBody.token).toContain('.');

    // Clave incorrecta
    const badRes = await authPost({
      request: new Request('https://app.pages.dev/api/auth', {
        method: 'POST',
        body: JSON.stringify({ sedeId: 'sede-palestina', password: 'wrong' })
      }),
      env: testEnv
    });
    expect(badRes.status).toBe(401);

    // Intento de general sin clave maestra
    const deniedGeneral = await authPost({
      request: new Request('https://app.pages.dev/api/auth', {
        method: 'POST',
        body: JSON.stringify({ sedeId: 'general', password: 'palestina-2026' })
      }),
      env: testEnv
    });
    expect(deniedGeneral.status).toBe(403);

    // Login maestro válido
    const masterRes = await authPost({
      request: new Request('https://app.pages.dev/api/auth', {
        method: 'POST',
        body: JSON.stringify({ sedeId: 'general', password: 'master-secret-password' })
      }),
      env: testEnv
    });
    expect(masterRes.status).toBe(200);
    const masterBody = (await masterRes.json()) as { role: string };
    expect(masterBody.role).toBe('master');
  });

  it('POST /api/commit impide escalamiento entre sedes y publica local_songs.json en UTF-8', async () => {
    const sedeToken = await signJwt(
      {
        role: 'sede',
        sedeId: 'sede-palestina',
        branch: 'sede/palestina',
        iat: Date.now(),
        exp: Date.now() + 60_000
      },
      testEnv.JWT_SECRET
    );

    // Sin token => 401
    const unauth = await commitPost({
      request: new Request('https://app.pages.dev/api/commit', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete_song', targetSedeId: 'sede-palestina', songId: 'x' })
      }),
      env: testEnv
    });
    expect(unauth.status).toBe(401);

    // Líder de Palestina intentando editar general => 403
    const forbiddenGeneral = await commitPost({
      request: new Request('https://app.pages.dev/api/commit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sedeToken}` },
        body: JSON.stringify({ action: 'delete_song', targetSedeId: 'general', songId: 'sublime-gracia' })
      }),
      env: testEnv
    });
    expect(forbiddenGeneral.status).toBe(403);

    // Líder de Palestina intentando editar otra sede => 403
    const forbiddenOtherSede = await commitPost({
      request: new Request('https://app.pages.dev/api/commit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sedeToken}` },
        body: JSON.stringify({ action: 'delete_song', targetSedeId: 'sede-central', songId: 'x' })
      }),
      env: testEnv
    });
    expect(forbiddenOtherSede.status).toBe(403);

    // Escritura válida en local_songs.json de sede-palestina con tildes y ñ
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/git/ref/heads/sede/palestina')) {
        return new Response(JSON.stringify({ object: { sha: 'abc' } }), { status: 200 });
      }
      if (urlStr.includes('/contents/local_songs.json') && (!init?.method || init.method === 'GET')) {
        return new Response('Not Found', { status: 404 });
      }
      if (urlStr.includes('/contents/local_songs.json') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 201 });
      }
      return new Response('Unexpected', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const songPayload: BaseSong = {
      id: 'canto-mañana',
      title: 'Canto de la Mañana',
      originalKey: 'G',
      sections: [{ id: 'v1', type: 'verse', label: 'Verso 1', lines: ['Señor tú eres fiel'] }],
      updatedAt: '2026-11-13T10:00:00.000Z'
    };

    const okRes = await commitPost({
      request: new Request('https://app.pages.dev/api/commit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sedeToken}` },
        body: JSON.stringify({
          action: 'upsert_song',
          targetSedeId: 'sede-palestina',
          song: songPayload
        })
      }),
      env: testEnv
    });

    expect(okRes.status).toBe(200);
    const putCall = fetchMock.mock.calls.find(c => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const putBody = JSON.parse(String(putCall?.[1]?.body)) as { branch: string; content: string };
    expect(putBody.branch).toBe('sede/palestina');
    const decodedBytes = Uint8Array.from(atob(putBody.content), c => c.charCodeAt(0));
    const savedArray = JSON.parse(new TextDecoder().decode(decodedBytes)) as BaseSong[];
    expect(savedArray[0].title).toBe('Canto de la Mañana');
    expect(savedArray[0].sedeId).toBe('sede-palestina');
    expect(savedArray[0].syncSource).toBe('remote');
  });

  it('POST /api/suggest-correction valida datos y crea un Issue en GitHub', async () => {
    const badRes = await suggestPost({
      request: new Request('https://app.pages.dev/api/suggest-correction', {
        method: 'POST',
        body: JSON.stringify({ songId: 'sublime-gracia', songTitle: 'Sublime Gracia', suggestedFix: '' })
      }),
      env: testEnv
    });
    expect(badRes.status).toBe(400);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/javtr/app_ipuc_lyrics/issues/42' }), {
        status: 201
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const okRes = await suggestPost({
      request: new Request('https://app.pages.dev/api/suggest-correction', {
        method: 'POST',
        body: JSON.stringify({
          songId: 'sublime-gracia',
          songTitle: 'Sublime Gracia',
          sectionLabel: 'Coro',
          suggestedFix: 'Revisar acorde final en [G]',
          reportedBy: 'Sede Palestina'
        })
      }),
      env: testEnv
    });
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as { issueNumber: number };
    expect(okJson.issueNumber).toBe(42);
  });

  it('POST /api/create-sede exige rol master, crea rama e inicializa archivos base', async () => {
    const sedeToken = await signJwt(
      { role: 'sede', sedeId: 'sede-palestina', branch: 'sede/palestina', iat: Date.now(), exp: Date.now() + 60_000 },
      testEnv.JWT_SECRET
    );

    const forbidden = await createSedePost({
      request: new Request('https://app.pages.dev/api/create-sede', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sedeToken}` },
        body: JSON.stringify({ name: 'Chinchiná' })
      }),
      env: testEnv
    });
    expect(forbidden.status).toBe(403);

    const masterToken = await signJwt(
      { role: 'master', sedeId: 'general', branch: 'catalog', iat: Date.now(), exp: Date.now() + 60_000 },
      testEnv.JWT_SECRET
    );

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/git/ref/heads/sede/chinchina')) {
        return new Response('Not Found', { status: 404 });
      }
      if (urlStr.includes('/git/ref/heads/catalog')) {
        return new Response(JSON.stringify({ object: { sha: 'base-sha-123' } }), { status: 200 });
      }
      if (urlStr.endsWith('/git/refs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ ref: 'refs/heads/sede/chinchina' }), { status: 201 });
      }
      if (urlStr.includes('/contents/sedes.json') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            sha: 'sedes-sha',
            content: utf8ToBase64(JSON.stringify([{ id: 'general', name: 'Catálogo General (Nacional)' }]))
          }),
          { status: 200 }
        );
      }
      if ((!init?.method || init.method === 'GET') && urlStr.includes('/contents/')) {
        return new Response('Not Found', { status: 404 });
      }
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'written' } }), { status: 201 });
      }
      return new Response('Unexpected', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await createSedePost({
      request: new Request('https://app.pages.dev/api/create-sede', {
        method: 'POST',
        headers: { Authorization: `Bearer ${masterToken}` },
        body: JSON.stringify({ name: 'Chinchiná' })
      }),
      env: testEnv
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sede: { id: string }; branch: string };
    expect(body.sede.id).toBe('sede-chinchina');
    expect(body.branch).toBe('sede/chinchina');
  });

  it('publishOrQueueChange encola offline y flushPendingSyncQueue publica al recuperar red', async () => {
    const song: BaseSong = {
      id: 'cancion-local-palestina',
      title: 'Canción Local Palestina',
      originalKey: 'G',
      sedeId: 'sede-palestina',
      sections: [{ id: 'v1', type: 'verse', label: 'Verso 1', lines: ['Hola'] }],
      updatedAt: '2026-11-13T12:00:00.000Z',
      syncSource: 'local'
    };

    const queueMap = new Map<string, unknown>();
    vi.spyOn(db.pendingSync, 'put').mockImplementation(op => {
      queueMap.set(op.id, op);
      return Dexie.Promise.resolve(op.id);
    });
    vi.spyOn(db.pendingSync, 'toArray').mockImplementation(() =>
      Dexie.Promise.resolve(Array.from(queueMap.values()) as never)
    );
    vi.spyOn(db.pendingSync, 'delete').mockImplementation(id => {
      queueMap.delete(id);
      return Dexie.Promise.resolve();
    });
    vi.spyOn(db.songs, 'get').mockResolvedValue(song);
    const putSongSpy = vi.spyOn(db.songs, 'put').mockResolvedValue(song.id);

    // Offline => encola en pendingSync
    vi.stubGlobal('navigator', { onLine: false });
    const queuedRes = await publishOrQueueChange({
      action: 'upsert_song',
      targetSedeId: 'sede-palestina',
      song
    });
    expect(queuedRes.status).toBe('queued');
    expect(queueMap.size).toBe(1);

    // Al volver en línea con sesión válida => sube pendiente y marca 'remote'
    vi.stubGlobal('navigator', { onLine: true });
    saveStoredSession({
      token: 'jwt-valid',
      role: 'sede',
      sedeId: 'sede-palestina',
      expiresAt: Date.now() + 60_000
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, updatedAt: '2026-11-13T12:05:00.000Z' }), { status: 200 })
      )
    );

    const flushRes = await flushPendingSyncQueue();
    expect(flushRes.synced).toBe(1);
    expect(queueMap.size).toBe(0);
    expect(putSongSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cancion-local-palestina',
        syncSource: 'remote',
        updatedAt: '2026-11-13T12:05:00.000Z'
      })
    );
  });

  it('syncSedeFromGitHub descarga overrides.json + local_songs.json y poda eliminaciones remotas', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    const remoteLocalSong: BaseSong = {
      id: 'himno-palestina',
      title: 'Himno Palestina',
      originalKey: 'C',
      sedeId: 'sede-palestina',
      sections: [{ id: 'v1', type: 'verse', label: 'Verso 1', lines: ['Aleluya'] }],
      updatedAt: '2026-11-13T14:00:00.000Z'
    };
    const deletedRemoteSong: BaseSong = {
      ...remoteLocalSong,
      id: 'borrada-en-pc',
      syncSource: 'remote'
    };
    const localPendingOverride: SedeSongOverride = {
      id: 'sublime_sede-palestina',
      baseSongId: 'sublime',
      sedeId: 'sede-palestina',
      updatedAt: '2026-11-13T14:00:00.000Z',
      syncSource: 'local'
    };

    vi.spyOn(db.overrides, 'toArray').mockResolvedValue([localPendingOverride]);
    vi.spyOn(db.overrides, 'bulkPut').mockResolvedValue('ok' as never);
    const bulkDeleteOverrides = vi.spyOn(db.overrides, 'bulkDelete').mockResolvedValue();

    vi.spyOn(db.songs, 'toArray').mockResolvedValue([deletedRemoteSong]);
    const bulkPutSongs = vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);
    const bulkDeleteSongs = vi.spyOn(db.songs, 'bulkDelete').mockResolvedValue();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes('overrides.json')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (u.includes('local_songs.json')) {
          return new Response(JSON.stringify([remoteLocalSong]), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      })
    );

    const result = await syncSedeFromGitHub('sede-palestina', { force: true });
    expect(result.status).toBe('synced');
    expect(bulkPutSongs).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'himno-palestina', syncSource: 'remote', sedeId: 'sede-palestina' })
    ]);
    expect(bulkDeleteSongs).toHaveBeenCalledWith(['borrada-en-pc']);
    // No borra registros con syncSource === 'local'
    expect(bulkDeleteOverrides).not.toHaveBeenCalled();
  });

  it('submitCorrectionSuggestion marca syncedToCloud cuando responde /api/suggest-correction', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const putSuggSpy = vi.spyOn(db.suggestions, 'put').mockResolvedValue('sugg_1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, issueNumber: 7 }), { status: 200 }))
    );

    const outcome = await submitCorrectionSuggestion({
      id: 'sugg_1',
      songId: 'sublime-gracia',
      songTitle: 'Sublime Gracia',
      sectionLabel: 'Coro',
      suggestedFix: 'Corregir letra',
      reportedBy: 'Tester',
      createdAt: '2026-11-13T14:00:00.000Z'
    });

    expect(outcome.synced).toBe(true);
    expect(outcome.issueNumber).toBe(7);
    expect(putSuggSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sugg_1', syncedToCloud: true, issueNumber: 7 })
    );
  });

  it('GET /api/sync valida lista blanca, retorna 404 con marcador y lee JSON crudo con Accept raw+json', async () => {
    // 1. Archivo o rama no permitida => 400
    const badFileRes = await syncGet({
      request: new Request('https://example.com/api/sync?branch=catalog&file=package.json'),
      env: testEnv
    });
    expect(badFileRes.status).toBe(400);

    const badBranchRes = await syncGet({
      request: new Request('https://example.com/api/sync?branch=master&file=catalog.json'),
      env: testEnv
    });
    expect(badBranchRes.status).toBe(400);

    // 2. Archivo opcional faltante en GitHub => 404 con { notFound: true }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const missingRes = await syncGet({
      request: new Request('https://example.com/api/sync?branch=sede/palestina&file=overrides.json'),
      env: testEnv
    });
    expect(missingRes.status).toBe(404);
    expect(await missingRes.json()).toMatchObject({ notFound: true, status: 404 });

    // 3. Lectura válida con fresh=1 => devuelve raw JSON con Cache-Control: no-store
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 's1', title: 'Canto', originalKey: 'G', sections: [], updatedAt: '2026-11-13T17:00:00.000Z' }]), {
        status: 200
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const okRes = await syncGet({
      request: new Request('https://example.com/api/sync?branch=catalog&file=catalog.json&fresh=1'),
      env: testEnv
    });
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get('Cache-Control')).toBe('no-store');
    const body = (await okRes.json()) as Array<{ id: string }>;
    expect(body[0].id).toBe('s1');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/contents/catalog.json?ref=catalog'),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github.raw+json' })
      })
    );
  });

  it('fetchJsonFromGit hace fallback a raw.githubusercontent.com cuando /api/sync devuelve HTML o error 502', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(db.songs, 'toArray').mockResolvedValue([]);
    const bulkPutSpy = vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);

    const remoteSong: BaseSong = {
      id: 'canto-fallback',
      title: 'Canto Fallback',
      originalKey: 'D',
      sections: [{ id: 'v1', type: 'verse', label: 'Verso 1', lines: ['Santo'] }],
      updatedAt: '2026-11-13T17:30:00.000Z'
    };

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('/api/sync')) {
        if (url.includes('sedes.json')) {
          return new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        }
        return new Response(JSON.stringify({ error: 'Upstream fail' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('raw.githubusercontent.com') && url.includes('catalog.json')) {
        return new Response(JSON.stringify([remoteSong]), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await syncGeneralCatalog({ force: true });
    expect(res.status).toBe('synced');
    expect(res.updatedSongs).toBe(1);
    expect(bulkPutSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'canto-fallback', syncSource: 'remote' })
    ]);
  });
});
