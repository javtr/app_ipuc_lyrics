import { Env } from './types';

export const AUTH_MAX_ATTEMPTS_PER_SCOPE = 5;
export const AUTH_MAX_ATTEMPTS_PER_IP = 10;
export const AUTH_LOCKOUT_SECONDS = 15 * 60;

interface RateLimitState {
  attempts: number;
  windowExpiresAt: number;
  lockedUntil: number;
}

export interface AuthRateLimitCheck {
  allowed: boolean;
  retryAfterSeconds: number;
  lockedUntil: number;
  remainingAttempts: number;
  scopeKey: string;
  globalKey: string;
}

export interface AuthFailureResult {
  lockedUntil: number;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

const memoryRateLimitStore = new Map<string, RateLimitState>();
const encoder = new TextEncoder();

export function clearRateLimitMemoryStoreForTests(): void {
  memoryRateLimitStore.clear();
}

export function formatLockoutMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos fallidos. Por seguridad espera ${minutes} minuto(s) antes de volver a intentar.`;
}

function getEdgeCache(): Cache | null {
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return (caches as unknown as { default: Cache }).default;
  }
  return null;
}

function buildCacheUrl(key: string): string {
  return `https://rate-limit.internal/auth/${encodeURIComponent(key)}`;
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp && cfIp.trim()) return cfIp.trim();

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return 'unknown-client';
}

async function hashIdentifier(raw: string, salt: string): Promise<string> {
  const bytes = encoder.encode(`${salt}:${raw}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function isValidActiveState(state: RateLimitState | null, now: number): state is RateLimitState {
  if (!state) return false;
  if (state.lockedUntil > now) return true;
  return state.windowExpiresAt > now && state.attempts > 0;
}

async function readBucket(key: string, now: number): Promise<RateLimitState | null> {
  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      const cached = await edgeCache.match(buildCacheUrl(key));
      if (cached) {
        const parsed = (await cached.json()) as RateLimitState;
        return isValidActiveState(parsed, now) ? parsed : null;
      }
      return null;
    } catch {
      // Continuar con respaldo en memoria si el Cache API falla
    }
  }

  const memState = memoryRateLimitStore.get(key) || null;
  if (!isValidActiveState(memState, now)) {
    memoryRateLimitStore.delete(key);
    return null;
  }
  return memState;
}

async function writeBucket(key: string, state: RateLimitState, now: number): Promise<void> {
  const expiresAt = Math.max(state.windowExpiresAt, state.lockedUntil);
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));

  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      await edgeCache.put(
        buildCacheUrl(key),
        new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttlSeconds}`
          }
        })
      );
      return;
    } catch {
      // Fallback en memoria si falla escritura en Cache API
    }
  }

  memoryRateLimitStore.set(key, state);
}

async function clearBucket(key: string): Promise<void> {
  memoryRateLimitStore.delete(key);
  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      await edgeCache.delete(buildCacheUrl(key));
    } catch {
      // Ignorar fallo de limpieza en caché
    }
  }
}

/**
 * Evalúa si el cliente tiene intentos disponibles para autenticar una sede o el catálogo general.
 */
export async function checkAuthRateLimit(
  request: Request,
  env: Env,
  sedeId: string,
  now: number = Date.now()
): Promise<AuthRateLimitCheck> {
  const ipHash = await hashIdentifier(getClientIp(request), env.JWT_SECRET || 'app-lyrics');
  const scopeKey = `scope-${ipHash}-${sedeId}`;
  const globalKey = `global-${ipHash}`;

  const [scopeState, globalState] = await Promise.all([
    readBucket(scopeKey, now),
    readBucket(globalKey, now)
  ]);

  const maxLockedUntil = Math.max(scopeState?.lockedUntil || 0, globalState?.lockedUntil || 0);
  if (maxLockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((maxLockedUntil - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      lockedUntil: maxLockedUntil,
      remainingAttempts: 0,
      scopeKey,
      globalKey
    };
  }

  const remainingScope = AUTH_MAX_ATTEMPTS_PER_SCOPE - (scopeState?.attempts || 0);
  const remainingGlobal = AUTH_MAX_ATTEMPTS_PER_IP - (globalState?.attempts || 0);
  const remainingAttempts = Math.max(0, Math.min(remainingScope, remainingGlobal));

  return {
    allowed: remainingAttempts > 0,
    retryAfterSeconds: 0,
    lockedUntil: 0,
    remainingAttempts,
    scopeKey,
    globalKey
  };
}

/**
 * Registra un intento fallido de contraseña y activa el bloqueo temporal al alcanzar el límite.
 */
export async function recordAuthFailure(
  keys: Pick<AuthRateLimitCheck, 'scopeKey' | 'globalKey'>,
  now: number = Date.now()
): Promise<AuthFailureResult> {
  const lockoutMs = AUTH_LOCKOUT_SECONDS * 1000;
  const [prevScope, prevGlobal] = await Promise.all([
    readBucket(keys.scopeKey, now),
    readBucket(keys.globalKey, now)
  ]);

  const nextScopeAttempts = (prevScope?.attempts || 0) + 1;
  const nextGlobalAttempts = (prevGlobal?.attempts || 0) + 1;

  const scopeLockedUntil =
    nextScopeAttempts >= AUTH_MAX_ATTEMPTS_PER_SCOPE ? now + lockoutMs : 0;
  const globalLockedUntil =
    nextGlobalAttempts >= AUTH_MAX_ATTEMPTS_PER_IP ? now + lockoutMs : 0;

  const nextScopeState: RateLimitState = {
    attempts: nextScopeAttempts,
    windowExpiresAt: prevScope?.windowExpiresAt || now + lockoutMs,
    lockedUntil: Math.max(prevScope?.lockedUntil || 0, scopeLockedUntil)
  };
  const nextGlobalState: RateLimitState = {
    attempts: nextGlobalAttempts,
    windowExpiresAt: prevGlobal?.windowExpiresAt || now + lockoutMs,
    lockedUntil: Math.max(prevGlobal?.lockedUntil || 0, globalLockedUntil)
  };

  await Promise.all([
    writeBucket(keys.scopeKey, nextScopeState, now),
    writeBucket(keys.globalKey, nextGlobalState, now)
  ]);

  const lockedUntil = Math.max(nextScopeState.lockedUntil, nextGlobalState.lockedUntil);
  const retryAfterSeconds =
    lockedUntil > now ? Math.max(1, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const remainingAttempts = Math.max(
    0,
    Math.min(
      AUTH_MAX_ATTEMPTS_PER_SCOPE - nextScopeAttempts,
      AUTH_MAX_ATTEMPTS_PER_IP - nextGlobalAttempts
    )
  );

  return { lockedUntil, retryAfterSeconds, remainingAttempts };
}

/**
 * Reinicia el contador de fallos cuando la autenticación resulta exitosa.
 */
export async function clearAuthFailures(
  keys: Pick<AuthRateLimitCheck, 'scopeKey' | 'globalKey'>
): Promise<void> {
  await Promise.all([clearBucket(keys.scopeKey), clearBucket(keys.globalKey)]);
}
