import { constantTimeEqual, signJwt } from '../_lib/jwt';
import { resolveRepoConfig, toSedeBranch } from '../_lib/github';
import { errorResponse, jsonResponse } from '../_lib/response';
import { JwtClaims, PagesContext } from '../_lib/types';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthBody {
  sedeId?: string;
  password?: string;
}

function parseSedePasswords(rawJson?: string): Record<string, string> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.length > 0) {
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  if (!env.JWT_SECRET) {
    return errorResponse('Servidor sin JWT_SECRET configurado', 500);
  }

  let body: AuthBody;
  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return errorResponse('Cuerpo JSON inválido', 400);
  }

  const sedeId = typeof body.sedeId === 'string' && body.sedeId.trim() ? body.sedeId.trim() : 'general';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password) {
    return errorResponse('Debes ingresar una contraseña', 400);
  }

  const { catalogBranch } = resolveRepoConfig(env);
  const now = Date.now();

  if (env.MASTER_PASSWORD && (await constantTimeEqual(password, env.MASTER_PASSWORD))) {
    const claims: JwtClaims = {
      role: 'master',
      sedeId: 'general',
      branch: catalogBranch,
      iat: now,
      exp: now + SESSION_TTL_MS
    };
    const token = await signJwt(claims, env.JWT_SECRET);
    return jsonResponse({
      ok: true,
      token,
      role: claims.role,
      sedeId: claims.sedeId,
      expiresAt: claims.exp
    });
  }

  if (sedeId === 'general') {
    return errorResponse('Se requiere la clave de Administrador General para el Catálogo General', 403);
  }

  const sedePasswords = parseSedePasswords(env.SEDE_PASSWORDS_JSON);
  const expectedSedePass = sedePasswords[sedeId];
  if (!expectedSedePass) {
    return errorResponse('Esta sede aún no tiene clave configurada en la nube', 403);
  }

  if (!(await constantTimeEqual(password, expectedSedePass))) {
    return errorResponse('Contraseña incorrecta para esta sede', 401);
  }

  const claims: JwtClaims = {
    role: 'sede',
    sedeId,
    branch: toSedeBranch(sedeId, catalogBranch),
    iat: now,
    exp: now + SESSION_TTL_MS
  };
  const token = await signJwt(claims, env.JWT_SECRET);

  return jsonResponse({
    ok: true,
    token,
    role: claims.role,
    sedeId: claims.sedeId,
    expiresAt: claims.exp
  });
};
