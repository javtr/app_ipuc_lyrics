# Plan de Desarrollo — Canciones Favoritas Locales (Offline-First y sin Requiere Sesión)

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `src/` o `tests/`).

---

## 1. Objetivo Técnico

Permitir que cualquier usuario (esté o no autenticado) guarde y consulte **canciones favoritas localmente en su dispositivo**, respetando la experiencia móvil/iPhone y el flujo visual actual:

1. **Persistencia local reactiva en IndexedDB (`Dexie v3`):**
   - Añadir la tabla `favorites: 'songId, addedAt'` en [`src/db/index.ts`](file:///f:/Desarrollo/app_lyrics/src/db/index.ts) (conservando intactas `version(1)` y `version(2)` para cero pérdida de datos) y el tipo `FavoriteSong` en [`src/types/index.ts`](file:///f:/Desarrollo/app_lyrics/src/types/index.ts).
   - Al ser 100% local en el navegador/PWA, no requiere contraseña, no consume cuota en la nube y funciona con o sin internet.
2. **Botón de Estrella + Ventana de Confirmación dentro de la Canción (`ReaderView` y `MusicianView`):**
   - En la barra superior de herramientas de [`ReaderView.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/ReaderView.tsx#L101-L125) (junto a `Proyección` y `Editar`) y [`MusicianView.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/MusicianView.tsx#L118-L157) (junto a `WakeLock`, `Proyección` y `Editar`), agregar un botón con el ícono de estrella (`<Star />`):
     - Vacía si aún no es favorita (`title="Agregar a favoritos"`).
     - Rellena en tono ámbar/dorado si ya está guardada (`title="Quitar de favoritos"`).
   - Al tocar la estrella, se despliega [`ConfirmDialogModal`](file:///f:/Desarrollo/app_lyrics/src/components/ConfirmDialogModal.tsx) (compatible 100% con iPhone Safari/PWA):
     - Si no es favorita: *"Agregar a favoritos"* — `"¿Agregar \"<Título>\" a tus canciones favoritas en este dispositivo?"` con botones **`Cancelar`** y **`Aceptar`**.
     - Si ya es favorita: *"Quitar de favoritos"* — `"¿Quitar \"<Título>\" de tus canciones favoritas en este dispositivo?"` con botones **`Cancelar`** y **`Aceptar`**.
3. **Acceso rápido de Favoritas a la izquierda de la letra `A` (`src/App.tsx`):**
   - En la barra del índice alfabético debajo del buscador ([`src/App.tsx`](file:///f:/Desarrollo/app_lyrics/src/App.tsx#L605-L635)), colocar **como primera opción a la izquierda de la letra `A`** el botón con ícono de **Estrella (`★`)**.
   - Al tocar esa estrella, se activa/desactiva el filtro **`showFavoritesOnly`** (reiniciando a página `1`):
     - Muestra exclusivamente las canciones guardadas en Favoritos (compatible con búsqueda por título/letra, índice `A–Z` y paginación de 30 en 30).
     - Si aún no hay favoritas guardadas, muestra un mensaje guía amigable con botón para volver a ver todo el catálogo.
     - En cada tarjeta del catálogo general, si la canción es favorita, mostrar una estrellita dorada discreta junto al título.

---

## 2. Pseudocódigo y Flujo Lógico

### A. Modelo y Base de Datos Local (`src/types/index.ts`, `src/db/index.ts`)

```ts
// En src/types/index.ts:
export interface FavoriteSong {
  songId: string;
  addedAt: string;
}

// En src/db/index.ts (LyricsDatabase):
favorites!: Table<FavoriteSong, string>;

this.version(3).stores({
  songs: 'id, title, originalKey, updatedAt',
  overrides: 'id, baseSongId, sedeId, [baseSongId+sedeId]',
  setlists: 'id, name, date, sedeId',
  suggestions: 'id, songId, createdAt',
  pendingSync: 'id, targetSedeId, createdAt',
  favorites: 'songId, addedAt'
});
```

### B. Variante `favorite` en `ConfirmDialogModal.tsx`

```tsx
variant?: 'danger' | 'warning' | 'favorite';

// Si variant === 'favorite':
// - Icono en cabecera: <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
// - Botón confirmar: estilo dorado/esmeralda amigable (text-slate-950 bg-amber-400 hover:bg-amber-300)
// - Sin icono de advertencia <AlertTriangle /> en el cuerpo del mensaje
```

### C. Botón Estrella en `ReaderView.tsx` y `MusicianView.tsx`

```tsx
interface ReaderViewProps / MusicianViewProps {
  ...
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

// En el grupo derecho de la barra superior de herramientas:
{onToggleFavorite && (
  <button
    type="button"
    onClick={onToggleFavorite}
    title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    className={isFavorite
      ? 'p-1.5 sm:p-2 bg-amber-950/60 border border-amber-500/60 text-amber-400 rounded-xl'
      : 'p-1.5 sm:p-2 bg-slate-950 border border-slate-700 text-slate-300 hover:text-amber-300 rounded-xl'
    }
  >
    <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
  </button>
)}
```

### D. Filtro de Favoritas y Confirmación en `src/App.tsx`

```tsx
const favorites = useLiveQuery(() => db.favorites.toArray()) || [];
const favoriteIds = useMemo(() => new Set(favorites.map(f => f.songId)), [favorites]);
const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
const [favoriteConfirmSong, setFavoriteConfirmSong] = useState<{
  id: string;
  title: string;
  isCurrentlyFavorite: boolean;
} | null>(null);

// Filtrado base antes de buscar/paginar:
const baseCatalogPool = useMemo(() => {
  if (!showFavoritesOnly) return indexedCatalog;
  return indexedCatalog.filter(item => favoriteIds.has(item.song.id));
}, [indexedCatalog, showFavoritesOnly, favoriteIds]);

const filteredCatalog = useMemo(
  () => filterIndexedCatalog(baseCatalogPool, deferredSearchQuery),
  [baseCatalogPool, deferredSearchQuery]
);

// En useEffect al cambiar deferredSearchQuery, activeSedeId o showFavoritesOnly:
setCurrentPage(1);
setPendingJumpLetter(null);

// En barra del índice alfabético (si indexedCatalog.length > 0 || showFavoritesOnly):
// Primer elemento a la izquierda de la 'A':
<button
  type="button"
  onClick={() => setShowFavoritesOnly(prev => !prev)}
  aria-pressed={showFavoritesOnly}
  aria-label={showFavoritesOnly ? 'Ver todas las canciones' : 'Ver canciones favoritas'}
  title={showFavoritesOnly ? 'Mostrando favoritas (toca para ver todas)' : `Ver favoritas (${favoriteIds.size})`}
  className={showFavoritesOnly ? 'dorado activo' : 'oscuro con estrella'}
>
  <Star ... />
</button>
// Seguido inmediatamente de las letras 'A'..'Z'

// Confirmar agregar/quitar favorito:
const handleConfirmFavoriteToggle = async () => {
  if (!favoriteConfirmSong) return;
  if (favoriteConfirmSong.isCurrentlyFavorite) {
    await db.favorites.delete(favoriteConfirmSong.id);
  } else {
    await db.favorites.put({
      songId: favoriteConfirmSong.id,
      addedAt: new Date().toISOString()
    });
  }
  setFavoriteConfirmSong(null);
};

<ConfirmDialogModal
  isOpen={Boolean(favoriteConfirmSong)}
  title={favoriteConfirmSong?.isCurrentlyFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
  message={
    favoriteConfirmSong?.isCurrentlyFavorite
      ? `¿Quitar "${favoriteConfirmSong.title}" de tus canciones favoritas en este dispositivo?`
      : `¿Agregar "${favoriteConfirmSong?.title || ''}" a tus canciones favoritas en este dispositivo?`
  }
  confirmLabel="Aceptar"
  cancelLabel="Cancelar"
  variant="favorite"
  onCancel={() => setFavoriteConfirmSong(null)}
  onConfirm={handleConfirmFavoriteToggle}
/>
```

---

## 3. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `src/types/index.ts` | `FavoriteSong` | Nuevo tipo para el registro local de favoritos. |
| `src/db/index.ts` | `LyricsDatabase` | Añadir `version(3)` con tabla `favorites: 'songId, addedAt'`. |
| `src/components/ConfirmDialogModal.tsx` | `ConfirmDialogModal` | Añadir `variant?: 'danger' \| 'warning' \| 'favorite'` con ícono `<Star />` y botón de aceptación limpio. |
| `src/components/ReaderView.tsx` | `ReaderView` | Añadir props `isFavorite`, `onToggleFavorite` y botón `<Star />` en la barra superior de la canción. |
| `src/components/MusicianView.tsx` | `MusicianView` | Añadir props `isFavorite`, `onToggleFavorite` y botón `<Star />` en la barra superior de la canción. |
| `src/App.tsx` | `App` | Suscripción reactiva `db.favorites`, filtro `showFavoritesOnly`, botón `<Star />` a la izquierda de `A`, estrellita en tarjetas favoritas, y `<ConfirmDialogModal />` (`Aceptar` / `Cancelar`). |
| `tests/stabilization.test.ts` | Suite de estabilización | Pruebas unitarias para botón estrella en `ReaderView` y `MusicianView` (marcada vs vacía) y variante `'favorite'` en `ConfirmDialogModal`. |

---

## 4. Ubicación Exacta de Modificaciones

1. **[`src/types/index.ts`](file:///f:/Desarrollo/app_lyrics/src/types/index.ts#L114-L122):**
   - Al final del archivo (después de línea 122), exportar `interface FavoriteSong { songId: string; addedAt: string; }`.
2. **[`src/db/index.ts`](file:///f:/Desarrollo/app_lyrics/src/db/index.ts#L1-L36):**
   - Líneas 1–17: importar `FavoriteSong` y declarar `favorites!: Table<FavoriteSong, string>;` en `LyricsDatabase`.
   - Después de la línea 32 (`this.version(2)`): añadir `this.version(3).stores({ ..., favorites: 'songId, addedAt' });`.
3. **[`src/components/ConfirmDialogModal.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/ConfirmDialogModal.tsx#L1-L116):**
   - Ampliar `variant` a `'danger' | 'warning' | 'favorite'`, importar `Star` de `lucide-react` y renderizar estilo dorado sin `AlertTriangle` para `'favorite'`.
4. **[`src/components/ReaderView.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/ReaderView.tsx#L1-L125):**
   - Importar `Star`; añadir `isFavorite?: boolean` y `onToggleFavorite?: () => void` en `ReaderViewProps`; renderizar botón `<Star />` en el grupo derecho de la barra superior (entre `Proyección` y `Editar`, líneas 102–124).
5. **[`src/components/MusicianView.tsx`](file:///f:/Desarrollo/app_lyrics/src/components/MusicianView.tsx#L1-L158):**
   - Importar `Star`; añadir `isFavorite?: boolean` y `onToggleFavorite?: () => void` en `MusicianViewProps`; renderizar botón `<Star />` en el grupo derecho de la barra superior (entre `Proyección` y `Editar`, líneas 135–157).
6. **[`src/App.tsx`](file:///f:/Desarrollo/app_lyrics/src/App.tsx#L68-L870):**
   - Importar `Star` de `lucide-react` y `ConfirmDialogModal`.
   - Junto a `pendingSyncItems` (línea 241), añadir `favorites = useLiveQuery(() => db.favorites.toArray()) || []`, `favoriteIds`, `showFavoritesOnly` y `favoriteConfirmSong`.
   - En el pipeline de filtrado (líneas 254–290), filtrar por `favoriteIds` cuando `showFavoritesOnly` esté activo.
   - En la fila del índice alfabético (línea 606), mostrar el botón `<Star />` como primer elemento a la izquierda de `A`, seguido por las letras `A..Z`, y adaptar el estado vacío cuando `showFavoritesOnly` no tenga favoritas aún.
   - En las tarjetas de canciones (línea 665), mostrar estrellita discreta si `favoriteIds.has(song.id)`.
   - En `<MusicianView>` y `<ReaderView>` (alrededor de las líneas 825–855), pasar `isFavorite` y `onToggleFavorite`, y montar `<ConfirmDialogModal />` para confirmar agregar/quitar de favoritos.
7. **[`tests/stabilization.test.ts`](file:///f:/Desarrollo/app_lyrics/tests/stabilization.test.ts#L750-L785):**
   - Al final de la suite, añadir prueba `[UX9]` validando botón estrella en `ReaderView` y `MusicianView` y variante `'favorite'` (`Aceptar` / `Cancelar`) en `ConfirmDialogModal`.
