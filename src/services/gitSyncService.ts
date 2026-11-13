import { db } from '../db';
import { GIT_CONFIG, getRawFileUrl, getSedeBranch } from '../config/gitConfig';
import { normalizeSearchText } from './songEditorHelper';
import {
  BaseSong,
  SedeProfile,
  SedeSongOverride,
  SyncResult,
  SyncSource
} from '../types';

const STORAGE_KEYS = {
  lastSync: 'app_lyrics_last_sync',
  syncedSedes: 'app_lyrics_synced_sedes',
  sedesCache: 'app_lyrics_sedes_cache',
  customSedes: 'app_lyrics_custom_sedes'
} as const;

interface SyncableTable<T extends { id: string; updatedAt: string; syncSource?: SyncSource }> {
  toArray(): Promise<T[]>;
  bulkPut(items: T[]): Promise<unknown>;
  bulkDelete?(keys: string[]): Promise<unknown>;
}

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignorar errores de cuota en navegadores restringidos
  }
}

function isOnlineEnvironment(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function isValidBaseSong(item: unknown): item is BaseSong {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<BaseSong>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.title === 'string' &&
    candidate.title.trim().length > 0 &&
    Array.isArray(candidate.sections) &&
    candidate.sections.every(sec => sec && typeof sec === 'object' && Array.isArray(sec.lines))
  );
}

function isValidOverride(item: unknown): item is SedeSongOverride {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<SedeSongOverride>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.baseSongId === 'string' &&
    typeof candidate.sedeId === 'string'
  );
}

function isValidSedeProfile(item: unknown): item is SedeProfile {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<SedeProfile>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0
  );
}

function shouldApplyRemoteUpdate<T extends { updatedAt: string; syncSource?: SyncSource }>(
  local: T | undefined,
  remote: T
): boolean {
  if (!local) return true;
  if (local.syncSource === 'seed') return true;

  const localTime = Date.parse(local.updatedAt || '');
  const remoteTime = Date.parse(remote.updatedAt || '');

  if (Number.isNaN(localTime) || Number.isNaN(remoteTime)) {
    return local.syncSource !== 'local';
  }

  if (local.syncSource === 'local' && localTime > remoteTime) {
    return false;
  }

  return remoteTime >= localTime;
}

async function mergeRemoteRecords<T extends { id: string; updatedAt: string; syncSource?: SyncSource }>(
  table: SyncableTable<T>,
  remoteItems: T[],
  pruningScopeFilter?: (localItem: T) => boolean
): Promise<number> {
  const existingRecords = await table.toArray();
  const existingMap = new Map(existingRecords.map(record => [record.id, record]));
  const remoteIdSet = new Set(remoteItems.map(item => item.id));

  const recordsToUpsert: T[] = [];
  for (const item of remoteItems) {
    const localRecord = existingMap.get(item.id);
    if (shouldApplyRemoteUpdate(localRecord, item)) {
      recordsToUpsert.push({ ...item, syncSource: 'remote' });
    }
  }

  if (recordsToUpsert.length > 0) {
    await table.bulkPut(recordsToUpsert);
  }

  let deletedCount = 0;
  if (pruningScopeFilter && typeof table.bulkDelete === 'function') {
    const idsToDelete = existingRecords
      .filter(
        local =>
          pruningScopeFilter(local) &&
          local.syncSource === 'remote' &&
          !remoteIdSet.has(local.id)
      )
      .map(local => local.id);

    if (idsToDelete.length > 0) {
      await table.bulkDelete(idsToDelete);
      deletedCount = idsToDelete.length;
    }
  }

  return recordsToUpsert.length + deletedCount;
}

async function fetchJsonFromGit<T>(
  branch: string,
  filePath: string,
  forceRefresh: boolean
): Promise<{ status: number; data?: T }> {
  const proxyParams = new URLSearchParams({ branch, file: filePath });
  if (forceRefresh) {
    proxyParams.set('fresh', '1');
  }
  const proxyUrl = `/api/sync?${proxyParams.toString()}`;

  try {
    const proxyRes = await fetch(
      proxyUrl,
      forceRefresh ? { cache: 'no-store' } : undefined
    );
    const contentType = proxyRes.headers.get('content-type') || '';

    if (proxyRes.status === 404 && contentType.includes('application/json')) {
      const payload = (await proxyRes.json()) as { notFound?: boolean };
      if (payload?.notFound === true) {
        return { status: 404 };
      }
    }

    if (proxyRes.ok && !contentType.includes('text/html')) {
      const data = (await proxyRes.json()) as T;
      return { status: proxyRes.status, data };
    }
  } catch {
    // Fallback silencioso a GitHub Raw ante entorno dev local o contingencia del proxy
  }

  const cacheBust = forceRefresh ? Date.now() : undefined;
  const url = getRawFileUrl(branch, filePath, cacheBust);
  const response = await fetch(
    url,
    forceRefresh ? { cache: 'no-store' } : undefined
  );

  if (response.status === 404) {
    return { status: 404 };
  }

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al leer ${filePath} en ${branch}`);
  }

  const data = (await response.json()) as T;
  return { status: response.status, data };
}

function mergeSedesLists(primary: SedeProfile[], custom: SedeProfile[]): SedeProfile[] {
  const merged = [...primary];
  for (const extra of custom) {
    if (!merged.some(item => item.id === extra.id)) {
      merged.push(extra);
    }
  }
  return merged;
}

/**
 * Normaliza el nombre de una congregación a un identificador URL-safe sin tildes ni guiones extremos.
 */
export function normalizeSedeSlug(rawName: string): string {
  const normalized = normalizeSearchText(rawName)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `local-${Date.now()}`;
}

/**
 * Retorna las sedes creadas localmente por el usuario en este dispositivo.
 */
export function getCustomSedes(): SedeProfile[] {
  const raw = readStorage(STORAGE_KEYS.customSedes);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidSedeProfile) : [];
  } catch {
    return [];
  }
}

/**
 * Persiste localmente una nueva sede creada en este dispositivo para que sobreviva recargas y sincronizaciones.
 */
export function saveCustomSede(profile: SedeProfile): SedeProfile[] {
  const current = getCustomSedes();
  const next = mergeSedesLists(current, [profile]);
  writeStorage(STORAGE_KEYS.customSedes, JSON.stringify(next));
  return next;
}

/**
 * Retorna la lista cacheada de sedes descargadas desde GitHub combinada con sedes locales personalizadas.
 */
export function getStoredSedes(fallbackSedes: SedeProfile[]): SedeProfile[] {
  const customSedes = getCustomSedes();
  const raw = readStorage(STORAGE_KEYS.sedesCache);
  if (!raw) return mergeSedesLists(fallbackSedes, customSedes);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isValidSedeProfile);
      if (valid.length > 0) {
        return mergeSedesLists(valid, customSedes);
      }
    }
  } catch {
    // Fallback al listado base si el caché está corrupto
  }

  return mergeSedesLists(fallbackSedes, customSedes);
}

/**
 * Retorna los IDs de sedes cuyas variantes ya han sido descargadas en el dispositivo.
 */
export function getSyncedSedes(): string[] {
  const raw = readStorage(STORAGE_KEYS.syncedSedes);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Marca una sede como sincronizada localmente en el dispositivo.
 */
export function markSedeAsSynced(sedeId: string): void {
  if (!sedeId || sedeId === 'general') return;
  const current = getSyncedSedes();
  if (!current.includes(sedeId)) {
    writeStorage(STORAGE_KEYS.syncedSedes, JSON.stringify([...current, sedeId]));
  }
}

/**
 * Indica si el catálogo o las variantes de una sede ya fueron sincronizadas desde GitHub.
 */
export function isSedeSynced(sedeId?: string): boolean {
  if (!sedeId || sedeId === 'general') return true;
  return getSyncedSedes().includes(sedeId);
}

/**
 * Retorna la fecha ISO de la última sincronización exitosa.
 */
export function getLastSyncAt(): string | null {
  return readStorage(STORAGE_KEYS.lastSync);
}

/**
 * Descarga el catálogo general (`catalog.json`) y la lista de sedes (`sedes.json`)
 * desde la rama de datos oficial en GitHub.
 */
export async function syncGeneralCatalog(options?: { force?: boolean }): Promise<SyncResult> {
  if (!isOnlineEnvironment()) {
    return { status: 'offline', updatedSongs: 0, updatedOverrides: 0 };
  }

  const forceRefresh = Boolean(options?.force);

  try {
    let syncedSedesList: SedeProfile[] | undefined;

    try {
      const sedesRes = await fetchJsonFromGit<unknown[]>(
        GIT_CONFIG.catalogBranch,
        'sedes.json',
        forceRefresh
      );
      if (sedesRes.data && Array.isArray(sedesRes.data)) {
        const validSedes = sedesRes.data.filter(isValidSedeProfile);
        if (validSedes.length > 0) {
          writeStorage(STORAGE_KEYS.sedesCache, JSON.stringify(validSedes));
          syncedSedesList = mergeSedesLists(validSedes, getCustomSedes());
        }
      }
    } catch {
      // `sedes.json` es opcional; si falla no bloquea el catálogo de canciones
    }

    const catalogRes = await fetchJsonFromGit<unknown[]>(
      GIT_CONFIG.catalogBranch,
      'catalog.json',
      forceRefresh
    );

    if (!catalogRes.data || !Array.isArray(catalogRes.data)) {
      throw new Error('El catálogo remoto no tiene formato de arreglo válido.');
    }

    const validSongs = catalogRes.data.filter(isValidBaseSong);
    const updatedSongs = await mergeRemoteRecords(db.songs, validSongs);

    writeStorage(STORAGE_KEYS.lastSync, new Date().toISOString());

    return {
      status: 'synced',
      updatedSongs,
      updatedOverrides: 0,
      sedes: syncedSedesList
    };
  } catch (error) {
    return {
      status: 'error',
      updatedSongs: 0,
      updatedOverrides: 0,
      errorMessage: error instanceof Error ? error.message : 'Error al sincronizar el catálogo.'
    };
  }
}

/**
 * Descarga las variantes (`overrides.json`) y canciones exclusivas (`local_songs.json`)
 * de una sede desde su rama dedicada. Si algún archivo aún no existe (404), resuelve sin error.
 */
export async function syncSedeFromGitHub(
  sedeId: string,
  options?: { force?: boolean }
): Promise<SyncResult> {
  if (!sedeId || sedeId === 'general') {
    return { status: 'synced', updatedSongs: 0, updatedOverrides: 0 };
  }

  if (!isOnlineEnvironment()) {
    return { status: 'offline', updatedSongs: 0, updatedOverrides: 0 };
  }

  const forceRefresh = Boolean(options?.force);
  const branch = getSedeBranch(sedeId);

  try {
    const [overridesRes, localSongsRes] = await Promise.all([
      fetchJsonFromGit<unknown[]>(branch, 'overrides.json', forceRefresh),
      fetchJsonFromGit<unknown[]>(branch, 'local_songs.json', forceRefresh)
    ]);

    let updatedOverrides = 0;
    if (overridesRes.status !== 404) {
      if (!overridesRes.data || !Array.isArray(overridesRes.data)) {
        throw new Error(`El archivo de variantes de ${sedeId} no es válido.`);
      }
      const validOverrides = overridesRes.data.filter(isValidOverride).map(ov => ({
        ...ov,
        sedeId: ov.sedeId || sedeId
      }));
      updatedOverrides = await mergeRemoteRecords(
        db.overrides,
        validOverrides,
        local => local.sedeId === sedeId
      );
    }

    let updatedSongs = 0;
    if (localSongsRes.status !== 404) {
      if (!localSongsRes.data || !Array.isArray(localSongsRes.data)) {
        throw new Error(`El archivo de canciones locales de ${sedeId} no es válido.`);
      }
      const validLocalSongs = localSongsRes.data.filter(isValidBaseSong).map(song => ({
        ...song,
        sedeId: song.sedeId || sedeId
      }));
      updatedSongs = await mergeRemoteRecords(
        db.songs,
        validLocalSongs,
        local => local.sedeId === sedeId
      );
    }

    markSedeAsSynced(sedeId);
    writeStorage(STORAGE_KEYS.lastSync, new Date().toISOString());

    return {
      status: 'synced',
      updatedSongs,
      updatedOverrides
    };
  } catch (error) {
    return {
      status: 'error',
      updatedSongs: 0,
      updatedOverrides: 0,
      errorMessage: error instanceof Error ? error.message : `Error al sincronizar ${sedeId}.`
    };
  }
}

/**
 * Ejecuta la sincronización completa para el perfil activo: catálogo general + variantes y cantos de sede.
 */
export async function syncCatalogAndSede(
  activeSedeId: string,
  options?: { force?: boolean }
): Promise<SyncResult> {
  const generalResult = await syncGeneralCatalog(options);
  if (generalResult.status !== 'synced') {
    return generalResult;
  }

  if (!activeSedeId || activeSedeId === 'general') {
    return generalResult;
  }

  const sedeResult = await syncSedeFromGitHub(activeSedeId, options);
  return {
    status: sedeResult.status === 'error' ? 'error' : 'synced',
    updatedSongs: generalResult.updatedSongs + sedeResult.updatedSongs,
    updatedOverrides: sedeResult.updatedOverrides,
    sedes: generalResult.sedes,
    errorMessage: sedeResult.errorMessage
  };
}
