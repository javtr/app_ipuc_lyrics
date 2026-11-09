export type SongSectionType = 'verse' | 'chorus' | 'bridge' | 'tag' | 'intro' | 'outro';

export interface SongSection {
  id: string;
  type: SongSectionType;
  label: string;
  lines: string[];
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
  updatedAt: string;
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
}
