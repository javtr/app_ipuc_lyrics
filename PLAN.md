# Plan de Desarrollo — Optimización de Búsqueda (< 5 ms) y Paginación de 30 Canciones

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `src/` o `tests/`).

---

## 1. Objetivo Técnico

Eliminar la lentitud y el bloqueo al escribir en la barra de búsqueda con catálogos de **1,700+ canciones**, y evitar recorridos verticales interminables paginando la lista de canciones a un máximo de **30 canciones por página**:

1. **Pre-indexación en memoria (`useMemo` + `Map` O(1)):**
   - Actualmente `App.tsx` ejecuta en **cada pulsación de tecla** la resolución de sede `O(N × M)` sobre `overrides`, extrae acordes por regex de todas las estrofas de las 1,722 canciones para filtrar (`matchesSongTitleOrLyrics`) y para previsualizar la primera línea (`getSongOpeningLine`), ordena todo y renderiza 1,722 tarjetas DOM simultáneamente.
   - Con un índice pre-calculado **una sola vez** al cargar o cambiar `songs`, `overrides` o `activeSedeId`:
     - Las overrides de la sede activa se indexan en un `Map<baseSongId, SedeSongOverride>` (`O(1)`).
     - Se ordena el catálogo alfabéticamente en español **una sola vez**.
     - Se pre-calculan por canción: `openingLine`, `letter`, `normTitle` y `normLyrics` (limpio sin corchetes ChordPro y normalizado sin tildes).
     - Al escribir en el buscador (usando además `useDeferredValue(searchQuery)`), el filtrado compara únicamente cadenas ya normalizadas (`.includes(normalizedQuery)`) y prioriza coincidencias en título sobre coincidencias dentro de la letra, tardando **< 5 ms** sin bloquear el teclado.
2. **Paginación compacta (30 canciones por página) integrada con el índice `A–Z`:**
   - Mostrar máximo **`30` canciones por página** (`CATALOG_PAGE_SIZE = 30`), agrupadas bajo sus encabezados de letra (`A`, `B`, `C`, ...).
   - Al escribir en el buscador o cambiar de sede, reiniciar automáticamente a la **página 1**.
   - Añadir barra de paginación compacta (`Anterior` / `Pág. X de Y (inicio–fin de total)` / `Siguiente`) para desplazarse fácilmente y permitir llegar de inmediato a la barra inferior en móvil.
   - Conectar los botones del índice **`A–Z`**: al pulsar cualquier letra disponible (ej. `M`), calcular la página exacta donde inicia esa letra en el catálogo filtrado, cambiar a esa página y enfocar/desplazar suavemente hacia el encabezado de la letra (resaltando además qué letra(s) están visibles en la página actual).
   - Añadir botón `X` dentro del buscador para limpiar la consulta en 1 toque.
3. **Misma optimización en el buscador de Repertorios ([`SetlistManager.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/SetlistManager.tsx)):**
   - Memorizar (`useMemo`) la lista ordenada alfabéticamente y diferir `songSearchQuery` con `useDeferredValue` para mantener respuesta instantánea al armar cultos sobre miles de canciones.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Índice Memorizado y Paginación Pura (`src/services/songEditorHelper.ts`)

```ts
export const CATALOG_PAGE_SIZE = 30;

export interface IndexedCatalogItem {
  song: BaseSong;
  resolvedItem: DisplaySong;
  letter: string;
  openingLine: string;
  normTitle: string;
  normLyrics: string;
}

export function buildIndexedCatalog(
  songs: BaseSong[],
  activeSedeId: string,
  overrides: SedeSongOverride[],
  sedeLabel: string
): IndexedCatalogItem[] {
  // 1. Indexar overrides de activeSedeId en un Map O(1) por baseSongId
  const sedeOverrideMap = new Map<string, SedeSongOverride>();
  if (activeSedeId && activeSedeId !== 'general') {
    for (const ov of overrides) {
      if (ov.sedeId === activeSedeId) sedeOverrideMap.set(ov.baseSongId, ov);
    }
  }

  // 2. Filtrar visibles en sede y ordenar alfabéticamente UNA sola vez
  const visible = songs
    .filter(s => isSongVisibleInSede(s, activeSedeId))
    .sort((a, b) => compareSongTitlesEs(a.title, b.title));

  // 3. Pre-computar resolvedItem, openingLine, letter y strings normalizados de búsqueda
  return visible.map(song => {
    const ov = sedeOverrideMap.get(song.id);
    const resolvedItem = ov
      ? resolveSongForDisplay(song, activeSedeId, [ov], { sedeLabel })
      : resolveSongForDisplay(song, activeSedeId, [], { sedeLabel });
    const cleanLyrics = resolvedItem.sections
      .flatMap(sec => getCleanLyrics(sec.lines))
      .join(' ')
      .replace(/\s+/g, ' ');

    return {
      song,
      resolvedItem,
      letter: getSongInitialLetter(song.title),
      openingLine: getSongOpeningLine(resolvedItem.sections),
      normTitle: normalizeSearchText(`${song.title} ${resolvedItem.title}`).replace(/\s+/g, ' '),
      normLyrics: normalizeSearchText(cleanLyrics)
    };
  });
}

export function filterIndexedCatalog(
  indexedItems: IndexedCatalogItem[],
  query: string
): IndexedCatalogItem[] {
  const normQuery = normalizeSearchText(query).replace(/\s+/g, ' ');
  if (!normQuery) return indexedItems;

  const titleMatches: IndexedCatalogItem[] = [];
  const lyricsMatches: IndexedCatalogItem[] = [];

  for (const item of indexedItems) {
    if (item.normTitle.includes(normQuery)) titleMatches.push(item);
    else if (item.normLyrics.includes(normQuery)) lyricsMatches.push(item);
  }
  return [...titleMatches, ...lyricsMatches];
}

export function paginateCatalogItems(
  items: IndexedCatalogItem[],
  requestedPage: number,
  pageSize: number = CATALOG_PAGE_SIZE
): {
  pageItems: IndexedCatalogItem[];
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);
  return {
    pageItems,
    currentPage,
    totalPages,
    startIndex,
    endIndex: startIndex + pageItems.length
  };
}
```

### B. Flujo en `src/App.tsx` (Índice Reactivo, Salto de Página por Letra y Paginador)

```tsx
const [currentPage, setCurrentPage] = useState<number>(1);
const [pendingJumpLetter, setPendingJumpLetter] = useState<string | null>(null);
const deferredSearchQuery = useDeferredValue(searchQuery);

// 1. Pre-índice memoizado (se recalcula solo si cambian canciones, overrides o sede)
const indexedCatalog = useMemo(
  () => buildIndexedCatalog(songs, activeSedeId, overrides, currentSedeProfile.name),
  [songs, activeSedeId, overrides, currentSedeProfile.name]
);

// 2. Filtrado instantáneo sobre strings ya normalizados (< 5 ms)
const filteredCatalog = useMemo(
  () => filterIndexedCatalog(indexedCatalog, deferredSearchQuery),
  [indexedCatalog, deferredSearchQuery]
);

// Reiniciar a página 1 al cambiar búsqueda o sede
useEffect(() => {
  setCurrentPage(1);
}, [deferredSearchQuery, activeSedeId]);

// 3. Calcular páginas disponibles y primera página de cada letra
const { pageItems, currentPage: safePage, totalPages, startIndex, endIndex } = useMemo(
  () => paginateCatalogItems(filteredCatalog, currentPage, CATALOG_PAGE_SIZE),
  [filteredCatalog, currentPage]
);

const firstPageByLetter = useMemo(() => {
  const map = new Map<string, number>();
  filteredCatalog.forEach((item, idx) => {
    if (!map.has(item.letter)) {
      map.set(item.letter, Math.floor(idx / CATALOG_PAGE_SIZE) + 1);
    }
  });
  return map;
}, [filteredCatalog]);

// 4. Agrupar ÚNICAMENTE las <= 30 canciones de la página actual
const groupedPageCatalog = useMemo(
  () => groupEntriesAlphabetically(pageItems, item => item.song.title),
  [pageItems]
);

// 5. Al pulsar letra L en el índice A-Z:
const handleJumpToLetter = (letter: string) => {
  const targetPage = firstPageByLetter.get(letter);
  if (!targetPage) return;
  setCurrentPage(targetPage);
  setPendingJumpLetter(letter);
};

// Efecto post-render: cuando carga la página destino, hace scroll suave al encabezado de esa letra
useEffect(() => {
  if (!pendingJumpLetter) return;
  const el = letterSectionRefs.current[pendingJumpLetter];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPendingJumpLetter(null);
  }
}, [pendingJumpLetter, safePage, groupedPageCatalog]);
```

### C. Controles de UI Compactos (`src/App.tsx`)

1. **Barra de búsqueda:** añadir botón `X` cuando `searchQuery` no esté vacío y mostrar debajo un conteo discreto al buscar (ej. `"14 coincidencias"`).
2. **Barra `A–Z`:** usa `firstPageByLetter` (calculada sobre TODO `filteredCatalog`) y resalta las letras visibles actualmente en la página (`pageLetters`) en verde esmeralda.
3. **Paginador debajo (y resumen arriba si `totalPages > 1`):**
   - Muestra `Anterior` (deshabilitado en pág. 1), `Pág. {safePage} / {totalPages} · {startIndex + 1}–{endIndex} de {filteredCatalog.length}`, y `Siguiente` (deshabilitado en última pág.).
   - Al cambiar de página con `Anterior`/`Siguiente`, hace scroll suave al inicio del contenedor/catálogo (`catalogTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`).

---

## 3. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `src/services/songEditorHelper.ts` | `CATALOG_PAGE_SIZE`, `IndexedCatalogItem`, `buildIndexedCatalog`, `filterIndexedCatalog`, `paginateCatalogItems` | Nuevos helpers puros para pre-indexar, filtrar en memoria sin regex repetidos y paginar de 30 en 30. |
| `src/App.tsx` | `App` | Usar `useMemo` + `useDeferredValue`, renderizar máximo 30 canciones por página, conectar salto de página en `A–Z`, añadir botón limpiar `X` y controles de paginación. |
| `src/components/SetlistManager.tsx` | `SetlistManager` | Añadir `useMemo` + `useDeferredValue` sobre `selectableSongs` y `songSearchQuery` para búsqueda fluida en repertorios. |
| `tests/stabilization.test.ts` | Suite de estabilización | Añadir pruebas unitarias para `buildIndexedCatalog`, `filterIndexedCatalog` (prioridad título sobre letra + ChordPro limpio), `paginateCatalogItems` (30 por página) y cálculo de salto por letra entre páginas. |

---

## 4. Ubicación Exacta de Modificaciones

1. **[`src/services/songEditorHelper.ts`](file:///f:/Desarrollo/app_lyrics/src/services/songEditorHelper.ts#L1-L238):**
   - Línea 1–3: importar `DisplaySong`, `SedeSongOverride` desde `../types` y `resolveSongForDisplay`, `isSongVisibleInSede` desde `./songResolver`.
   - Al final del archivo (después de la línea 238): añadir `CATALOG_PAGE_SIZE = 30`, `IndexedCatalogItem`, `buildIndexedCatalog`, `filterIndexedCatalog` y `paginateCatalogItems`.
2. **[`src/App.tsx`](file:///f:/Desarrollo/app_lyrics/src/App.tsx#L1-L650):**
   - Líneas 1–24: importar `useMemo`, `useDeferredValue` de `react`; `ChevronLeft`, `ChevronRight`, `X` de `lucide-react`; y los nuevos helpers de `./services/songEditorHelper`.
   - Líneas 68–92: agregar estados `currentPage`, `pendingJumpLetter`, `deferredSearchQuery` y ref `catalogTopRef`.
   - Líneas 243–280: reemplazar cálculo no memoizado de `visibleSongs`/`catalogEntries`/`groupedCatalog` por `indexedCatalog` + `filteredCatalog` + `paginateCatalogItems` + `firstPageByLetter` + `groupedPageCatalog`.
   - Líneas 510–645: añadir botón limpiar `X` en el buscador, actualizar barra `A–Z` para saltar a la página de la letra, renderizar solo `groupedPageCatalog` (≤ 30 ítems usando el `openingLine` ya pre-calculado) y agregar barra de paginación debajo de la lista.
3. **[`src/components/SetlistManager.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/SetlistManager.tsx#L1-L120):**
   - Línea 1: importar `useMemo`, `useDeferredValue`.
   - Líneas 110–120: memoizar `selectableSongs` y diferir `songSearchQuery` antes de llamar `filterAndSortSongsByTitle`.
4. **[`tests/stabilization.test.ts`](file:///f:/Desarrollo/app_lyrics/tests/stabilization.test.ts#L12-L702):**
   - Importar `CATALOG_PAGE_SIZE`, `buildIndexedCatalog`, `filterIndexedCatalog`, `paginateCatalogItems` y añadir suite `[UX7]` probando búsqueda + paginación de 30 sobre un catálogo grande simulado (100 canciones).
