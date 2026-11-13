# Plan de Desarrollo — Etapa B: Backend Serverless Cloudflare Pages, Autenticación JWT y Sincronización Bidireccional con GitHub

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de crear o modificar archivos en `functions/`, `src/` o `tests/`).

---

## 1. Objetivo Técnico

Implementar la **Etapa B** definida en [SPECIFICATIONS.md](file:///f:/Desarrollo/app_lyrics/SPECIFICATIONS.md#L186-L210) y [.agent/ARCHITECTURE.md](file:///f:/Desarrollo/app_lyrics/.agent/ARCHITECTURE.md#L17-L54) manteniendo costo marginal **$0** sobre **Cloudflare Pages (`*.pages.dev`)** y **GitHub REST API**:

1. **Autenticación stateless sin base de datos (`POST /api/auth`):**
   - Validar contraseña de sede (para editar/crear canciones y variantes locales de esa sede) o contraseña maestra (Administrador General para editar el catálogo oficial en `catalog`, crear sedes remotas o editar cualquier sede).
   - Emitir un JWT firmado con **Web Crypto (`HMAC-SHA256`)** sin exponer secretos en el cliente.
2. **Sincronización bidireccional real PC ↔ Celular (`POST /api/commit` + cola offline + descarga completa por sede):**
   - Permitir que cualquier cambio guardado en el editor o al eliminar/restaurar una canción se publique en GitHub bajo `sede/{slug}` (`overrides.json` y `local_songs.json`) o `catalog` (`catalog.json`, solo Administrador General), usando `GITHUB_PAT` exclusivamente en servidor Cloudflare.
   - Si el dispositivo está offline o sin sesión, conservar la operación en **IndexedDB (`pendingSync`)** y sincronizar automáticamente al reconectar / iniciar sesión.
   - Ampliar `syncSedeFromGitHub` en [gitSyncService.ts](file:///f:/Desarrollo/app_lyrics/src/services/gitSyncService.ts#L326-L373) para descargar tanto `overrides.json` como `local_songs.json` (y limpiar registros `'remote'` eliminados en nube), logrando que canciones exclusivas creadas en una sede en PC aparezcan en los celulares de esa sede.
3. **Bandeja de reportes de corrección mediante GitHub Issues (`POST /api/suggest-correction`):**
   - Conectar [`CorrectionModal`](file:///f:/Desarrollo/app_lyrics/src/components/CorrectionModal.tsx#L44-L65) para enviar el reporte en tiempo real como Issue etiquetado en `javtr/app_ipuc_lyrics`, manteniendo respaldo en cola `db.suggestions` si no hay internet.
4. **Creación remota de nuevas congregaciones/sedes (`POST /api/create-sede`):**
   - Permitir al Administrador General registrar una nueva sede desde [`SedeSelector`](file:///f:/Desarrollo/app_lyrics/src/components/SedeSelector.tsx#L71-L90) creando su rama `sede/{slug}` en GitHub (desde `catalog`) y actualizando `sedes.json`.
5. **Despliegue limpio en subdominio gratuito `*.pages.dev`:**
   - Incluir configuración de TypeScript aislada para `functions/`, variables de entorno seguras en Cloudflare Pages e inicialización de la rama `catalog`.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Núcleo Compartido Serverless (`functions/_lib/`)

```ts
// functions/_lib/types.ts
export interface Env {
  GITHUB_PAT: string;
  JWT_SECRET: string;
  MASTER_PASSWORD: string;
  SEDE_PASSWORDS_JSON?: string; // JSON: { "sede-palestina": "clave1", "sede-central": "clave2" }
  GITHUB_OWNER?: string;        // fallback 'javtr'
  GITHUB_REPO?: string;         // fallback 'app_ipuc_lyrics'
  CATALOG_BRANCH?: string;      // fallback 'catalog'
}

export interface JwtClaims {
  role: 'master' | 'sede';
  sedeId: string;   // 'general' para master, 'sede-...' para líder de sede
  branch: string;   // 'catalog' o 'sede/...'
  iat: number;
  exp: number;
}
```

```ts
// functions/_lib/jwt.ts (Web Crypto nativo de Cloudflare V8 Isolates, cero dependencias)
async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  payload = base64UrlEncode(JSON.stringify(claims));
  key = await crypto.subtle.importKey('raw', textEncode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  sig = await crypto.subtle.sign('HMAC', key, textEncode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncodeBytes(sig)}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  key = await crypto.subtle.importKey('raw', textEncode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  isValid = await crypto.subtle.verify('HMAC', key, base64UrlDecodeBytes(sig), textEncode(`${header}.${payload}`));
  if (!isValid) return null;
  claims = JSON.parse(textDecode(base64UrlDecodeBytes(payload)));
  if (!claims.exp || Date.now() >= claims.exp) return null;
  return claims;
}

function constantTimeEqual(a: string, b: string): boolean {
  // Comparación HMAC o byte-a-byte evitando filtrado por tiempo
}
```

```ts
// functions/_lib/github.ts (UTF-8 seguro para tildes y eñes con TextEncoder/TextDecoder)
async function githubFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  owner = env.GITHUB_OWNER || 'javtr';
  repo = env.GITHUB_REPO || 'app_ipuc_lyrics';
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AppLyrics-Cloudflare-Pages',
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
}

async function getJsonFile<T>(env: Env, branch: string, filePath: string): Promise<{ data: T; sha: string } | null> {
  res = await githubFetch(env, `/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${filePath} failed (${res.status})`);
  json = await res.json();
  rawBytes = Uint8Array.from(atob(json.content.replace(/\n/g, '')), c => c.charCodeAt(0));
  return { data: JSON.parse(new TextDecoder().decode(rawBytes)) as T, sha: json.sha };
}

async function putJsonFile(env: Env, branch: string, filePath: string, payload: unknown, sha: string | undefined, message: string): Promise<void> {
  utf8Bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2) + '\n');
  base64Content = bytesToBase64(utf8Bytes);
  res = await githubFetch(env, `/contents/${encodePath(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: base64Content, branch, ...(sha ? { sha } : {}) })
  });
  if (res.status === 409) throw new RetryableConflictError();
  if (!res.ok) throw new Error(`GitHub write ${filePath} failed (${res.status})`);
}

async function ensureSedeBranch(env: Env, targetBranch: string): Promise<void> {
  check = await githubFetch(env, `/git/ref/heads/${encodeURIComponent(targetBranch)}`);
  if (check.ok) return;
  baseBranch = env.CATALOG_BRANCH || 'catalog';
  baseRef = await githubFetch(env, `/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  baseData = await baseRef.json();
  await githubFetch(env, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: baseData.object.sha })
  });
}
```

### B. Endpoints (`functions/api/*.ts`)

```ts
// 1. functions/api/auth.ts (POST /api/auth)
onRequestPost({ request, env }):
  const { sedeId = 'general', password } = await request.json();
  if (!password) return errorResponse('Contraseña requerida', 400);

  if (env.MASTER_PASSWORD && constantTimeEqual(password, env.MASTER_PASSWORD)) {
    claims = { role: 'master', sedeId: 'general', branch: env.CATALOG_BRANCH || 'catalog', iat: now, exp: now + 7_DAYS };
    return jsonResponse({ token: await signJwt(claims, env.JWT_SECRET), ...claims });
  }

  if (sedeId === 'general') return errorResponse('Se requiere clave maestra para el Catálogo General', 403);

  const map = JSON.parse(env.SEDE_PASSWORDS_JSON || '{}');
  const expectedPass = map[sedeId];
  if (!expectedPass) return errorResponse('Esta sede aún no tiene clave remota configurada', 403);
  if (!constantTimeEqual(password, expectedPass)) return errorResponse('Contraseña incorrecta', 401);

  const branch = toSedeBranch(sedeId); // 'sede-palestina' -> 'sede/palestina'
  claims = { role: 'sede', sedeId, branch, iat: now, exp: now + 7_DAYS };
  return jsonResponse({ token: await signJwt(claims, env.JWT_SECRET), ...claims });
```

```ts
// 2. functions/api/commit.ts (POST /api/commit)
onRequestPost({ request, env }):
  claims = await requireAuth(request, env); // 401 si falta o expiró
  const { action, targetSedeId, song, songId, override } = await request.json();

  // Validación estricta de alcance (anti-escalamiento)
  if (targetSedeId === 'general' && claims.role !== 'master') {
    return errorResponse('Solo el Administrador General puede modificar el Catálogo General', 403);
  }
  if (targetSedeId !== 'general' && claims.role !== 'master' && claims.sedeId !== targetSedeId) {
    return errorResponse('Tu sesión no tiene permisos para escribir en esta sede', 403);
  }

  const branch = targetSedeId === 'general' ? (env.CATALOG_BRANCH || 'catalog') : toSedeBranch(targetSedeId);
  if (targetSedeId !== 'general') await ensureSedeBranch(env, branch);

  const nowIso = new Date().toISOString();
  // Determinar archivo destino:
  // - general + (upsert_song | delete_song)      => 'catalog.json'
  // - sede-... + (upsert_song | delete_song)     => 'local_songs.json' (forzar song.sedeId = targetSedeId)
  // - sede-... + (upsert_override | delete_override) => 'overrides.json'

  // Con reintento único ante conflicto 409:
  const current = await getJsonFile<Array>(env, branch, targetFile);
  const nextArray = applyMutation(current?.data || [], action, sanitizedRecord, nowIso);
  await putJsonFile(env, branch, targetFile, nextArray, current?.sha, commitMessage);

  return jsonResponse({ ok: true, updatedAt: nowIso, branch });
```

```ts
// 3. functions/api/suggest-correction.ts (POST /api/suggest-correction)
onRequestPost({ request, env }):
  const { songId, songTitle, sectionLabel, suggestedFix, reportedBy } = await request.json();
  if (!songId || !songTitle || !suggestedFix?.trim()) return errorResponse('Datos incompletos', 400);
  if (suggestedFix.length > 2000) return errorResponse('El mensaje excede el límite permitido', 400);

  issue = await createGitHubIssue(
    env,
    `[Corrección] ${songTitle} - ${sectionLabel || 'General'}`,
    `### Reporte de Corrección\n- **Canción:** ${songTitle} (\`${songId}\`)\n- **Sección:** ${sectionLabel}\n- **Reportado por:** ${reportedBy || 'Anónimo'}\n\n#### Detalle:\n${suggestedFix.trim()}`
  );
  return jsonResponse({ ok: true, issueNumber: issue.number, issueUrl: issue.html_url });
```

```ts
// 4. functions/api/create-sede.ts (POST /api/create-sede)
onRequestPost({ request, env }):
  claims = await requireAuth(request, env);
  if (claims.role !== 'master') return errorResponse('Requiere sesión de Administrador General', 403);

  const { id, name, shortName } = await request.json();
  const branch = toSedeBranch(id);
  await ensureSedeBranch(env, branch);

  // Inicializar overrides.json y local_songs.json vacíos si no existen (404)
  if (!(await getJsonFile(env, branch, 'overrides.json'))) {
    await putJsonFile(env, branch, 'overrides.json', [], undefined, `chore(${id}): init overrides`);
  }
  if (!(await getJsonFile(env, branch, 'local_songs.json'))) {
    await putJsonFile(env, branch, 'local_songs.json', [], undefined, `chore(${id}): init local_songs`);
  }

  // Registrar perfil en sedes.json de rama catalog
  const sedesFile = await getJsonFile<SedeProfile[]>(env, env.CATALOG_BRANCH || 'catalog', 'sedes.json');
  const nextSedes = upsertSedeProfile(sedesFile?.data || [], { id, name, shortName });
  await putJsonFile(env, env.CATALOG_BRANCH || 'catalog', 'sedes.json', nextSedes, sedesFile?.sha, `feat(sedes): register ${id}`);

  return jsonResponse({ ok: true, sede: { id, name, shortName }, branch });
```

### C. Sincronización Frontend, Cola Offline y Permisos (`src/`)

```text
Flujo Guardar / Eliminar / Restaurar en Frontend:
1. SongEditorModal / App guarda inmediatamente en IndexedDB (db.songs o db.overrides) con `syncSource: 'local'` (experiencia 100% instantánea incluso offline).
2. `cloudApiService.publishOrQueueChange(op)`:
   - Lee `AdminSession` vigente desde `localStorage` (`canWriteToSede(session, targetSedeId)`).
   - Si hay sesión con permisos Y `navigator.onLine`:
     - Llama `POST /api/commit` con `Authorization: Bearer <token>`.
     - Si responde 200 OK -> actualiza registro local en `db.songs` / `db.overrides` a `syncSource: 'remote'` + `updatedAt` del servidor y elimina cualquier pendiente equivalente.
     - Si responde 401 -> limpia sesión expirada, encola en `db.pendingSync` y notifica volver a iniciar sesión.
     - Si falla red / 5xx -> encola en `db.pendingSync` para reintento automático.
   - Si no hay internet (con sesión activa) -> encola en `db.pendingSync`.
   - Si no hay sesión de administrador -> queda en modo solo local hasta iniciar sesión y sincronizar.
3. `flushPendingSyncQueue()` se ejecuta al recuperar conexión (`window 'online'`), al iniciar sesión de administrador y al presionar sincronizar manualmente.
4. `syncSedeFromGitHub(sedeId)` en `gitSyncService.ts`:
   - Descarga `overrides.json` Y `local_songs.json` de `sede/{slug}`.
   - Fusiona registros nuevos/más recientes (`mergeRemoteRecords`) y poda registros `'remote'` de esa sede que ya no existan en el JSON remoto (reflejando eliminaciones hechas desde otro dispositivo).
5. `CorrectionModal`:
   - Llama `submitCorrectionSuggestion(suggestion)`: si hay red intenta `POST /api/suggest-correction`; si logra crear el Issue muestra "¡Reporte enviado al equipo central (#número)!", y si está offline guarda en `db.suggestions` mostrando "Guardado en cola local" y se reenvía al volver conexión.
```

---

## 3. Impacto

| Archivo / Módulo | Tipo / Clase / Función afectada | Cambio |
| --- | --- | --- |
| `functions/tsconfig.json` *(Nuevo)* | Configuración TS Cloudflare | Compilación estricta aislada para Functions (`lib: ["ES2022", "WebWorker"]`) sin afectar Vite |
| `functions/_lib/types.ts` *(Nuevo)* | `Env`, `JwtClaims`, `PagesContext` | Tipos compartidos para Cloudflare Pages Functions |
| `functions/_lib/response.ts` *(Nuevo)* | `jsonResponse`, `errorResponse` | Respuestas JSON uniformes con `Cache-Control: no-store` |
| `functions/_lib/jwt.ts` *(Nuevo)* | `signJwt`, `verifyJwt`, `requireAuth`, `constantTimeEqual` | Firma y verificación HMAC-SHA256 stateless con Web Crypto |
| `functions/_lib/github.ts` *(Nuevo)* | `getJsonFile`, `putJsonFile`, `ensureSedeBranch`, `createGitHubIssue` | Cliente GitHub REST API seguro con UTF-8 y manejo de ramas/409 |
| `functions/api/auth.ts` *(Nuevo)* | `onRequestPost` | Login de Administrador de Sede o Administrador General (`MASTER_PASSWORD`) |
| `functions/api/commit.ts` *(Nuevo)* | `onRequestPost` | Escritura validada por rol a `catalog.json`, `local_songs.json` o `overrides.json` |
| `functions/api/suggest-correction.ts` *(Nuevo)* | `onRequestPost` | Creación pública de GitHub Issues desde reportes de corrección |
| `functions/api/create-sede.ts` *(Nuevo)* | `onRequestPost` | Creación de rama `sede/{slug}` y registro en `sedes.json` (solo Master) |
| `src/types/index.ts` | `AdminSession`, `PendingSyncAction`, `PendingSyncOperation`, `CorrectionSuggestion` | Añadir tipos de sesión, cola de subida offline y bandera `synced?: boolean` en correcciones |
| `src/db/index.ts` | `LyricsDatabase` | Subir a Dexie `version(2)` añadiendo tabla `pendingSync: 'id, targetSedeId, createdAt'` |
| `src/services/gitSyncService.ts` | `syncSedeFromGitHub`, `syncRemoteRecordsWithPruning` | Descargar `local_songs.json` además de `overrides.json`; podar eliminaciones remotas |
| `src/services/cloudApiService.ts` *(Nuevo)* | `loginAdmin`, `getStoredSession`, `canSessionEditSede`, `publishOrQueueChange`, `flushPendingSyncQueue`, `submitCorrectionSuggestion`, `flushPendingCorrections`, `createRemoteSede` | Cliente HTTP y cola offline hacia `/api/*` |
| `src/components/AdminAuthModal.tsx` *(Nuevo)* | `AdminAuthModal` | Modal amigable (sin términos Git) para autenticar líder de sede o administrador general y ver pendientes por subir |
| `src/components/SongEditorModal.tsx` | `SongEditorModalProps`, `SongEditorModal` (`canDeleteSong`, `handleSave`) | Pasar `canEditGeneral` + metadata `{ override, isSedeExclusive }` en `onSave`; habilitar borrado de canciones propias de sede aunque ya estén en la nube (`syncSource === 'remote'`) |
| `src/components/CorrectionModal.tsx` | `CorrectionModal` (`handleSubmit`) | Invocar `submitCorrectionSuggestion` y distinguir mensaje online (Issue creado) vs offline (cola local) |
| `src/components/SedeSelector.tsx` | `SedeSelectorProps`, `handleCreateSede` | Sincronizar nueva sede con `/api/create-sede` si hay sesión Master; indicar creación local vs nube |
| `src/App.tsx` | `App` (`openEditorForActiveSong`, `openCreateSongEditor`, `handleDeleteSong`, `handleRestoreOverride`, header, `sedeRequiredPrompt`) | Estado de sesión `adminSession` y `pendingSyncCount`; disparo automático de `publishOrQueueChange` y `flushPendingSyncQueue`; permitir edición de `Catálogo General` solo con sesión `master` |
| `tests/etapaB.test.ts` *(Nuevo)* | Suite unitaria de Etapa B | Probar JWT Web Crypto (`signJwt`/`verifyJwt`), RBAC de `/api/auth`, `/api/commit`, `/api/create-sede`, `/api/suggest-correction` y cola offline `cloudApiService` / `syncSedeFromGitHub` (`local_songs.json`) |

---

## 4. Ubicación Exacta

1. **Archivos nuevos en Backend Serverless (`functions/`):**
   - `functions/tsconfig.json`, `functions/_lib/{types,response,jwt,github}.ts`, `functions/api/{auth,commit,suggest-correction,create-sede}.ts`.

2. **`src/types/index.ts`**
   - Al final del archivo (**después de línea 93**): exportar `AdminRole`, `AdminSession`, `PendingSyncAction` y `PendingSyncOperation`; agregar `syncedToCloud?: boolean;` y `issueNumber?: number;` a `CorrectionSuggestion` (**líneas 85-93**).

3. **`src/db/index.ts`**
   - Clase `LyricsDatabase` (**líneas 5-20**): agregar propiedad `pendingSync!: Table<PendingSyncOperation, string>;` y definir `this.version(2).stores({ ... })` después de `this.version(1).stores(...)` (**líneas 13-19**).

4. **`src/services/gitSyncService.ts`**
   - Función `syncSedeFromGitHub` (**líneas 326-373**): además de consultar `overrides.json` (**línea 342**), consultar en paralelo `local_songs.json` en `branch`, fusionar `BaseSong` con `isValidBaseSong` forzando `sedeId`, y podar registros `'remote'` de esa sede que ya no estén presentes cuando la respuesta remota sea 200 OK.

5. **`src/services/cloudApiService.ts`** *(archivo nuevo)* y **`src/components/AdminAuthModal.tsx`** *(archivo nuevo)*.

6. **`src/components/SongEditorModal.tsx`**
   - Props `SongEditorModalProps` (**líneas 28-42**): añadir `canEditGeneral?: boolean;` y ampliar `onSave: (savedSong: BaseSong, meta?: { override?: SedeSongOverride; isSedeExclusive?: boolean }) => void;`.
   - Permisos locales (**líneas 175-177**): reemplazar `canDeleteLocalSong` por `canDeleteSong` que permita borrar canciones propias de la sede (`isSedeExclusiveSong`), canciones locales no publicadas (`syncSource === 'local'`) o canciones generales si `canEditGeneral`.
   - Método `handleSave` (**líneas 245-269**): marcar `syncSource: 'local'` mientras se sube y devolver en `onSave(baseSongData, { override, isSedeExclusive: isSedeExclusiveSong })`.

7. **`src/components/CorrectionModal.tsx`**
   - Método `handleSubmit` (**líneas 44-65**) y estado enviado (**líneas 92-99**): sustituir `await db.suggestions.add(suggestion)` directo por `await submitCorrectionSuggestion(suggestion)` y renderizar confirmación diferenciada entre envío inmediato a GitHub Issues vs cola offline.

8. **`src/components/SedeSelector.tsx`**
   - `SedeSelectorProps` (**líneas 7-17**): añadir `adminSession?: AdminSession | null;` y `onRemoteCreateSede?: (profile: SedeProfile) => Promise<void>;`.
   - `handleCreateSede` (**líneas 71-90**) y modal de creación (**líneas 226-264**): invocar `onRemoteCreateSede` si hay sesión Master online e informar si la sede quedó solo local o sincronizada en nube.

9. **`src/App.tsx`**
   - Estados iniciales (**líneas 65-75**): añadir `adminSession` y consulta reactiva `pendingSyncItems = useLiveQuery(() => db.pendingSync.toArray()) || []`.
   - Efecto de arranque y `online` (**líneas 125-150**): invocar `flushPendingSyncQueue()` y `flushPendingCorrections()` cuando exista conectividad y sesión vigente.
   - `openEditorForActiveSong` y `openCreateSongEditor` (**líneas 271-310**): permitir editar/crear en `effectiveSedeId === 'general'` cuando `adminSession?.role === 'master'`; en caso contrario seguir mostrando `sedeRequiredPrompt` (con botón directo para abrir `AdminAuthModal`).
   - `handleRestoreOverride` y `handleDeleteSong` (**líneas 312-334**): invocar `publishOrQueueChange` (`delete_override` / `delete_song`) y habilitar borrado de canciones exclusivas de sede o catálogo general bajo sesión `master`.
   - Barra superior (**líneas 398-430**): incorporar botón compacto de `AdminAuthModal` (con insignia de sesión activa o pendientes por sincronizar).
   - `sedeRequiredPrompt` (**líneas 747-775**): añadir acceso rápido a iniciar sesión como Administrador General si desea editar el Catálogo General.

10. **`tests/etapaB.test.ts`** *(archivo nuevo)* y actualización menor en **`package.json`** (opcional script `"typecheck": "tsc --noEmit && tsc -p functions/tsconfig.json --noEmit"`).

---

## 5. Despliegue en Cloudflare Pages (`*.pages.dev`) e Inicialización GitHub

Pasos operativos que se ejecutarán al desplegar en Fase 2 / pruebas reales:
1. **Crear rama `catalog` en `javtr/app_ipuc_lyrics`** conteniendo `catalog.json` (array con canciones iniciales) y `sedes.json` (array con `SedeProfile` oficiales).
2. **Conectar repositorio en Cloudflare Pages** (plan gratuito):
   - Build command: `npm run build`
   - Output directory: `dist` (Cloudflare detecta automáticamente `/functions` en la raíz del proyecto).
   - Dominio generado: `https://<nombre-proyecto>.pages.dev`.
3. **Configurar Variables de Entorno (Encrypted Secrets) en Cloudflare Pages -> Settings -> Environment variables:**
   - `GITHUB_PAT`: Fine-grained Personal Access Token con permiso *Contents (Read & Write)* y *Issues (Read & Write)* **únicamente** sobre `javtr/app_ipuc_lyrics`.
   - `JWT_SECRET`: Cadena aleatoria larga (32+ bytes).
   - `MASTER_PASSWORD`: Clave secreta del Administrador General.
   - `SEDE_PASSWORDS_JSON`: JSON con claves por sede, ej. `{"sede-palestina":"...","sede-central":"..."}`.

---

## 6. Verificación Planificada (en Fase 2, tras aprobación)

1. `npx tsc --noEmit` (cliente + tests) y `npx tsc -p functions/tsconfig.json --noEmit` (endpoints Cloudflare).
2. `npm test` (toda la suite previa de 45 tests + nuevos tests de Etapa B en `tests/etapaB.test.ts`).
3. `npm run build` (empaquetado Vite + PWA de producción sin advertencias bloqueantes).
