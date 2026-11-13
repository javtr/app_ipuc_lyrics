export type SongSectionType = 'verse' | 'chorus' | 'bridge' | 'tag' | 'intro' | 'outro';

export interface SongSection {
  id: string;
  type: SongSectionType;
  label: string;
  lines: string[];
}

export type SyncSource = 'seed' | 'remote' | 'local';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncResult {
  status: SyncStatus;
  updatedSongs: number;
  updatedOverrides: number;
  sedes?: SedeProfile[];
  errorMessage?: string;
}

export interface BaseSong {
  id: string;
  title: string;
  artist?: string;
  originalKey: string;
  bpm?: number;
  timeSignature?: string;
  sections: SongSection[];
  tags?: string[];
  sedeId?: string;
  notes?: string;
  updatedAt: string;
  syncSource?: SyncSource;
}

export interface SedeSongOverride {
  id: string; // formato: `${songId}_${sedeId}`
  baseSongId: string;
  sedeId: string;
  customTitle?: string;
  customKey?: string;
  customSections?: SongSection[];
  localNotes?: string;
  updatedAt: string;
  syncSource?: SyncSource;
}

export interface DisplaySong {
  id: string;
  title: string;
  artist?: string;
  key: string;
  bpm?: number;
  timeSignature?: string;
  sections: SongSection[];
  notes?: string;
  isLocalOverride: boolean;
  sedeId?: string;
  originalSong?: BaseSong;
  fallbackNotice?: string;
}

export interface SetlistItem {
  songId: string;
  key: string;
  order: number;
  notes?: string;
}

export interface Setlist {
  id: string;
  name: string;
  date: string;
  sedeId: string;
  items: SetlistItem[];
  createdAt: string;
}

export interface SedeProfile {
  id: string;
  name: string;
  shortName?: string;
  isDefault?: boolean;
}

export interface CorrectionSuggestion {
  id: string;
  songId: string;
  songTitle: string;
  sectionLabel: string;
  suggestedFix: string;
  reportedBy: string;
  createdAt: string;
  syncedToCloud?: boolean;
  issueNumber?: number;
}

export type AdminRole = 'master' | 'sede';

export interface AdminSession {
  token: string;
  role: AdminRole;
  sedeId: string;
  expiresAt: number;
}

export type PendingSyncAction =
  | 'upsert_song'
  | 'delete_song'
  | 'upsert_override'
  | 'delete_override';

export interface PendingSyncOperation {
  id: string;
  action: PendingSyncAction;
  targetSedeId: string;
  song?: BaseSong;
  songId?: string;
  override?: SedeSongOverride;
  createdAt: string;
}
