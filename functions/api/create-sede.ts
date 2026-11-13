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
import { PagesContext, SedeProfilePayload } from '../_lib/types';

interface CreateSedeBody {
  id?: string;
  name?: string;
  shortName?: string;
}

function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  if (authResult.role !== 'master') {
    return errorResponse('Solo el Administrador General puede crear nuevas sedes en la nube', 403);
  }

  let body: CreateSedeBody;
  try {
    body = (await request.json()) as CreateSedeBody;
  } catch {
    return errorResponse('Cuerpo JSON inválido', 400);
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!rawName) {
    return errorResponse('El nombre de la sede es obligatorio', 400);
  }

  const baseSlug = normalizeSlug(body.id || rawName);
  if (!baseSlug) {
    return errorResponse('No se pudo generar un identificador válido para la sede', 400);
  }

  const sedeId = baseSlug.startsWith('sede-') ? baseSlug : `sede-${baseSlug}`;
  const displayName = /^sede\b/i.test(rawName) ? rawName : `Sede ${rawName}`;
  const shortName = typeof body.shortName === 'string' && body.shortName.trim()
    ? body.shortName.trim()
    : rawName;

  const newProfile: SedeProfilePayload = {
    id: sedeId,
    name: displayName,
    shortName
  };

  const { catalogBranch } = resolveRepoConfig(env);
  const sedeBranch = toSedeBranch(sedeId, catalogBranch);

  try {
    await ensureSedeBranch(env, sedeBranch);

    const overridesExists = await getJsonFile(env, sedeBranch, 'overrides.json');
    if (!overridesExists) {
      await putJsonFile(env, sedeBranch, 'overrides.json', [], undefined, `chore(${sedeId}): init overrides`);
    }

    const localSongsExists = await getJsonFile(env, sedeBranch, 'local_songs.json');
    if (!localSongsExists) {
      await putJsonFile(env, sedeBranch, 'local_songs.json', [], undefined, `chore(${sedeId}): init local_songs`);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const sedesFile = await getJsonFile<SedeProfilePayload[]>(env, catalogBranch, 'sedes.json');
      const currentList = Array.isArray(sedesFile?.data) ? sedesFile.data : [];
      const idx = currentList.findIndex(s => s.id === sedeId);
      const nextList =
        idx === -1
          ? [...currentList, newProfile]
          : currentList.map((item, i) => (i === idx ? newProfile : item));

      try {
        await putJsonFile(
          env,
          catalogBranch,
          'sedes.json',
          nextList,
          sedesFile?.sha,
          `feat(sedes): register ${sedeId}`
        );
        return jsonResponse({ ok: true, sede: newProfile, branch: sedeBranch });
      } catch (err) {
        if (err instanceof GitHubConflictError && attempt === 0) {
          continue;
        }
        throw err;
      }
    }

    return errorResponse('Conflicto al registrar sede en sedes.json', 409);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear la sede en la nube';
    return errorResponse(message, 502);
  }
};
