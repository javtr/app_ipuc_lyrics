import { db } from '../db';
import { BaseSong, SedeSongOverride, Setlist } from '../types';

export interface BackupPayload {
  app: 'AppLyrics';
  version: string;
  exportedAt: string;
  data: {
    songs: BaseSong[];
    overrides: SedeSongOverride[];
    setlists: Setlist[];
  };
}

/**
 * Genera el objeto de respaldo completo con todas las canciones, variantes y repertorios.
 */
export async function generateBackupPayload(): Promise<BackupPayload> {
  const [songs, overrides, setlists] = await Promise.all([
    db.songs.toArray(),
    db.overrides.toArray(),
    db.setlists.toArray()
  ]);

  return {
    app: 'AppLyrics',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    data: {
      songs,
      overrides,
      setlists
    }
  };
}

/**
 * Descarga el archivo de respaldo .json en el navegador del usuario.
 */
export async function downloadBackupFile(): Promise<string> {
  const payload = await generateBackupPayload();
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const now = new Date().toISOString().split('T')[0];
  const filename = `app_lyrics_respaldo_${now}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}

/**
 * Valida e importa un archivo de respaldo en formato JSON a IndexedDB.
 */
export async function importBackupFromJson(jsonString: string): Promise<{
  songsCount: number;
  overridesCount: number;
  setlistsCount: number;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('El archivo seleccionado no contiene un formato JSON válido.');
  }

  const payload = parsed as BackupPayload;

  if (!payload || payload.app !== 'AppLyrics' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('El archivo no es una copia de seguridad válida de App Lyrics.');
  }

  const { songs = [], overrides = [], setlists = [] } = payload.data;

  if (!Array.isArray(songs) || !Array.isArray(overrides) || !Array.isArray(setlists)) {
    throw new Error('El archivo de respaldo contiene listas de datos con formato inválido.');
  }

  const areSongsValid = songs.every(
    s => s && typeof s.id === 'string' && typeof s.title === 'string' && Array.isArray(s.sections)
  );
  const areOverridesValid = overrides.every(
    o => o && typeof o.id === 'string' && typeof o.baseSongId === 'string' && typeof o.sedeId === 'string'
  );
  const areSetlistsValid = setlists.every(
    l => l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.items)
  );

  if (!areSongsValid || !areOverridesValid || !areSetlistsValid) {
    throw new Error('Algunos registros del archivo de respaldo están incompletos o dañados.');
  }

  // Sincronizar en IndexedDB usando bulkPut (upsert)
  if (songs.length > 0) {
    await db.songs.bulkPut(songs);
  }

  if (overrides.length > 0) {
    await db.overrides.bulkPut(overrides);
  }

  if (setlists.length > 0) {
    await db.setlists.bulkPut(setlists);
  }

  return {
    songsCount: songs.length,
    overridesCount: overrides.length,
    setlistsCount: setlists.length
  };
}

/**
 * Solicita almacenamiento persistente al navegador para prevenir evicción de datos en iOS Safari.
 */
export async function checkAndRequestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch (err) {
      console.warn('No se pudo verificar persistencia de almacenamiento:', err);
      return false;
    }
  }
  return false;
}
