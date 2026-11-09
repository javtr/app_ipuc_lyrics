import Dexie, { type Table } from 'dexie';
import { BaseSong, SedeSongOverride, Setlist, CorrectionSuggestion } from '../types';
import { SEED_SONGS, SEED_OVERRIDES } from '../data/seedSongs';

export class LyricsDatabase extends Dexie {
  songs!: Table<BaseSong, string>;
  overrides!: Table<SedeSongOverride, string>;
  setlists!: Table<Setlist, string>;
  suggestions!: Table<CorrectionSuggestion, string>;

  constructor() {
    super('AppLyricsDB');
    this.version(1).stores({
      songs: 'id, title, originalKey, updatedAt',
      overrides: 'id, baseSongId, sedeId, [baseSongId+sedeId]',
      setlists: 'id, name, date, sedeId',
      suggestions: 'id, songId, createdAt'
    });
  }
}

export const db = new LyricsDatabase();

export async function initializeDatabase(): Promise<void> {
  const songCount = await db.songs.count();
  if (songCount === 0) {
    await db.songs.bulkAdd(SEED_SONGS);
  }

  const overrideCount = await db.overrides.count();
  if (overrideCount === 0) {
    await db.overrides.bulkAdd(SEED_OVERRIDES);
  }
}
