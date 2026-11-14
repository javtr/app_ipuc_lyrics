# Plan de Desarrollo — Control de Intentos Fallidos de Contraseña (Rate Limiting + Bloqueo Temporal)

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `functions/`, `src/` o `tests/`).

---

## 1. Objetivo Técnico

Proteger el endpoint de autenticación (`POST /api/auth`) y el formulario de acceso en [`AdminAuthModal`](file:///f:/Desarrollo/app_lyrics/src/components/AdminAuthModal.tsx) contra intentos repetidos de contraseñas falsas por parte de usuarios sin permisos o scripts automatizados, manteniendo **costo $0** y **cero servicios externos nuevos**:

1. **Límite estricto en servidor (`functions/_lib/rateLimit.ts` + `functions/api/auth.ts`):**
   - Permitir máximo **5 intentos fallidos** por `(IP + sedeId)` dentro de una ventana de **15 minutos**, y máximo **10 intentos fallidos** globales por `IP` (cubre el caso de probar 5 contraseñas en una sede y saltar a otras sedes).
   - Al alcanzar el límite, bloquear temporalmente durante **15 minutos (`900 s`)**, respondiendo **`HTTP 429 Too Many Requests`** con cabecera estándar `Retry-After` y JSON estructurado (`remainingAttempts: 0`, `lockedUntil`, `retryAfterSeconds`).
   - En los intentos fallidos `1..4` (`401` / `403`), devolver `remainingAttempts` y `maxAttempts` para informar al usuario sin revelar nunca qué contraseñas existen ni cuáles sedes tienen clave.
   - Si el usuario acierta la contraseña antes del bloqueo, limpiar inmediatamente el contador de intentos fallidos de esa cubeta.
   - Persistir el estado en el edge de Cloudflare mediante `caches.default` (clave con hash **SHA-256** de la IP para no guardar IPs en texto plano) y fallback automático a un `Map` en memoria en entornos sin Cache API (p. ej. pruebas locales).
2. **Protección y experiencia visual en el cliente (`src/services/cloudApiService.ts` + `src/components/AdminAuthModal.tsx`):**
   - Guardar en `localStorage` (`app_lyrics_auth_guard`) el estado local de bloqueo y de intentos restantes por sede sincronizado con las respuestas del servidor.
   - En [`AdminAuthModal`](file:///f:/Desarrollo/app_lyrics/src/components/AdminAuthModal.tsx), mostrar una **cuenta regresiva en vivo (`mm:ss`)**, deshabilitar el campo de contraseña y el botón **`Ingresar`** mientras el bloqueo esté activo (evitando llamadas innecesarias a `/api/auth`), y mostrar claramente cuántos intentos quedan cuando falla una clave.
   - Al iniciar sesión correctamente, limpiar el contador local de esa sede y del estado bloqueado.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Utilidad de Respuestas HTTP con Metadatos (`functions/_lib/response.ts`)

```ts
export function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export function errorResponse(
  message: string,
  status: number = 400,
  extraPayload?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Response {
  return jsonResponse({ ok: false, error: message, ...extraPayload }, status, extraHeaders);
}
```

### B. Control de Intentos en Servidor (`functions/_lib/rateLimit.ts`)

```ts
const DEFAULT_MAX_ATTEMPTS_PER_SCOPE = 5;
const DEFAULT_MAX_ATTEMPTS_PER_IP = 10;
const DEFAULT_LOCKOUT_SECONDS = 15 * 60; // 900 segundos (15 minutos)

interface RateLimitState {
  attempts: number;
  windowExpiresAt: number;
  lockedUntil: number;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}

async function hashIdentifier(raw: string, salt: string): Promise<string> {
  // SHA-256 vía Web Crypto para no almacenar IPs en texto plano
  digest = await crypto.subtle.digest('SHA-256', encode(`${salt}:${raw}`));
  return toHex(digest).slice(0, 32);
}

// Almacén dual: Cloudflare caches.default (en edge) o Map en memoria (en Node/Vitest)
async function readBucket(key: string, now: number): Promise<RateLimitState | null> { ... }
async function writeBucket(key: string, state: RateLimitState, now: number): Promise<void> { ... }
async function clearBucket(key: string): Promise<void> { ... }

export async function checkAuthRateLimit(
  request: Request,
  env: Env,
  sedeId: string,
  now: number = Date.now()
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
  lockedUntil: number;
  remainingAttempts: number;
  scopeKey: string;
  globalKey: string;
}> {
  ipHash = await hashIdentifier(getClientIp(request), env.JWT_SECRET || 'app-lyrics');
  scopeKey = `auth-scope-${ipHash}-${sedeId}`;
  globalKey = `auth-ip-${ipHash}`;

  scopeState = await readBucket(scopeKey, now);
  globalState = await readBucket(globalKey, now);

  // Si cualquiera de las dos cubetas está bloqueada => denegar con tiempo restante máximo
  maxLockedUntil = Math.max(scopeState?.lockedUntil || 0, globalState?.lockedUntil || 0);
  if (maxLockedUntil > now) {
    retryAfterSeconds = Math.max(1, Math.ceil((maxLockedUntil - now) / 1000));
    return { allowed: false, retryAfterSeconds, lockedUntil: maxLockedUntil, remainingAttempts: 0, scopeKey, globalKey };
  }

  remainingScope = MAX_PER_SCOPE - (scopeState?.attempts || 0);
  remainingGlobal = MAX_PER_IP - (globalState?.attempts || 0);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    lockedUntil: 0,
    remainingAttempts: Math.max(0, Math.min(remainingScope, remainingGlobal)),
    scopeKey,
    globalKey
  };
}

export async function recordAuthFailure(
  keys: { scopeKey: string; globalKey: string },
  now: number = Date.now()
): Promise<{ lockedUntil: number; retryAfterSeconds: number; remainingAttempts: number }> {
  // Incrementar attempts en ambos buckets; si alcanza el máximo, fijar lockedUntil = now + LOCKOUT_MS
  // Persistir con TTL = max(windowExpiresAt, lockedUntil) - now
  // Devolver estado actualizado para informar remainingAttempts o lock inmediato en el 5.º fallo
}

export async function clearAuthFailures(keys: { scopeKey: string; globalKey: string }): Promise<void> {
  await Promise.all([clearBucket(keys.scopeKey), clearBucket(keys.globalKey)]);
}
```

### C. Integración en `POST /api/auth` (`functions/api/auth.ts`)

```ts
export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  // 1. Validar JWT_SECRET y parsear body JSON { sedeId, password }
  if (!password) return errorResponse('Debes ingresar una contraseña', 400);

  // 2. Verificar si la IP / sede ya superó los intentos fallidos
  const rateCheck = await checkAuthRateLimit(request, env, sedeId, now);
  if (!rateCheck.allowed) {
    return errorResponse(
      formatLockoutMessage(rateCheck.retryAfterSeconds),
      429,
      {
        remainingAttempts: 0,
        lockedUntil: rateCheck.lockedUntil,
        retryAfterSeconds: rateCheck.retryAfterSeconds
      },
      { 'Retry-After': String(rateCheck.retryAfterSeconds) }
    );
  }

  // 3. Evaluar MASTER_PASSWORD
  if (env.MASTER_PASSWORD && await constantTimeEqual(password, env.MASTER_PASSWORD)) {
    await clearAuthFailures(rateCheck);
    return jsonResponse({ ok: true, token, role: 'master', sedeId: 'general', expiresAt });
  }

  // 4. Evaluar sedeId === 'general' o clave de sede (incluye sede sin clave configurada para evitar enumeración)
  if (sedeId === 'general' || !expectedSedePass || !(await constantTimeEqual(password, expectedSedePass))) {
    const failureState = await recordAuthFailure(rateCheck, now);
    if (failureState.lockedUntil > now) {
      return errorResponse(
        formatLockoutMessage(failureState.retryAfterSeconds),
        429,
        {
          remainingAttempts: 0,
          lockedUntil: failureState.lockedUntil,
          retryAfterSeconds: failureState.retryAfterSeconds
        },
        { 'Retry-After': String(failureState.retryAfterSeconds) }
      );
    }

    const baseMsg =
      sedeId === 'general'
        ? 'Se requiere la clave de Administrador General para el Catálogo Oficial'
        : !expectedSedePass
          ? 'Esta sede aún no tiene clave configurada en la nube'
          : 'Contraseña incorrecta para esta sede';

    return errorResponse(
      `${baseMsg}. Te quedan ${failureState.remainingAttempts} intento(s).`,
      sedeId === 'general' || !expectedSedePass ? 403 : 401,
      { remainingAttempts: failureState.remainingAttempts }
    );
  }

  // 5. Login de sede exitoso => limpiar fallos previos y emitir JWT
  await clearAuthFailures(rateCheck);
  return jsonResponse({ ok: true, token, role: 'sede', sedeId, expiresAt });
};
```

### D. Estado Local y Cuenta Regresiva en Frontend (`cloudApiService.ts` y `AdminAuthModal.tsx`)

```ts
// En src/services/cloudApiService.ts
export interface AuthLockoutInfo {
  lockedUntil: number;
  remainingAttempts: number;
}

export class AuthRateLimitError extends Error {
  lockedUntil: number;
  retryAfterSeconds: number;
  constructor(message: string, lockedUntil: number, retryAfterSeconds: number) { ... }
}

// Almacenado en localStorage bajo 'app_lyrics_auth_guard' por sedeId:
export function getAuthGuardState(sedeId: string): AuthLockoutInfo { ... }
export function clearAuthGuardState(sedeId: string): void { ... }

// En loginAdmin(sedeId, password):
// 1. Antes de llamar a fetch('/api/auth'), comprobar si getAuthGuardState(sedeId).lockedUntil > Date.now()
//    Si sigue bloqueado, lanzar AuthRateLimitError sin hacer peticiones de red innecesarias.
// 2. Si /api/auth responde 429 (o error con lockedUntil), guardar lockedUntil en localStorage y lanzar AuthRateLimitError.
// 3. Si responde 401/403 con remainingAttempts, persistir remainingAttempts en localStorage y lanzar Error con el mensaje del servidor.
// 4. Si responde 200 ok, llamar clearAuthGuardState(sedeId) y guardar AdminSession.
```

```tsx
// En src/components/AdminAuthModal.tsx
// Al cambiar targetScope o abrir modal, leer getAuthGuardState(targetScope).
// Si lockedUntil > Date.now():
//   - Intervalo de 1 segundo que actualiza `remainingSeconds = Math.ceil((lockedUntil - Date.now()) / 1000)`
//   - Al llegar a 0, limpiar el estado bloqueado y permitir intentar nuevamente
//   - Mostrar aviso visual con temporizador `mm:ss` ("Acceso bloqueado temporalmente. Intenta en 14:52")
//   - Deshabilitar <input type="password"> y el botón "Ingresar" mientras remainingSeconds > 0
// Cuando remainingAttempts < 5 y > 0, mostrar badge discreto: "Intentos restantes: X"
```

---

## 3. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `functions/_lib/response.ts` | `jsonResponse`, `errorResponse` | Aceptar `extraPayload` y `extraHeaders` opcionales (ej. `Retry-After`, `remainingAttempts`, `lockedUntil`). |
| `functions/_lib/rateLimit.ts` | `checkAuthRateLimit`, `recordAuthFailure`, `clearAuthFailures`, `clearRateLimitMemoryStoreForTests` | Nuevo módulo de rate limiting por IP + sede usando Web Crypto SHA-256 y almacenamiento `caches.default` / `Map`. |
| `functions/api/auth.ts` | `onRequestPost` | Integrar validación de bloqueo (`429`), conteo de fallos (`401`/`403` con `remainingAttempts`) y reinicio de contador tras login exitoso. |
| `src/services/cloudApiService.ts` | `AuthRateLimitError`, `getAuthGuardState`, `clearAuthGuardState`, `loginAdmin` | Persistir estado de bloqueo/intentos en `localStorage`, evitar envíos durante el bloqueo y propagar tiempos de espera. |
| `src/components/AdminAuthModal.tsx` | `AdminAuthModal` | Mostrar cuenta regresiva en vivo `mm:ss`, indicador de intentos restantes y bloqueo del formulario mientras dure la penalización. |
| `tests/etapaB.test.ts` | Suite Etapa B | Añadir pruebas para servidor (`429` al 5.º fallo, `Retry-After`, aislamiento por IP/sede, reinicio al acertar) y cliente (`loginAdmin` guard + bloqueo offline local). |

---

## 4. Ubicación Exacta de Modificaciones

1. **[`functions/_lib/response.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/response.ts#L1-L19):**
   - Actualizar `jsonResponse` (líneas 4–12) para aceptar `extraHeaders?: Record<string, string>` y `errorResponse` (líneas 17–19) para aceptar `extraPayload` y `extraHeaders`.
2. **[`functions/_lib/rateLimit.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/rateLimit.ts):**
   - Archivo nuevo que exporta `checkAuthRateLimit`, `recordAuthFailure`, `clearAuthFailures`, `formatLockoutMessage` y `clearRateLimitMemoryStoreForTests`.
3. **[`functions/api/auth.ts`](file:///f:/Desarrollo/app_lyrics/functions/api/auth.ts#L1-L102):**
   - En la parte superior (líneas 1–6), importar las funciones de `../_lib/rateLimit`.
   - Dentro de `onRequestPost` (después de validar `!password` en la línea 49), invocar `checkAuthRateLimit`; en cada éxito (`lines 54-70` y `lines 86-101`) llamar `clearAuthFailures`; y en cada rechazo (`lines 72-84`) llamar `recordAuthFailure` y responder `429` o `401`/`403` con `remainingAttempts`.
4. **[`src/services/cloudApiService.ts`](file:///f:/Desarrollo/app_lyrics/src/services/cloudApiService.ts#L12-L103):**
   - Junto a `UnauthorizedApiError` (después de la línea 19), añadir `AuthRateLimitError`, `AuthLockoutInfo`, `getAuthGuardState` y `clearAuthGuardState`.
   - Reemplazar `loginAdmin` (líneas 75–103) para consultar el bloqueo local antes del `fetch`, actualizar contadores con la respuesta de `/api/auth` y limpiarlos al autenticar.
5. **[`src/components/AdminAuthModal.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/AdminAuthModal.tsx#L33-L248):**
   - En los estados del componente (junto a las líneas 33–55), añadir `lockedUntil`, `remainingAttempts` y `remainingSeconds` + `useEffect` de cuenta regresiva cada 1000 ms.
   - En `handleLogin` (líneas 63–83) y el formulario JSX (líneas 185–248), deshabilitar input/botón mientras `remainingSeconds > 0`, mostrar banner con tiempo restante `mm:ss` y advertencia de intentos restantes.
6. **[`tests/etapaB.test.ts`](file:///f:/Desarrollo/app_lyrics/tests/etapaB.test.ts#L59-L577):**
   - En `beforeEach` (línea 59), invocar `clearRateLimitMemoryStoreForTests()`.
   - Al final del archivo (después de la línea 576), añadir las pruebas unitarias de bloqueo tras 5 intentos fallidos, reinicio al acertar y guarda en `loginAdmin`.
