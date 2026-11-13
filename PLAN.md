# Plan de Desarrollo — Sincronización Rápida (1–3 s) a Costo $0 (`/api/sync` + Caché Edge Corto)

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `functions/`, `src/` o `tests/`).

---

## 1. Objetivo Técnico

Reducir la latencia de propagación de cambios entre dispositivos (PC ↔ Celular) desde **~5 minutos** (caché fijo de `raw.githubusercontent.com`) hasta **1–3 segundos**, manteniéndose **100% dentro de la capa gratuita** de Cloudflare Pages (`100,000` invocaciones/día) y GitHub REST API (`5,000` peticiones/hora con `GITHUB_PAT`), sin crear bases de datos ni variables de entorno adicionales:

1. **Endpoint proxy de lectura ligera (`GET /api/sync`):**
   - Leer `catalog.json`, `sedes.json`, `overrides.json` y `local_songs.json` directamente desde GitHub REST API usando `Accept: application/vnd.github.raw+json` (sin decodificación Base64 en el Worker, manteniendo consumo de CPU mínimo dentro del límite gratuito de 10 ms).
   - Aplicar validación estricta de lista blanca sobre `file` y `branch` para impedir lecturas fuera de los archivos de catálogo/sedes.
   - Proteger la cuota de GitHub mediante **caché corto de 5 segundos** en el edge de Cloudflare (`caches.default`) para lecturas estándar, y salto explícito (`fresh=1`) cuando el usuario pulsa sincronización manual o cambia de sede (actualizando también el caché para los demás usuarios).
   - Responder `HTTP 404` con marcador JSON `{ "notFound": true }` cuando un archivo opcional de sede (`overrides.json`, `local_songs.json`) aún no exista en la rama.
2. **Cliente resiliente con fallback automático a GitHub Raw (`fetchJsonFromGit`):**
   - Consultar primero `/api/sync?branch=...&file=...` (con `&fresh=1` si `forceRefresh === true`).
   - Si el endpoint responde HTML (p. ej. fallback SPA en `npm run dev` local sin Wrangler), error de red, error `5xx`, límite `429` o un `404` genérico sin `{ notFound: true }`, hacer **fallback automático y transparente** a `https://raw.githubusercontent.com/...` para garantizar continuidad operativa y compatibilidad total con las pruebas actuales.
3. **Auto-sincronización al volver a la pestaña/app (`visibilitychange`):**
   - Cuando un músico o líder desbloquea el celular o regresa a la app abierta, disparar `runSync(activeSedeRef.current, false)` con un *throttle* mínimo de 10 segundos para mostrar cambios recientes sin necesidad de recargar la página completa.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Helper de lectura Raw en GitHub (`functions/_lib/github.ts` y `functions/_lib/types.ts`)

```ts
// En functions/_lib/types.ts
interface PagesContext {
  request: Request;
  env: Env;
  params?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

// En functions/_lib/github.ts
async function getRawJsonText(
  env: Env,
  branch: string,
  filePath: string
): Promise<{ status: 200; rawText: string } | { status: 404 }> {
  const res = await githubFetch(
    env,
    `/contents/${encodeRepoPath(filePath)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw+json'
      }
    }
  );

  if (res.status === 404) {
    return { status: 404 };
  }
  if (!res.ok) {
    throw new Error(`Error GitHub API (HTTP ${res.status}) al leer ${filePath}`);
  }

  const rawText = await res.text();
  return { status: 200, rawText };
}
```

### B. Endpoint Serverless `GET /api/sync` (`functions/api/sync.ts`)

```ts
const ALLOWED_FILES = new Set([
  'catalog.json',
  'sedes.json',
  'overrides.json',
  'local_songs.json'
]);

function isAllowedBranch(branch: string, catalogBranch: string): boolean {
  return branch === catalogBranch || /^sede\/[a-z0-9-]+$/.test(branch);
}

export async function onRequestGet({ request, env, waitUntil }: PagesContext): Promise<Response> {
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

  // 1. Si no es lectura forzada, intentar responder desde caché edge de 5s
  if (!fresh && edgeCache) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) return cached;
  }

  // 2. Consultar GitHub API con Accept raw+json
  try {
    const result = await getRawJsonText(env, branch, file);

    const response =
      result.status === 404
        ? new Response(JSON.stringify({ notFound: true, status: 404 }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': fresh ? 'no-store' : 'public, max-age=5'
            }
          })
        : new Response(result.rawText, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': fresh ? 'no-store' : 'public, max-age=5'
            }
          });

    // Actualizar caché corto (5s) en segundo plano para proteger cuota en ráfagas
    if (edgeCache) {
      const cacheCopy = new Response(response.clone().body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=5'
        }
      });
      const putPromise = edgeCache.put(cacheKey, cacheCopy).catch(() => {});
      if (waitUntil) waitUntil(putPromise);
      else await putPromise;
    }

    return response;
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Error en sincronización rápida', 502);
  }
}
```

### C. Lectura en Cliente con Fallback Seguro (`src/services/gitSyncService.ts`)

```ts
async function fetchJsonFromGit<T>(
  branch: string,
  filePath: string,
  forceRefresh: boolean
): Promise<{ status: number; data?: T }> {
  const proxyParams = new URLSearchParams({ branch, file: filePath });
  if (forceRefresh) proxyParams.set('fresh', '1');
  const proxyUrl = `/api/sync?${proxyParams.toString()}`;

  // 1. Intento rápido vía Cloudflare Function (/api/sync, 1-3s)
  try {
    const proxyRes = await fetch(proxyUrl, forceRefresh ? { cache: 'no-store' } : undefined);
    const contentType = proxyRes.headers.get('content-type') || '';

    if (proxyRes.status === 404 && contentType.includes('application/json')) {
      const payload = (await proxyRes.json()) as { notFound?: boolean };
      if (payload?.notFound === true) {
        return { status: 404 };
      }
    }

    if (proxyRes.ok && !contentType.includes('text/html')) {
      const data = (await proxyRes.json()) as T;
      return { status: proxyRes.status, data };
    }
  } catch {
    // Silencioso: continuar al fallback de GitHub Raw
  }

  // 2. Fallback seguro a GitHub Raw (Vite dev local o contingencia del proxy)
  const cacheBust = forceRefresh ? Date.now() : undefined;
  const rawUrl = getRawFileUrl(branch, filePath, cacheBust);
  const response = await fetch(rawUrl, forceRefresh ? { cache: 'no-store' } : undefined);

  if (response.status === 404) {
    return { status: 404 };
  }
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al leer ${filePath} en ${branch}`);
  }

  const data = (await response.json()) as T;
  return { status: response.status, data };
}
```

### D. Auto-sincronización al volver a la App (`src/App.tsx`)

```ts
// Ref para evitar peticiones repetidas si el usuario alterna apps rápidamente
const lastAutoSyncMsRef = useRef<number>(0);

// Dentro de runSync (cuando se ejecuta):
lastAutoSyncMsRef.current = Date.now();

// Dentro del useEffect principal:
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    const elapsed = Date.now() - lastAutoSyncMsRef.current;
    if (elapsed >= 10_000) {
      runSync(activeSedeRef.current, false).catch(err =>
        console.warn('Error al sincronizar al volver:', err)
      );
    }
  }
};
document.addEventListener('visibilitychange', handleVisibilityChange);
// Cleanup: document.removeEventListener('visibilitychange', handleVisibilityChange);
```

---

## 3. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `functions/_lib/types.ts` | `PagesContext` | Añadir propiedad opcional `waitUntil` para escritura no bloqueante en Cloudflare Cache API. |
| `functions/_lib/github.ts` | `getRawJsonText` | Nuevo helper de lectura directa (`Accept: application/vnd.github.raw+json`) reutilizando `githubFetch`. |
| `functions/api/sync.ts` | `onRequestGet` | Nuevo endpoint público `GET /api/sync` con lista blanca de archivos/ramas, caché edge de 5s y bypass con `fresh=1`. |
| `src/services/gitSyncService.ts` | `fetchJsonFromGit` | Priorizar `/api/sync` y mantener fallback automático a `raw.githubusercontent.com` ante respuestas HTML, 404 genérico o errores de red. |
| `src/App.tsx` | `App` (`useEffect` / `runSync`) | Registrar `lastAutoSyncMsRef` y escucha `visibilitychange` con *throttle* de 10s para refrescar al volver a la app. |
| `tests/etapaB.test.ts` | Suite Etapa B | Añadir pruebas unitarias para `GET /api/sync` (validación de rutas, 404 con `notFound: true`, lectura raw 200) y fallback de `fetchJsonFromGit`. |

---

## 4. Ubicación Exacta de Modificaciones

1. **[`functions/_lib/types.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/types.ts#L21-L25):**
   - En la interfaz `PagesContext` (líneas 21–25), insertar `waitUntil?: (promise: Promise<unknown>) => void;` después de `params?: Record<string, string>;`.
2. **[`functions/_lib/github.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/github.ts#L108-L110):**
   - Insertar la función exportada `getRawJsonText` inmediatamente después de `getJsonFile` (después de la línea 108 y antes de `putJsonFile` en la línea 113).
3. **[`functions/api/sync.ts`](file:///f:/Desarrollo/app_lyrics/functions/api/sync.ts):**
   - Archivo nuevo que exporta `onRequestGet`.
4. **[`src/services/gitSyncService.ts`](file:///f:/Desarrollo/app_lyrics/src/services/gitSyncService.ts#L145-L167):**
   - Reemplazar el cuerpo de `fetchJsonFromGit` (líneas 145–167) para intentar primero `/api/sync` y caer limpiamente a `getRawFileUrl`.
5. **[`src/App.tsx`](file:///f:/Desarrollo/app_lyrics/src/App.tsx#L88-L216):**
   - Junto a `importTimerRef` (línea 90), añadir `const lastAutoSyncMsRef = useRef<number>(0);`.
   - Dentro de `runSync` (después de la línea 104), actualizar `lastAutoSyncMsRef.current = Date.now();`.
   - Dentro del `useEffect` de inicialización (entre las líneas 168 y 215), registrar `document.addEventListener('visibilitychange', handleVisibilityChange)` y removerlo en la función de limpieza.
6. **[`tests/etapaB.test.ts`](file:///f:/Desarrollo/app_lyrics/tests/etapaB.test.ts#L463-L487):**
   - Al final del archivo (después de la línea 487), añadir los nuevos casos de prueba para `syncGet` (`/api/sync`) y el fallback de `syncGeneralCatalog` / `syncSedeFromGitHub`.
