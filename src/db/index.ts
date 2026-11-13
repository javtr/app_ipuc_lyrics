import Dexie, { type Table } from 'dexie';
import {
  BaseSong,
  SedeSongOverride,
  Setlist,
  CorrectionSuggestion,
  PendingSyncOperation
} from '../types';
import { SEED_SONGS, SEED_OVERRIDES } from '../data/seedSongs';

export class LyricsDatabase extends Dexie {
  songs!: Table<BaseSong, string>;
  overrides!: Table<SedeSongOverride, string>;
  setlists!: Table<Setlist, string>;
  suggestions!: Table<CorrectionSuggestion, string>;
  pendingSync!: Table<PendingSyncOperation, string>;

  constructor() {
    super('AppLyricsDB');
    this.version(1).stores({
      songs: 'id, title, originalKey, updatedAt',
      overrides: 'id, baseSongId, sedeId, [baseSongId+sedeId]',
      setlists: 'id, name, date, sedeId',
      suggestions: 'id, songId, createdAt'
    });
    this.version(2).stores({
      songs: 'id, title, originalKey, updatedAt',
      overrides: 'id, baseSongId, sedeId, [baseSongId+sedeId]',
      setlists: 'id, name, date, sedeId',
      suggestions: 'id, songId, createdAt',
      pendingSync: 'id, targetSedeId, createdAt'
    });
  }
}

export const db = new LyricsDatabase();

/**
 * Migra canciones locales creadas antes de introducir `BaseSong.sedeId` que quedaron asociadas
 * a una sola sede mediante un override único, evitando que se filtren al catálogo general u otras sedes.
 */
async function migrateLegacySedeSongs(): Promise<void> {
  const allSongs = await db.songs.toArray();
  const allOverrides = await db.overrides.toArray();
  const seedIds = new Set(SEED_SONGS.map(s => s.id));

  for (const song of allSongs) {
    if (song.syncSource !== 'local' || song.sedeId || seedIds.has(song.id)) {
      continue;
    }

    const matchingOverrides = allOverrides.filter(
      o => o.baseSongId === song.id && o.sedeId && o.sedeId !== 'general'
    );
    const uniqueSedes = Array.from(new Set(matchingOverrides.map(o => o.sedeId)));

    if (uniqueSedes.length === 1) {
      const ownerSede = uniqueSedes[0];
      const ov = matchingOverrides[0];
      await db.songs.put({
        ...song,
        originalKey: ov.customKey || song.originalKey,
        sections: ov.customSections && ov.customSections.length > 0 ? ov.customSections : song.sections,
        notes: song.notes || ov.localNotes,
        sedeId: ownerSede
      });
      await db.overrides.delete(ov.id);
    }
  }
}

export async function initializeDatabase(): Promise<void> {
  const songCount = await db.songs.count();
  if (songCount === 0) {
    await db.songs.bulkAdd(SEED_SONGS);
  }

  const overrideCount = await db.overrides.count();
  if (overrideCount === 0) {
    await db.overrides.bulkAdd(SEED_OVERRIDES);
  }

  await migrateLegacySedeSongs();
}
