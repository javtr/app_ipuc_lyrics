# Plan de Desarrollo (Etapa A): Sincronización de Lectura desde GitHub con Ramas de Datos Separadas y Fallback Seguro

> **Estado:** EJECUTADO (Código, pruebas y ramas `catalog` / `sede/palestina` listos; pendiente cambiar visibilidad del repo a Pública para lectura Raw sin token)

---

## 1. Objetivo Técnico y Alineación Arquitectónica

### 1.1 Alcance
Implementar la **Etapa A (Sincronización de Lectura `GitHub → IndexedDB`)** descrita en nuestra discusión y alineada con **[SPECIFICATIONS.md](file:///f:/Desarrollo/app_lyrics/SPECIFICATIONS.md)** (Secciones 1.2, 4.2 y 5.3) y **[.agent/ARCHITECTURE.md](file:///f:/Desarrollo/app_lyrics/.agent/ARCHITECTURE.md)** (Secciones 2 y 4):

1. **Ramas de Datos Separadas en `javtr/app_ipuc_lyrics`:**
   - El código fuente permanece limpio en `master` / `main`.
   - Se crean ramas huérfanas (*orphan branches*) exclusivas para datos JSON:
     - **`catalog`**: Contiene `catalog.json` (`BaseSong[]`) y `sedes.json` (`SedeProfile[]`).
     - **`sede/palestina`** (y futuras `sede/{nombre}`): Contiene `overrides.json` (`SedeSongOverride[]`).
   - Cada rama consolida sus canciones en un único archivo JSON para descargar todo el catálogo en **1 sola petición HTTP**, sin consumir límites de GitHub REST API y manteniendo costo **$0** vía `raw.githubusercontent.com`.
2. **Descarga Base por Perfil (`activeSedeId` persistido):**
   - Al abrir la app con conexión, se sincroniza el catálogo oficial desde la rama `catalog` y las variantes de la sede activa elegida por el usuario (persistida ahora en `localStorage` bajo `app_lyrics_active_sede`).
   - Se fija una fecha semilla estática (`'2026-01-01T00:00:00.000Z'`) en `SEED_SONGS` / `SEED_OVERRIDES` para corregir el defecto actual de `new Date().toISOString()` que haría parecer que la semilla local siempre es más reciente que GitHub.
3. **Sincronización On-Demand y Fallback Seguro (Alternativa 3 de `SPECIFICATIONS.md` Sección 5.3):**
   - Al importar un repertorio compartido por WhatsApp (`#repertorio=...`), si su `sedeId` es distinto de `'general'` y hay conexión, la app descarga en segundo plano las variantes de esa sede y las guarda acumulativamente en `db.overrides`.
   - Si no hay conexión al abrir un repertorio de una sede que aún no ha sido sincronizada, `resolveSongForDisplay` hace **fallback automático** a la canción base oficial del catálogo general y adjunta un aviso discreto (`fallbackNotice`) para que el músico siempre pueda tocar sin pantallas vacías.
4. **Abstracción Total de Git en la UI:**
   - El usuario nunca ve términos de Git (`branch`, `commit`, `raw`, `repo`). Solo ve el estado de actualización del cancionero y un botón amigable **"Actualizar Cancionero"** dentro del selector de congregación.

### 1.2 Nota de Gobernanza (`.agent/AGENTS.md`)
- Todos los cambios de código y pruebas residen estrictamente dentro de `src/` y `tests/`.
- En Fase 2 (solo tras aprobación expresa) se inicializarán y subirán las ramas huérfanas `catalog` y `sede/palestina` directamente en el repositorio actual `javtr/app_ipuc_lyrics` usando comandos Git dentro del directorio del repositorio (sin tocar rutas externas ni ensuciar el árbol de trabajo de `master`).

---

## 2. Pseudocódigo y Flujo Lógico

### 2.1 Configuración Centralizada (`src/config/gitConfig.ts`)
```text
CONSTANTE GIT_CONFIG:
  owner = 'javtr'
  repo = 'app_ipuc_lyrics'
  catalogBranch = 'catalog'

FUNCIÓN getSedeBranch(sedeId):
  SI !sedeId O sedeId == 'general' RETORNAR 'catalog'
  SI sedeId.startsWith('sede-') RETORNAR 'sede/' + sedeId.slice(5)
  RETORNAR 'sede/' + sedeId

FUNCIÓN getRawFileUrl(branch, filePath, cacheBustTimestamp?):
  url = "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{filePath}"
  SI cacheBustTimestamp: url += "?t=" + cacheBustTimestamp
  RETORNAR url
```

### 2.2 Servicio de Sincronización (`src/services/gitSyncService.ts`)
```text
ESTADO LOCAL EN localStorage:
  - 'app_lyrics_last_sync': timestamp ISO última sincronización exitosa
  - 'app_lyrics_synced_sedes': JSON array de sedeIds descargados exitosamente
  - 'app_lyrics_sedes_cache': JSON array de SedeProfile[] descargados

FUNCIÓN mergeRemoteSongs(remoteSongs):
  SI remoteSongs no es array válido RETORNAR 0
  contador = 0
  PARA CADA song EN remoteSongs:
    local = AWAIT db.songs.get(song.id)
    SI (!local) O (song.updatedAt >= local.updatedAt):
      AWAIT db.songs.put({ ...song, syncSource: 'remote' })
      contador++
  RETORNAR contador

FUNCIÓN mergeRemoteOverrides(remoteOverrides):
  SI remoteOverrides no es array válido RETORNAR 0
  contador = 0
  PARA CADA ov EN remoteOverrides:
    local = AWAIT db.overrides.get(ov.id)
    SI (!local) O (ov.updatedAt >= local.updatedAt):
      AWAIT db.overrides.put({ ...ov, syncSource: 'remote' })
      contador++
  RETORNAR contador

FUNCIÓN syncGeneralCatalog(options?: { force?: boolean }):
  SI navegador offline: RETORNAR { status: 'offline', ... }
  ts = options?.force ? Date.now() : undefined

  // 1. Descargar sedes.json (opcional; si falla usa fallback local)
  respSedes = FETCH getRawFileUrl('catalog', 'sedes.json', ts)
  SI respSedes.ok Y es array de SedeProfile válido:
    Guardar en localStorage('app_lyrics_sedes_cache')

  // 2. Descargar catalog.json
  respCatalog = FETCH getRawFileUrl('catalog', 'catalog.json', ts)
  SI !respCatalog.ok: LANZAR Error("No se pudo descargar catálogo general")
  songs = await respCatalog.json()
  updatedCount = AWAIT mergeRemoteSongs(songs)
  Guardar timestamp en 'app_lyrics_last_sync'
  RETORNAR { status: 'synced', updatedSongs: updatedCount, sedes: ... }

FUNCIÓN syncSedeFromGitHub(sedeId, options?: { force?: boolean }):
  SI !sedeId O sedeId == 'general' RETORNAR { status: 'skipped' }
  SI navegador offline: RETORNAR { status: 'offline' }

  branch = getSedeBranch(sedeId)
  resp = FETCH getRawFileUrl(branch, 'overrides.json', ts)

  SI resp.status == 404:
    // La sede existe pero aún no tiene overrides publicados en Git
    Marcar sedeId en 'app_lyrics_synced_sedes'
    RETORNAR { status: 'synced', updatedOverrides: 0 }

  SI !resp.ok: LANZAR Error(...)
  overrides = await resp.json()
  updatedCount = AWAIT mergeRemoteOverrides(overrides)
  Marcar sedeId en 'app_lyrics_synced_sedes'
  RETORNAR { status: 'synced', updatedOverrides: updatedCount }
```

### 2.3 Resolución Segura y Fallback (`src/services/songResolver.ts`)
```text
FUNCIÓN resolveSongForDisplay(baseSong, activeSedeId, overrides, options?):
  targetSedeId = options?.expectedSedeId || activeSedeId
  SI !targetSedeId O targetSedeId == 'general': RETORNAR versión base sin aviso

  override = overrides.find(o => o.baseSongId == baseSong.id Y o.sedeId == targetSedeId)
  SI override:
    RETORNAR versión local con isLocalOverride = true

  // Si se pidió una sede externa/específica que NO está sincronizada aún:
  isSynced = options?.isSedeSynced ?? true
  fallbackNotice = !isSynced
    ? "Mostrando versión base del catálogo general (la adaptación de " + (options?.sedeLabel || targetSedeId) + " requiere conexión para sincronizarse)."
    : undefined

  RETORNAR { ...baseSong, isLocalOverride: false, fallbackNotice }
```

### 2.4 Flujo en `src/App.tsx`
```text
AL MONTAR App:
  1. initializeDatabase() -> carga semillas inmediatas en 0ms si IndexedDB está vacío
  2. Leer activeSedeId desde localStorage('app_lyrics_active_sede') || 'general'
  3. Si navigator.onLine:
       syncCatalogAndActiveSede(activeSedeId) en segundo plano (sin bloquear render)

AL CAMBIAR DE SEDE (handleSelectSede(newSedeId)):
  1. Guardar newSedeId en estado y localStorage
  2. Limpiar songSedeOverrideContext (si venía de un repertorio externo)
  3. Si newSedeId != 'general' Y online:
       AWAIT syncSedeFromGitHub(newSedeId)

AL IMPORTAR REPERTORIO POR URL (#repertorio=...):
  1. Descomprimir Setlist -> guardar en db.setlists
  2. SI importedSetlist.sedeId != 'general' Y online:
       AWAIT syncSedeFromGitHub(importedSetlist.sedeId)
       Mostrar notificación confirmando importación + variantes de esa sede
     SINO SI offline:
       Mostrar notificación confirmando importación (usará catálogo general si falta variante)

AL SELECCIONAR CANCIÓN DESDE SetlistManager:
  - Pasar (songId, setlist.sedeId) para que activeDisplaySong utilice la sede del repertorio
    y muestre fallbackNotice si esa sede externa aún no se sincronizó.
```

---

## 3. Impacto en Archivos

| Archivo | Estado | Rol y Cambios |
| :--- | :--- | :--- |
| `src/config/gitConfig.ts` | **Nuevo** | Configuración desacoplada del repositorio (`javtr/app_ipuc_lyrics`), mapeo `sedeId → rama`, generador de URLs `raw.githubusercontent.com`. |
| `src/services/gitSyncService.ts` | **Nuevo** | Servicio de lectura, validación JSON, merge no destructivo por `updatedAt` con Dexie y persistencia de sedes sincronizadas (`isSedeSynced`, `getSyncedSedes`). |
| `src/types/index.ts` | Modificado | Añadir `syncSource?: 'seed' \| 'remote' \| 'local'` en `BaseSong` y `SedeSongOverride`; añadir `fallbackNotice?: string` en `DisplaySong` y tipos `SyncStatus` / `SyncResult`. |
| `src/data/seedSongs.ts` | Modificado | Reemplazar `new Date().toISOString()` por timestamp constante `'2026-01-01T00:00:00.000Z'` en `SEED_SONGS` y `SEED_OVERRIDES`. |
| `src/services/songResolver.ts` | Modificado | Soportar parámetro opcional `options?: ResolveSongOptions` (`expectedSedeId`, `isSedeSynced`, `sedeLabel`) para emitir `fallbackNotice` sin romper llamadas existentes. |
| `src/components/SedeSelector.tsx` | Modificado | Recibir `sedes`, `syncStatus`, `lastSyncAt`, `onManualSync`; mostrar estado amigable de actualización y botón *"Actualizar cancionero"* (sin jerga Git). |
| `src/components/ReaderView.tsx` | Modificado | Mostrar alerta discreta si `song.fallbackNotice` está presente. |
| `src/components/MusicianView.tsx` | Modificado | Mostrar alerta discreta si `song.fallbackNotice` está presente. |
| `src/components/SetlistManager.tsx` | Modificado | Pasar `currentSetlist.sedeId` en `onSelectSong(songId, sedeId)` al abrir una canción desde un repertorio. |
| `src/App.tsx` | Modificado | Persistir `activeSedeId`, coordinar sincronización en arranque/online/cambio de sede/importación URL, gestionar contexto de sede del repertorio activo y pasar estado de sync a `SedeSelector`. |
| `tests/gitSyncService.test.ts` | **Nuevo** | Pruebas unitarias con `fetch` mockeado y base simulada/Dexie: mapeo de ramas, merge por fecha, manejo resiliente de `404`/offline, persistencia de `syncedSedes` y verificación de `fallbackNotice` en `resolveSongForDisplay`. |
| Ramas Git `catalog` y `sede/palestina` | **Nuevo (en Fase 2)** | Ramas huérfanas de datos en `javtr/app_ipuc_lyrics` con `sedes.json`, `catalog.json` (incluyendo una 4ª canción adicional para evidenciar la descarga real desde GitHub) y `overrides.json`. |

---

## 4. Ubicación Exacta de los Cambios

1. **`src/types/index.ts`**:
   - Líneas `10-20` (`BaseSong`): añadir `syncSource?: 'seed' | 'remote' | 'local';` después de `updatedAt`.
   - Líneas `22-31` (`SedeSongOverride`): añadir `syncSource?: 'seed' | 'remote' | 'local';` después de `updatedAt`.
   - Líneas `33-45` (`DisplaySong`): añadir `fallbackNotice?: string;` después de `originalSong`.
   - Líneas `78+` (final del archivo): añadir tipos `SyncStatus` y `SyncResult`.
2. **`src/data/seedSongs.ts`**:
   - Línea `12`, línea `57`, línea `91` y línea `129`: reemplazar `updatedAt: new Date().toISOString()` por constante `const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';`.
3. **`src/config/gitConfig.ts`** *(nuevo)*:
   - Líneas `1-35`: definir `GIT_CONFIG`, `getSedeBranch`, `getRawFileUrl`.
4. **`src/services/gitSyncService.ts`** *(nuevo)*:
   - Líneas `1-200`: implementar `getStoredSedes`, `getSyncedSedes`, `isSedeSynced`, `getLastSyncAt`, `syncGeneralCatalog`, `syncSedeFromGitHub`, `syncCatalogAndSede`.
5. **`src/services/songResolver.ts`**:
   - Líneas `8-63` (`resolveSongForDisplay`): añadir 4º parámetro opcional `options?: { expectedSedeId?: string; isSedeSynced?: boolean; sedeLabel?: string }` y lógica de `fallbackNotice` antes del `return` final en línea `52`.
6. **`src/components/SedeSelector.tsx`**:
   - Líneas `6-12` (`SedeSelectorProps`): añadir `sedesList?: SedeProfile[]`, `syncStatus?: SyncStatus`, `lastSyncAt?: string | null`, `onManualSync?: () => void`.
   - Líneas `20-29` (`SedeSelector`): inicializar/sincronizar estado `sedes` con `sedesList || SEDES_LIST`.
   - Líneas `142-155` (pie del modal): añadir bloque de actualización manual del cancionero y última hora de sincronización encima del botón *"Registrar nueva Sede"*.
7. **`src/components/ReaderView.tsx`**:
   - Líneas `190-196` (debajo del artista en cabecera): renderizar banner discreto ámbar si `song.fallbackNotice` existe.
8. **`src/components/MusicianView.tsx`**:
   - Líneas `325-338` (debajo de metadatos, junto a notas locales): renderizar banner discreto ámbar si `song.fallbackNotice` existe.
9. **`src/components/SetlistManager.tsx`**:
   - Línea `23` (`SetlistManagerProps`): cambiar firma `onSelectSong: (songId: string, sourceSedeId?: string) => void;`.
   - Línea `238` (botón del ítem en `currentSetlist.items.map`): llamar `onSelectSong(item.songId, currentSetlist.sedeId)`.
10. **`src/App.tsx`**:
    - Líneas `13-26`: importar funciones de `gitSyncService` y `SyncStatus`.
    - Línea `30`: inicializar `activeSedeId` desde `localStorage.getItem('app_lyrics_active_sede') || 'general'` y añadir estado `songContextSedeId`, `sedesList`, `syncStatus`, `lastSyncAt`.
    - Líneas `52-86` (`useEffect`): tras `initializeDatabase()`, ejecutar sincronización inicial si `navigator.onLine`; en `handleOnline`, re-sincronizar automáticamente; en `checkSharedUrl`, llamar `syncSedeFromGitHub(importedSetlist.sedeId)` si aplica.
    - Líneas `104-108` (`activeDisplaySong`): pasar `expectedSedeId`, `isSedeSynced`, `sedeLabel` a `resolveSongForDisplay`.
    - Líneas `168-174` (`SedeSelector`): conectar `onSelectSede` persistente + sincronización automática de la sede elegida, y pasar `sedesList`, `syncStatus`, `lastSyncAt`, `onManualSync`.
    - Líneas `358-362` (`SetlistManager` `onSelectSong`): guardar `sourceSedeId` en `songContextSedeId`.

---

## 5. Plan de Verificación (en Fase 2 tras aprobación)

1. **Pruebas Unitarias (`tests/gitSyncService.test.ts` + suite existente):**
   - Simular descarga exitosa de `catalog.json` y `sedes.json` -> verificar inserción en IndexedDB (usando almacenamiento en memoria / mocks limpios para tests Node sin `indexedDB` nativo si Vitest corre en Node).
   - Simular actualización remota con fecha mayor vs cambio local más reciente -> validar que nunca sobrescribe cambios locales más nuevos pero sí actualiza semillas antiguas (`2026-01-01`).
   - Simular sede sin overrides en Git (`404`) y modo offline -> validar resiliencia sin excepciones.
   - Validar `resolveSongForDisplay` con `expectedSedeId` no sincronizada -> verificar `fallbackNotice` y letra base intacta.
2. **Chequeo de Compilación y Pruebas Completas:**
   - `npx tsc --noEmit` (0 errores).
   - `npm test` (todas las suites y tests aprobados).
   - `npm run build` (build de producción Vite + PWA limpio).
3. **Verificación en Vivo contra GitHub Real:**
   - Confirmar que las ramas `catalog` y `sede/palestina` existen en `https://github.com/javtr/app_ipuc_lyrics` y que sus URLs `raw.githubusercontent.com` responden HTTP `200` con JSON válido.
