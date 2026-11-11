# Plan de Desarrollo — Aislamiento de Canciones por Sede, Barra Única de Canción y Navegación de Repertorios

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `src/` o `tests/`).

---

## 1. Objetivo Técnico

Resolver seis fallos y mejoras de experiencia detectadas durante las pruebas en móvil y escritorio:

1. **Aislamiento estricto de canciones creadas en una sede:**
   - Hoy, al crear una canción estando en `Sede Palestina`, `SongEditorModal.handleSave` guarda la canción en `db.songs` sin campo de propiedad de sede (`sedeId`), además de crear un `override`. Como `App.tsx` (`catalogEntries`) y `SetlistManager.tsx` (selector de canciones) listan todo `db.songs`, esa canción se filtra al `Catálogo General` y a otras sedes como `Sede Central`.
   - **Solución:** Añadir `sedeId?: string` y `notes?: string` a `BaseSong`, filtrar visibilidad con una función pura compartida `isSongVisibleInSede(song, targetSedeId)`, guardar canciones nuevas/propias de sede directamente en `db.songs` con su `sedeId` (sin crear overrides artificiales con sufijo de sede), y ejecutar una migración automática idempotente en `initializeDatabase()` para aislar canciones locales huérfanas ya creadas en una sola sede (como la canción de prueba existente).

2. **Barra de herramientas en una sola fila (Músico y Lector) en móvil:**
   - Hoy `MusicianView` usa `flex-wrap`, generando dos filas en pantallas angostas al acumular etiqueta de tono, ícono musical, transposición, tamaño de fuente, WakeLock, Proyección y Edición.
   - **Solución:** Eliminar la etiqueta `Tono: X` (con su ícono de nota musical `<Music2 />`) y los botones de semitono de `MusicianView`, compactar botones (`flex-nowrap`, paddings y ocultar textos largos bajo `sm` con `hidden sm:inline`), asegurando una sola fila horizontal tanto en `MusicianView` como en `ReaderView`.

3. **Trasladar controles `-` / `+` de semitonos de `MusicianView` al Editor (`SongEditorModal`):**
   - Los ajustes de transposición manual (`-1` / `+1` semitono) pertenecen únicamente al momento de editar la canción y guardar su tonalidad real junto con sus acordes transpuestos.
   - **Solución:** Retirar `-`, `↺` y `+` de `MusicianView` (manteniendo internamente la transposición automática de lectura cuando un ítem de repertorio solicita un `expectedKey` distinto al tono guardado) e integrar botones compactos `-` / `+` junto al selector de `Tono` dentro de `SongEditorModal`.

4. **Eliminar etiqueta superior `"Tono: X"` en `MusicianView`:**
   - Suprimir el badge superior con `<Music2 />` y `Tono: ...`, ya que la cabecera debajo del título ya informa `"Tono guardado: X"` / `"Tono en sede: X"` (y en repertorio con tonalidad personalizada, `"Tono repertorio: X"`).

5. **Control unificado de navegación de Repertorio de 3 funciones (`< | Repertorio | >`):**
   - Al abrir una canción desde un repertorio:
     - Botón izquierdo (`ChevronLeft`): navega a la canción anterior del mismo repertorio (deshabilitado si está en la primera).
     - Botón central (`Repertorio`): regresa directamente a la vista de `Repertorios` manteniendo seleccionado ese repertorio activo.
     - Botón derecho (`ChevronRight`): navega a la siguiente canción del mismo repertorio (deshabilitado si está en la última).

6. **Ubicación del control de Repertorio inmediatamente a la derecha de `A- / A+`:**
   - Extraer un componente reutilizable `SetlistNavControls` e insertarlo en `MusicianView` y `ReaderView` justo a la derecha del bloque `A- / A+` dentro de la misma fila única superior.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Aislamiento por Sede y Migración Automática
```ts
// src/types/index.ts
interface BaseSong {
  // ...campos existentes
  sedeId?: string; // undefined o 'general' => catálogo público; 'sede-...' => exclusiva de esa sede
  notes?: string;  // notas locales para canciones exclusivas de sede
}

// src/services/songResolver.ts
function isSongVisibleInSede(song: BaseSong, targetSedeId: string): boolean {
  if (!song.sedeId || song.sedeId === 'general') {
    return true;
  }
  return song.sedeId === targetSedeId;
}

function toBaseDisplaySong(baseSong: BaseSong, fallbackNotice?: string): DisplaySong {
  return {
    // ...campos existentes
    notes: baseSong.notes,
    sedeId: baseSong.sedeId,
    isLocalOverride: false,
    originalSong: baseSong,
    fallbackNotice
  };
}
```

```ts
// src/db/index.ts — dentro de initializeDatabase()
async function migrateLegacySedeSongs(): Promise<void> {
  const allSongs = await db.songs.toArray();
  const allOverrides = await db.overrides.toArray();
  const seedIds = new Set(SEED_SONGS.map(s => s.id));

  for (const song of allSongs) {
    if (song.syncSource !== 'local' || song.sedeId || seedIds.has(song.id)) continue;

    const matchingOverrides = allOverrides.filter(
      o => o.baseSongId === song.id && o.sedeId && o.sedeId !== 'general'
    );
    const uniqueSedes = [...new Set(matchingOverrides.map(o => o.sedeId))];

    if (uniqueSedes.length === 1) {
      const ownerSede = uniqueSedes[0];
      const ov = matchingOverrides[0];
      await db.songs.put({
        ...song,
        originalKey: ov.customKey || song.originalKey,
        sections: ov.customSections?.length ? ov.customSections : song.sections,
        notes: song.notes || ov.localNotes,
        sedeId: ownerSede
      });
      await db.overrides.delete(ov.id);
    }
  }
}
```

```ts
// src/components/SongEditorModal.tsx — handleSave
const isSedeExclusiveSong = Boolean(
  activeSedeId !== 'general' && (!initialSong || initialSong.sedeId === activeSedeId)
);

const baseSongData: BaseSong = {
  id: songId,
  title: cleanTitle,
  artist: initialSong?.artist,
  originalKey: effectiveKey,
  bpm: isMusicianMode && typeof bpm === 'number' ? bpm : initialSong?.bpm,
  timeSignature: isMusicianMode ? timeSignature : (initialSong?.timeSignature || '4/4'),
  sections,
  tags: initialSong?.tags,
  notes: isSedeExclusiveSong ? (localNotes.trim() || undefined) : initialSong?.notes,
  sedeId: isSedeExclusiveSong ? activeSedeId : initialSong?.sedeId,
  updatedAt: nowIso,
  syncSource: initialSong?.syncSource || 'local'
};

if (!isSedeExclusiveSong && activeSedeId !== 'general') {
  // Edición local de una canción del Catálogo General para esta sede => solo escribir en db.overrides
  await db.overrides.put(override);
} else {
  // Canción del Catálogo General (super admin) o canción exclusiva de una sede => guardar en db.songs
  await db.songs.put(baseSongData);
  if (isSedeExclusiveSong) {
    await db.overrides.delete(`${songId}_${activeSedeId}`);
  }
}
```

```text
Flujo de visibilidad:
1. App.tsx filtra `songs` con `isSongVisibleInSede(song, activeSedeId)` -> `visibleSongs`.
2. `catalogEntries` solo mapea `visibleSongs`.
3. `handleSelectSede(nextSedeId)`: limpia `setlistNavContext`, `songContextSedeId` y `selectedItemKey`; si la canción abierta (`selectedSongId`) pertenece a otra sede (`!isSongVisibleInSede(currentSong, nextSedeId)`), reinicia selección al primer canto visible de `nextSedeId` y vuelve a `'list'` en móvil para evitar falsos avisos de "canción sin descargar".
4. SetlistManager.tsx filtra `songs` por `isSongVisibleInSede(song, effectiveListSedeId)` para poblar el selector "Agregar Canción al Culto".
```

### B. Controles de Semitono `-` / `+` en `SongEditorModal`
```ts
// src/components/SongEditorModal.tsx
const handleStepKeySemitone = (delta: number) => {
  const nextKey = transposeChord(originalKey, delta);
  setRawText(prev => transposeChordProText(prev, delta));
  setOriginalKey(nextKey);
};

// Render junto al selector de tonalidad (una sola cajita compacta [ - | <select> | + ]):
<div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden focus-within:border-emerald-500">
  <button type="button" onClick={() => handleStepKeySemitone(-1)} aria-label="Bajar medio tono">
    <Minus />
  </button>
  <select value={originalKey} onChange={e => handleOriginalKeyChange(e.target.value)}>
    {availableKeyOptions.map(...)}
  </select>
  <button type="button" onClick={() => handleStepKeySemitone(1)} aria-label="Subir medio tono">
    <Plus />
  </button>
</div>
```

### C. Barra Superior en 1 Fila + Navegación de Repertorio (`< | Repertorio | >`)
```tsx
// src/components/SetlistNavControls.tsx (nuevo componente compartido)
export interface SetlistNavProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReturnToSetlist: () => void;
}

function SetlistNavControls({ canPrev, canNext, onPrev, onNext, onReturnToSetlist }: SetlistNavProps) {
  return (
    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0">
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Canción anterior del repertorio">
        <ChevronLeft />
      </button>
      <button type="button" onClick={onReturnToSetlist} title="Volver al repertorio">
        Repertorio
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label="Siguiente canción del repertorio">
        <ChevronRight />
      </button>
    </div>
  );
}
```

```tsx
// Estructura unificada en MusicianView y ReaderView (barra sticky en 1 sola fila):
<div className="sticky top-2 z-30 ... flex items-center justify-between gap-1.5 sm:gap-2 flex-nowrap">
  {/* Grupo Izquierdo: Tamaño de Letra + (si viene de repertorio) [< | Repertorio | >] */}
  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
    <div className="...">[A-] [Type] [A+]</div>
    {setlistNav && <SetlistNavControls {...setlistNav} />}
  </div>

  {/* Grupo Derecho: WakeLock (solo MusicianView, solo ícono en móvil) + Proyección (ícono en móvil) + Editar (solo ícono) */}
  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
    ...
  </div>
</div>
```

```ts
// src/App.tsx — Contexto y navegación de Repertorio
const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
const [setlistNavContext, setSetlistNavContext] = useState<{ setlistId: string; itemIndex: number } | null>(null);

// Al abrir canción desde SetlistManager.onSelectSong(songId, sourceSedeId, itemKey, ctx):
if (ctx) {
  setSelectedSetlistId(ctx.setlistId);
  setSetlistNavContext(ctx);
}

// Navegación < y >:
function navigateToSetlistIndex(targetIndex: number) {
  if (!activeNavSetlist) return;
  const targetItem = activeNavSetlist.items[targetIndex];
  if (!targetItem) return;
  setSelectedSongId(targetItem.songId);
  setIsExplicitSongSelection(true);
  setSongContextSedeId(activeNavSetlist.sedeId || null);
  setSelectedItemKey(targetItem.key || null);
  setSetlistNavContext({ setlistId: activeNavSetlist.id, itemIndex: targetIndex });
  setMobileView('detail');
}

// Al presionar "Repertorio":
onReturnToSetlist: () => {
  setSelectedSetlistId(activeNavSetlist.id);
  setActiveTab('setlists');
}

// Al seleccionar una canción desde el catálogo, o pulsar tab Cancionero / Canciones, o cambiar sede:
setSetlistNavContext(null);
```

---

## 3. Impacto

| Archivo / Módulo | Tipo / Clase / Método afectado | Cambio |
| --- | --- | --- |
| `src/types/index.ts` | `BaseSong` | Añadir `sedeId?: string` y `notes?: string` |
| `src/services/songResolver.ts` | `isSongVisibleInSede`, `toBaseDisplaySong`, `resolveAllSongsForDisplay` | Nueva función `isSongVisibleInSede`; propagar `notes`/`sedeId`; filtrar lista resuelta por sede |
| `src/db/index.ts` | `migrateLegacySedeSongs`, `initializeDatabase` | Migración idempotente que asigna `sedeId` a canciones locales huérfanas con un único override de sede |
| `src/components/SetlistNavControls.tsx` | `SetlistNavControls`, `SetlistNavProps` *(Nuevo)* | Control compartido `[ < | Repertorio | > ]` |
| `src/components/MusicianView.tsx` | `MusicianViewProps`, `MusicianView` | Recibir `setlistNav?: SetlistNavProps`; quitar pill `Tono:`, `- / ↺ / +` y imports sin uso; mantener transposición derivada por `expectedKey` e indicar `Tono en repertorio` en cabecera si difiere; barra en `flex-nowrap` de 1 fila con `SetlistNavControls` a la derecha de `A-/A+` |
| `src/components/ReaderView.tsx` | `ReaderViewProps`, `ReaderView` | Recibir `setlistNav?: SetlistNavProps`; insertar `SetlistNavControls` a la derecha de `A-/A+` en fila única `flex-nowrap` |
| `src/components/SongEditorModal.tsx` | `SongEditorModal` (`handleStepKeySemitone`, `handleSave`, UI tonalidad) | Añadir botones `-` / `+` de semitono junto al selector `Tono`; guardar canciones nuevas o propias de sede directo en `db.songs` con `sedeId` y `notes` sin fugarse a `general` |
| `src/components/SetlistManager.tsx` | `SetlistManagerProps`, `SetlistManager` | Soporte opcional controlado `selectedSetlistId` / `onSelectSetlistId`; pasar `{ setlistId, itemIndex }` en `onSelectSong`; filtrar selector inferior de canciones con `isSongVisibleInSede` |
| `src/App.tsx` | `App` (`handleSelectSede`, `catalogEntries`, `openEditorForActiveSong`, `SetlistManager`, `MusicianView`, `ReaderView`) | Estado `selectedSetlistId` y `setlistNavContext`; filtrado por `isSongVisibleInSede` en catálogo y selección efectiva; preservar `sedeId`/`notes` al editar |
| `tests/stabilization.test.ts` | Suites `[C2]`, `[E2]`, nuevas pruebas unitarias | Actualizar aserciones de `MusicianView` (sin `Bajar medio tono` / `Tono:`); cubrir aislamiento `isSongVisibleInSede`, migración en BD, botones `- / +` del editor y control `SetlistNavControls` en `ReaderView` / `MusicianView` |

---

## 4. Ubicación Exacta

1. **`src/types/index.ts`**
   - Interface `BaseSong` (**líneas 22-33**): insertar `sedeId?: string;` y `notes?: string;` antes de `updatedAt: string;` (línea 31).

2. **`src/services/songResolver.ts`**
   - Función `toBaseDisplaySong` (**líneas 10-23**): incluir `notes: baseSong.notes,` y `sedeId: baseSong.sedeId,` en el objeto retornado (después de `sections: baseSong.sections,`, línea 18).
   - Entre **líneas 23 y 25**: insertar y exportar `isSongVisibleInSede(song: BaseSong, targetSedeId: string): boolean`.
   - Función `resolveAllSongsForDisplay` (**líneas 89-95**): filtrar `baseSongs.filter(song => isSongVisibleInSede(song, activeSedeId)).map(...)`.

3. **`src/db/index.ts`**
   - Función `initializeDatabase` (**líneas 24-34**): después del bloque `if (overrideCount === 0)` (línea 33), invocar `await migrateLegacySedeSongs();` implementada encima de `initializeDatabase`.

4. **`src/components/SetlistNavControls.tsx`** *(archivo nuevo)*
   - Exportar `SetlistNavProps` y `SetlistNavControls`.

5. **`src/components/MusicianView.tsx`**
   - Imports (**líneas 1-15**): retirar `useEffect`, `Music2`, `Minus`, `Plus`, `RotateCcw`; (**líneas 17-21**): retirar `transposeChord`; importar `SetlistNavControls, SetlistNavProps` desde `./SetlistNavControls`.
   - Interface `MusicianViewProps` (**líneas 27-34**): agregar `setlistNav?: SetlistNavProps;`.
   - Estado/cuerpo inicial (**líneas 46-68**): reemplazar `transposeOffset` (`useState`/`useEffect`) y `currentDisplayKey` por `const transposeOffset = expectedKey ? getSemitoneDifference(song.key, expectedKey) : 0;`.
   - Barra superior (**líneas 97-201**):
     - Reemplazar `flex-wrap` y padding en línea 97 por `p-2 sm:p-3.5 mb-4 sm:mb-6 shadow-xl flex items-center justify-between gap-1.5 sm:gap-2 flex-nowrap`.
     - Eliminar completamente los bloques de `Tono: {currentDisplayKey}` y botones `- / ↺ / +` (**líneas 98-137**).
     - Envolver ajuste `A- / A+` (**líneas 141-162**) + `{setlistNav && <SetlistNavControls {...setlistNav} />}` dentro del grupo izquierdo `flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0`.
     - En el grupo derecho (**líneas 164-200**), compactar gap/padding (`gap-1 sm:gap-2 shrink-0`, `Proyección` en `p-1.5 sm:px-2.5 sm:py-1.5` e ícono + texto `hidden sm:inline`).
   - Cabecera de tonalidad (**líneas 221-228**): mostrar `Tono en repertorio: {expectedKey}` si `expectedKey && expectedKey !== song.key`, junto a `Tono en sede` / `Tono guardado`.

6. **`src/components/ReaderView.tsx`**
   - Imports (**líneas 1-13**): importar `SetlistNavControls, SetlistNavProps` desde `./SetlistNavControls`.
   - Interface `ReaderViewProps` (**líneas 14-20**): agregar `setlistNav?: SetlistNavProps;`.
   - Desestructuración de props (**líneas 32-38**): incluir `setlistNav`.
   - Barra superior (**líneas 69-117**):
     - Asegurar `flex-nowrap` y `gap-1.5 sm:gap-2` en línea 69.
     - Envolver los controles `A- / A+` (**líneas 71-91**) junto con `{setlistNav && <SetlistNavControls {...setlistNav} />}` en `<div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">`.

7. **`src/components/SongEditorModal.tsx`**
   - Imports (**líneas 3-11**): añadir `Minus, Plus` desde `lucide-react`; (**líneas 14-18**): añadir `transposeChord` desde `../services/chordParser`.
   - Derivado antes de `canRestoreOverride` (**líneas 168-177**): definir `isSedeExclusiveSong = Boolean(activeSedeId !== 'general' && (!initialSong || initialSong.sedeId === activeSedeId))` y exigir `!isSedeExclusiveSong` dentro de `canRestoreOverride`.
   - Junto a `handleOriginalKeyChange` (**líneas 180-186**): agregar `handleStepKeySemitone(delta: number)`.
   - Método `handleSave` (**líneas 218-261**): asignar `sedeId` y `notes` en `baseSongData` y bifurcar entre `(!isSedeExclusiveSong && activeSedeId !== 'general')` (solo `db.overrides.put`) y guardado directo en `db.songs.put(baseSongData)` cuando la canción es exclusiva de la sede o del catálogo general.
   - Selector de Tono (**líneas 349-362**): envolver `<select>` con botones `-` (`handleStepKeySemitone(-1)`) y `+` (`handleStepKeySemitone(1)`).

8. **`src/components/SetlistManager.tsx`**
   - Imports (**línea 23**): importar `isSongVisibleInSede` desde `../services/songResolver`.
   - `SetlistManagerProps` (**líneas 26-36**): actualizar firma de `onSelectSong` a `(songId: string, sourceSedeId?: string, itemKey?: string, setlistContext?: { setlistId: string; itemIndex: number }) => void;` y añadir `selectedSetlistId?: string | null;` y `onSelectSetlistId?: (setlistId: string | null) => void;`.
   - Estado `activeSetlistId` (**líneas 49-51**): sincronizar con prop opcional `selectedSetlistId`/`onSelectSetlistId`.
   - Lista filtrable de canciones para agregar (**líneas 57, 84-96, 433-452**): derivar `selectableSongs = songs.filter(s => isSongVisibleInSede(s, effectiveListSedeId))` y usarla en inicialización de `selectedSongToAdd` y opciones del `<select>`.
   - Botón del ítem en lista (**línea 379**): pasar cuarto argumento `{ setlistId: currentSetlist.id, itemIndex: idx }` a `onSelectSong`.

9. **`src/App.tsx`**
   - Imports (**línea 17**): importar `isSongVisibleInSede` desde `./services/songResolver`; importar `SetlistNavProps` desde `./components/SetlistNavControls`.
   - Estados en `App` (**líneas 48-52**): añadir `selectedSetlistId` y `setlistNavContext`.
   - `handleSelectSede` (**líneas 99-112**): limpiar `setSetlistNavContext(null)` y si la canción activa (`selectedSongId`) no es visible en `nextSedeId`, restablecer selección a una canción visible y `setMobileView('list')`.
   - Derivados del catálogo (**líneas 197-221**): calcular `visibleSongs = songs.filter(s => isSongVisibleInSede(s, activeSedeId))` para `catalogEntries`, y `effectiveSongs = songs.filter(s => isSongVisibleInSede(s, effectiveSedeId))` para `foundSelectedSong` / `activeBaseSong`. Construir `activeNavSetlist`, `navigateToSetlistIndex` y `setlistNav`.
   - `openEditorForActiveSong` (**líneas 231-243**): copiar `sedeId: activeBaseSong.sedeId` y `notes: activeDisplaySong.notes` en `editableSong`.
   - Limpieza de `setlistNavContext` al cambiar a catálogo o pulsar canción del catálogo (**líneas 278-283, 317-321, 420-426, 500-510, 575-582**).
   - Props de `<MusicianView>` y `<ReaderView>` (**líneas 523-539**): pasar `setlistNav={setlistNav}`.
   - Props de `<SetlistManager>` (**líneas 551-568**): pasar `selectedSetlistId`, `onSelectSetlistId` y actualizar `onSelectSong` para guardar `setlistNavContext`.

10. **`tests/stabilization.test.ts`**
    - Prueba `[C2]` (**líneas 129-172**): adaptar expectativas tras retirar `Tono:` pill y botones de semitono de `MusicianView`; validar que `expectedKey="A"` sigue transponiendo acordes renderizados y que `SetlistNavControls` renderiza `[ < | Repertorio | > ]`.
    - Prueba `[E2]` (**líneas 348-375**): verificar que `ReaderView` acepta `setlistNav` e incluye el botón central `Repertorio` junto a los botones anterior/siguiente en barra `flex-nowrap`.
    - Nuevas pruebas en `tests/stabilization.test.ts`:
      - Verificar `isSongVisibleInSede` y que `SongEditorModal` al guardar una canción nueva en `sede-palestina` asigna `sedeId: 'sede-palestina'` en `db.songs` sin filtrarse a `general` ni `sede-central`, más migración en `initializeDatabase()`.
      - Verificar botones `-` / `+` de semitono (`Bajar medio tono` / `Subir medio tono`) en `SongEditorModal`.

---

## 5. Verificación Planificada (en Fase 2, tras aprobación)

1. `npx tsc --noEmit` (verificar compilación TypeScript estricta sin variables/imports sin uso).
2. `npm test` (ejecutar Vitest con toda la suite de estabilización + casos nuevos).
3. `npm run build` (verificar empaquetado Vite de producción).
