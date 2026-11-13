export interface Env {
  GITHUB_PAT: string;
  JWT_SECRET: string;
  MASTER_PASSWORD: string;
  SEDE_PASSWORDS_JSON?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  CATALOG_BRANCH?: string;
}

export type AdminRole = 'master' | 'sede';

export interface JwtClaims {
  role: AdminRole;
  sedeId: string;
  branch: string;
  iat: number;
  exp: number;
}

export interface PagesContext {
  request: Request;
  env: Env;
  params?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface BaseSongPayload {
  id: string;
  title: string;
  artist?: string;
  originalKey: string;
  bpm?: number;
  timeSignature?: string;
  sections: Array<{
    id: string;
    type: string;
    label: string;
    lines: string[];
  }>;
  tags?: string[];
  sedeId?: string;
  notes?: string;
  updatedAt: string;
  syncSource?: string;
}

export interface OverridePayload {
  id: string;
  baseSongId: string;
  sedeId: string;
  customTitle?: string;
  customKey?: string;
  customSections?: BaseSongPayload['sections'];
  localNotes?: string;
  updatedAt: string;
  syncSource?: string;
}

export interface SedeProfilePayload {
  id: string;
  name: string;
  shortName?: string;
  isDefault?: boolean;
}
