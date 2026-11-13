import { getRawJsonText, resolveRepoConfig } from '../_lib/github';
import { errorResponse } from '../_lib/response';
import { PagesContext } from '../_lib/types';

const ALLOWED_FILES = new Set([
  'catalog.json',
  'sedes.json',
  'overrides.json',
  'local_songs.json'
]);

const EDGE_CACHE_TTL_SECONDS = 5;

function isAllowedBranch(branch: string, catalogBranch: string): boolean {
  return branch === catalogBranch || /^sede\/[a-z0-9-]+$/.test(branch);
}

/**
 * Proxy de lectura rápida contra GitHub API con caché edge corto (5s) para mantener latencia de 1-3s a costo $0.
 */
export const onRequestGet = async ({ request, env, waitUntil }: PagesContext): Promise<Response> => {
  const url = new URL(request.url);
  const branch = (url.searchParams.get('branch') || '').trim();
  const file = (url.searchParams.get('file') || '').trim();
  const fresh = url.searchParams.get('fresh') === '1';

  const { catalogBranch } = resolveRepoConfig(env);
  if (!ALLOWED_FILES.has(file) || !isAllowedBranch(branch, catalogBranch)) {
    return errorResponse('Rama o archivo no permitido', 400);
  }

  const edgeCache =
    typeof caches !== 'undefined' && 'default' in caches
      ? (caches as unknown as { default: Cache }).default
      : null;
  const cacheKey = `https://sync-cache.internal/${encodeURIComponent(branch)}/${encodeURIComponent(file)}`;

  if (!fresh && edgeCache) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const result = await getRawJsonText(env, branch, file);
    const statusCode = result.status === 404 ? 404 : 200;
    const bodyText =
      result.status === 404 ? JSON.stringify({ notFound: true, status: 404 }) : result.rawText;

    const response = new Response(bodyText, {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': fresh ? 'no-store' : `public, max-age=${EDGE_CACHE_TTL_SECONDS}`
      }
    });

    if (edgeCache) {
      const cacheCopy = new Response(bodyText, {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${EDGE_CACHE_TTL_SECONDS}`
        }
      });
      const putPromise = edgeCache.put(cacheKey, cacheCopy).catch(() => {});
      if (waitUntil) {
        waitUntil(putPromise);
      } else {
        await putPromise;
      }
    }

    return response;
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Error en sincronización rápida',
      502
    );
  }
};
