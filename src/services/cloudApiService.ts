import { db } from '../db';
import {
  AdminSession,
  BaseSong,
  CorrectionSuggestion,
  PendingSyncAction,
  PendingSyncOperation,
  SedeProfile,
  SedeSongOverride
} from '../types';

const ADMIN_SESSION_STORAGE_KEY = 'app_lyrics_admin_session';

export class UnauthorizedApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedApiError';
  }
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function getStoredSession(): AdminSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (
      typeof parsed.token !== 'string' ||
      (parsed.role !== 'master' && parsed.role !== 'sede') ||
      typeof parsed.sedeId !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed as AdminSession;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: AdminSession): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignorar en entornos sin cuota de almacenamiento
  }
}

export function clearStoredSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // Ignorar error de almacenamiento
  }
}

export function canSessionEditSede(session: AdminSession | null, targetSedeId: string): boolean {
  if (!session || Date.now() >= session.expiresAt) return false;
  if (session.role === 'master') return true;
  return targetSedeId !== 'general' && session.sedeId === targetSedeId;
}

export async function loginAdmin(sedeId: string, password: string): Promise<AdminSession> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sedeId, password })
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    token?: string;
    role?: 'master' | 'sede';
    sedeId?: string;
    expiresAt?: number;
  };

  if (!res.ok || !data.token || !data.role || !data.sedeId || !data.expiresAt) {
    throw new Error(data.error || `Error de autenticación (HTTP ${res.status})`);
  }

  const session: AdminSession = {
    token: data.token,
    role: data.role,
    sedeId: data.sedeId,
    expiresAt: data.expiresAt
  };
  saveStoredSession(session);
  return session;
}

function buildPendingOperationId(
  action: PendingSyncAction,
  targetSedeId: string,
  entityId: string
): string {
  const group =
    action === 'upsert_override' || action === 'delete_override' ? 'override' : 'song';
  return `${group}:${targetSedeId}:${entityId}`;
}

async function sendCommitRequest(
  op: Omit<PendingSyncOperation, 'id' | 'createdAt'>,
  token: string
): Promise<{ updatedAt: string }> {
  const res = await fetch('/api/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(op)
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    updatedAt?: string;
    error?: string;
  };

  if (res.status === 401) {
    throw new UnauthorizedApiError(data.error || 'Sesión expirada');
  }

  if (!res.ok) {
    throw new Error(data.error || `No se pudo publicar en la nube (HTTP ${res.status})`);
  }

  return { updatedAt: data.updatedAt || new Date().toISOString() };
}

async function markLocalRecordAsSynced(
  op: Pick<PendingSyncOperation, 'action' | 'targetSedeId' | 'song' | 'override'>,
  serverUpdatedAt: string
): Promise<void> {
  if (op.action === 'upsert_song' && op.song) {
    const existing = await db.songs.get(op.song.id);
    if (existing) {
      await db.songs.put({
        ...existing,
        updatedAt: serverUpdatedAt,
        syncSource: 'remote'
      });
    }
  } else if (op.action === 'upsert_override' && op.override) {
    const existing = await db.overrides.get(op.override.id);
    if (existing) {
      await db.overrides.put({
        ...existing,
        updatedAt: serverUpdatedAt,
        syncSource: 'remote'
      });
    }
  }
}

export interface PublishChangeInput {
  action: PendingSyncAction;
  targetSedeId: string;
  song?: BaseSong;
  songId?: string;
  override?: SedeSongOverride;
}

export async function publishOrQueueChange(
  input: PublishChangeInput
): Promise<{ status: 'synced' | 'queued'; authExpired?: boolean; message?: string }> {
  const entityId =
    input.song?.id || input.songId || input.override?.baseSongId || `op_${Date.now()}`;
  const op: PendingSyncOperation = {
    id: buildPendingOperationId(input.action, input.targetSedeId, entityId),
    action: input.action,
    targetSedeId: input.targetSedeId,
    song: input.song,
    songId: input.songId,
    override: input.override,
    createdAt: new Date().toISOString()
  };

  const session = getStoredSession();
  if (!canSessionEditSede(session, input.targetSedeId) || !isOnline() || !session) {
    await db.pendingSync.put(op);
    return { status: 'queued' };
  }

  try {
    const result = await sendCommitRequest(
      {
        action: op.action,
        targetSedeId: op.targetSedeId,
        song: op.song,
        songId: op.songId,
        override: op.override
      },
      session.token
    );
    await markLocalRecordAsSynced(op, result.updatedAt);
    await db.pendingSync.delete(op.id);
    return { status: 'synced' };
  } catch (err) {
    await db.pendingSync.put(op);
    if (err instanceof UnauthorizedApiError) {
      clearStoredSession();
      return { status: 'queued', authExpired: true, message: err.message };
    }
    return {
      status: 'queued',
      message: err instanceof Error ? err.message : 'Guardado en cola local'
    };
  }
}

export async function flushPendingSyncQueue(): Promise<{
  synced: number;
  failed: number;
  authExpired: boolean;
}> {
  if (!isOnline()) {
    return { synced: 0, failed: 0, authExpired: false };
  }

  const session = getStoredSession();
  if (!session) {
    return { synced: 0, failed: 0, authExpired: false };
  }

  const pendingItems = (await db.pendingSync.toArray()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  let synced = 0;
  let failed = 0;
  let authExpired = false;

  for (const op of pendingItems) {
    if (!canSessionEditSede(session, op.targetSedeId)) {
      continue;
    }

    try {
      const res = await sendCommitRequest(
        {
          action: op.action,
          targetSedeId: op.targetSedeId,
          song: op.song,
          songId: op.songId,
          override: op.override
        },
        session.token
      );
      await markLocalRecordAsSynced(op, res.updatedAt);
      await db.pendingSync.delete(op.id);
      synced += 1;
    } catch (err) {
      failed += 1;
      if (err instanceof UnauthorizedApiError) {
        clearStoredSession();
        authExpired = true;
        break;
      }
    }
  }

  return { synced, failed, authExpired };
}

async function postCorrectionToServer(
  suggestion: CorrectionSuggestion
): Promise<{ issueNumber: number; issueUrl: string }> {
  const res = await fetch('/api/suggest-correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(suggestion)
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    issueNumber?: number;
    issueUrl?: string;
    error?: string;
  };

  if (!res.ok || !data.issueNumber) {
    throw new Error(data.error || `Error al enviar reporte (HTTP ${res.status})`);
  }

  return {
    issueNumber: data.issueNumber,
    issueUrl: data.issueUrl || ''
  };
}

export async function submitCorrectionSuggestion(
  suggestion: CorrectionSuggestion
): Promise<{ synced: boolean; issueNumber?: number; issueUrl?: string }> {
  if (!isOnline()) {
    await db.suggestions.put({ ...suggestion, syncedToCloud: false });
    return { synced: false };
  }

  try {
    const result = await postCorrectionToServer(suggestion);
    await db.suggestions.put({
      ...suggestion,
      syncedToCloud: true,
      issueNumber: result.issueNumber
    });
    return { synced: true, issueNumber: result.issueNumber, issueUrl: result.issueUrl };
  } catch {
    await db.suggestions.put({ ...suggestion, syncedToCloud: false });
    return { synced: false };
  }
}

export async function flushPendingCorrections(): Promise<number> {
  if (!isOnline()) return 0;

  const all = await db.suggestions.toArray();
  const pending = all.filter(item => !item.syncedToCloud);
  let sentCount = 0;

  for (const item of pending) {
    try {
      const result = await postCorrectionToServer(item);
      await db.suggestions.put({
        ...item,
        syncedToCloud: true,
        issueNumber: result.issueNumber
      });
      sentCount += 1;
    } catch {
      // Mantener en cola para el siguiente reintento en línea
    }
  }

  return sentCount;
}

export async function createRemoteSede(
  profile: SedeProfile
): Promise<{ sede: SedeProfile; branch: string }> {
  const session = getStoredSession();
  if (!session || session.role !== 'master') {
    throw new Error('Se requiere sesión de Administrador General para crear sedes en la nube.');
  }

  const res = await fetch('/api/create-sede', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify(profile)
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sede?: SedeProfile;
    branch?: string;
    error?: string;
  };

  if (res.status === 401) {
    clearStoredSession();
    throw new UnauthorizedApiError(data.error || 'Sesión expirada');
  }

  if (!res.ok || !data.sede || !data.branch) {
    throw new Error(data.error || `Error al crear sede en la nube (HTTP ${res.status})`);
  }

  return { sede: data.sede, branch: data.branch };
}
