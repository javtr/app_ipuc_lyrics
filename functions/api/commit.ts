import {
  GitHubConflictError,
  ensureSedeBranch,
  getJsonFile,
  putJsonFile,
  resolveRepoConfig,
  toSedeBranch
} from '../_lib/github';
import { requireAuth } from '../_lib/jwt';
import { errorResponse, jsonResponse } from '../_lib/response';
import { BaseSongPayload, OverridePayload, PagesContext } from '../_lib/types';

export type CommitAction = 'upsert_song' | 'delete_song' | 'upsert_override' | 'delete_override';

interface CommitBody {
  action?: CommitAction;
  targetSedeId?: string;
  song?: BaseSongPayload;
  songId?: string;
  override?: OverridePayload;
}

const VALID_SEDE_RE = /^(general|sede-[a-z0-9-]+)$/;

function isValidSongPayload(song: unknown): song is BaseSongPayload {
  if (!song || typeof song !== 'object') return false;
  const candidate = song as Partial<BaseSongPayload>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.title === 'string' &&
    candidate.title.trim().length > 0 &&
    Array.isArray(candidate.sections)
  );
}

function isValidOverridePayload(override: unknown): override is OverridePayload {
  if (!override || typeof override !== 'object') return false;
  const candidate = override as Partial<OverridePayload>;
  return (
    typeof candidate.baseSongId === 'string' &&
    candidate.baseSongId.trim().length > 0
  );
}

function resolveTargetFile(action: CommitAction, targetSedeId: string): string {
  if (action === 'upsert_override' || action === 'delete_override') {
    return 'overrides.json';
  }
  return targetSedeId === 'general' ? 'catalog.json' : 'local_songs.json';
}

function applyListMutation<T extends { id: string }>(
  items: T[],
  action: CommitAction,
  record: T | null,
  recordId: string
): T[] {
  if (action === 'delete_song' || action === 'delete_override') {
    return items.filter(item => item.id !== recordId);
  }
  if (!record) return items;
  const idx = items.findIndex(item => item.id === record.id);
  if (idx === -1) {
    return [...items, record];
  }
  const next = [...items];
  next[idx] = record;
  return next;
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return errorResponse('Cuerpo JSON inválido', 400);
  }

  const { action, targetSedeId, song, songId, override } = body;
  if (
    action !== 'upsert_song' &&
    action !== 'delete_song' &&
    action !== 'upsert_override' &&
    action !== 'delete_override'
  ) {
    return errorResponse('Acción de publicación no válida', 400);
  }

  if (!targetSedeId || !VALID_SEDE_RE.test(targetSedeId)) {
    return errorResponse('Identificador de sede destino inválido', 400);
  }

  if (targetSedeId === 'general' && authResult.role !== 'master') {
    return errorResponse('Solo el Administrador General puede modificar el Catálogo General', 403);
  }

  if (targetSedeId !== 'general' && authResult.role !== 'master' && authResult.sedeId !== targetSedeId) {
    return errorResponse('Tu sesión no tiene permisos para modificar esta sede', 403);
  }

  if (targetSedeId === 'general' && (action === 'upsert_override' || action === 'delete_override')) {
    return errorResponse('El Catálogo General no admite overrides de sede', 400);
  }

  const nowIso = new Date().toISOString();
  let recordToSave: (BaseSongPayload | OverridePayload) | null = null;
  let targetRecordId = '';
  let commitMessage = '';

  if (action === 'upsert_song') {
    if (!isValidSongPayload(song)) {
      return errorResponse('Datos de canción incompletos', 400);
    }
    const cleanSong: BaseSongPayload = {
      ...song,
      updatedAt: nowIso,
      syncSource: 'remote'
    };
    if (targetSedeId === 'general') {
      delete cleanSong.sedeId;
    } else {
      cleanSong.sedeId = targetSedeId;
    }
    recordToSave = cleanSong;
    targetRecordId = cleanSong.id;
    commitMessage = `chore(${targetSedeId}): update song ${cleanSong.id}`;
  } else if (action === 'delete_song') {
    if (!songId || !songId.trim()) {
      return errorResponse('songId requerido para eliminar canción', 400);
    }
    targetRecordId = songId.trim();
    commitMessage = `chore(${targetSedeId}): delete song ${targetRecordId}`;
  } else if (action === 'upsert_override') {
    if (!isValidOverridePayload(override)) {
      return errorResponse('Datos de adaptación de sede incompletos', 400);
    }
    const normalizedId = `${override.baseSongId}_${targetSedeId}`;
    const cleanOverride: OverridePayload = {
      ...override,
      id: normalizedId,
      sedeId: targetSedeId,
      updatedAt: nowIso,
      syncSource: 'remote'
    };
    recordToSave = cleanOverride;
    targetRecordId = normalizedId;
    commitMessage = `chore(${targetSedeId}): update override ${override.baseSongId}`;
  } else {
    const baseId = override?.baseSongId || songId;
    if (!baseId || !baseId.trim()) {
      return errorResponse('baseSongId requerido para restaurar versión general', 400);
    }
    targetRecordId = `${baseId.trim()}_${targetSedeId}`;
    commitMessage = `chore(${targetSedeId}): restore general ${baseId.trim()}`;
  }

  const { catalogBranch } = resolveRepoConfig(env);
  const branch = targetSedeId === 'general' ? catalogBranch : toSedeBranch(targetSedeId, catalogBranch);
  const filePath = resolveTargetFile(action, targetSedeId);

  try {
    if (targetSedeId !== 'general') {
      await ensureSedeBranch(env, branch);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await getJsonFile<Array<BaseSongPayload | OverridePayload>>(env, branch, filePath);
      const nextItems = applyListMutation(existing?.data || [], action, recordToSave, targetRecordId);
      try {
        await putJsonFile(env, branch, filePath, nextItems, existing?.sha, commitMessage);
        return jsonResponse({ ok: true, updatedAt: nowIso, branch, filePath });
      } catch (err) {
        if (err instanceof GitHubConflictError && attempt === 0) {
          continue;
        }
        throw err;
      }
    }

    return errorResponse('No se pudo confirmar la publicación tras reintento', 409);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al publicar cambios en GitHub';
    return errorResponse(message, 502);
  }
};
