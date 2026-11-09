# Plan de Desarrollo Activo: Producto Mínimo Viable (MVP)

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico del MVP

El objetivo de este **Producto Mínimo Viable (MVP)** es validar de forma práctica e interactiva la **arquitectura técnica completa** discutida, demostrando que todos los pilares funcionan de forma coordinada antes de expandir el proyecto:

1. **Persistencia Local y Resiliencia Offline (IndexedDB + Dexie):**
   - Precarga automática de un catálogo inicial de canciones base sin depender de conexión.
   - Funcionamiento garantizado aunque el navegador pierda internet.
2. **Motor de Catálogo Base vs. Versiones de Sede (Resolución de Variantes):**
   - Demostrar cómo una canción base (ej. *Sublime Gracia*) coexiste con una versión personalizada de sede (ej. *Sublime Gracia - Sede Palestina*) sin modificar ni corromper el catálogo general.
3. **Doble Vista Especializada (Músicos vs. Proyección):**
   - **Vista Músicos:** Renderizado de acordes sobre la letra con transposición en tiempo real ($\pm 1$ semitono).
   - **Vista Proyección:** Extracción automática de solo la letra limpia en modo pantalla completa, alto contraste y diapositivas por sección.
4. **Distribución de Repertorio sin Servidor (Compresión de URL para WhatsApp):**
   - Armar un repertorio de culto (ej. 3 canciones) y generar un enlace comprimido en el hash (`#repertorio=...`) que cualquier otro usuario o dispositivo pueda abrir e importar directamente a su almacenamiento local.
5. **Autenticación Ultraligera de Sede:**
   - Acceso con contraseña para el perfil de sede que desbloquea la capacidad de crear versiones locales y armar repertorios.
6. **Formulario de Sugerencia de Correcciones:**
   - Modal para reportar erratas o correcciones a las canciones base generales.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Modelo de Datos en TypeScript (`src/types/index.ts`)
```typescript
// Estructura de una sección de canción (ChordPro)
interface SongSection {
  id: string;
  type: 'verse' | 'chorus' | 'bridge' | 'tag';
  label: string; // Ej: "Verso 1", "Coro"
  lines: string[]; // Ej: ["[G]Sublime gracia del [C]Señor[G]", "Que a un [D]infeliz sal[G]vó"]
}

// Canción del catálogo general (Rama main)
interface BaseSong {
  id: string; // Slug único: "sublime-gracia"
  title: string;
  originalKey: string; // "G"
  sections: SongSection[];
  tags?: string[];
  updatedAt: string;
}

// Versión o personalización de una Sede
interface SedeSongOverride {
  id: string; // `${songId}_${sedeId}`
  baseSongId: string; // "sublime-gracia"
  sedeId: string; // "palestina"
  customTitle?: string; // "Sublime Gracia (Acústica Palestina)"
  customKey?: string; // "A" (tono preferido en esta sede)
  customSections?: SongSection[]; // Si modificaron estrofas
  localNotes?: string; // "Comenzar en piano suave"
  updatedAt: string;
}

// Repertorio dominical para compartir
interface Setlist {
  id: string;
  name: string; // "Culto Domingo Mañana"
  date: string;
  sedeId: string;
  items: {
    songId: string;
    key: string;
    order: number;
    notes?: string;
  }[];
}
```

---

### 2.2 Pseudocódigo: Inicialización y Resiliencia Offline (`src/db/index.ts`)
```text
CLASE LyricsDatabase EXTIENDE Dexie:
  TABLAS:
    - songs: "id, title, originalKey"
    - overrides: "id, baseSongId, sedeId"
    - setlists: "id, name, date, sedeId"
    - userState: "key"

FUNCIÓN initializeDatabase():
  db = nueva LyricsDatabase("app_lyrics_db")
  
  SI db.songs.count() == 0:
    // Carga inicial semilla para el MVP
    Cargar canciones semilla (sublime-gracia, cuan-grande-es-el, etc.)
    db.songs.bulkAdd(SEED_SONGS)
    
  RETORNAR db
```

---

### 2.3 Pseudocódigo: Algoritmo de Resolución de Canción Activa (`src/services/songResolver.ts`)
```text
FUNCIÓN resolveSongForDisplay(baseSong, activeSedeId, localOverridesList):
  // Busca si la sede activa tiene una versión propia de esta canción
  override = localOverridesList.find(o => o.baseSongId == baseSong.id && o.sedeId == activeSedeId)
  
  SI override EXISTE:
    RETORNAR {
      id: baseSong.id,
      title: override.customTitle O `${baseSong.title} (Versión ${activeSedeId})`,
      key: override.customKey O baseSong.originalKey,
      sections: override.customSections O baseSong.sections,
      notes: override.localNotes,
      isLocalOverride: VERDADERO,
      originalSong: baseSong
    }
  SINO:
    RETORNAR {
      id: baseSong.id,
      title: baseSong.title,
      key: baseSong.originalKey,
      sections: baseSong.sections,
      isLocalOverride: FALSO
    }
```

---

### 2.4 Pseudocódigo: Motor ChordPro y Transposición (`src/services/chordParser.ts`)
```text
ESCALA_CROMÁTICA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// 1. Extractor de texto limpio para proyector (Remueve acordes entre corchetes)
FUNCIÓN getCleanLyrics(lines):
  RETORNAR lines.map(line => line.replace(/\[[^\]]+\]/g, ''))

// 2. Transpositor de un acorde individual
FUNCIÓN transposeChord(chord, semitones):
  extraer nota raíz y sufijo (ej: "F#m7" -> raíz "F#", sufijo "m7")
  índiceActual = ESCALA_CROMÁTICA.indexOf(raíz)
  nuevoÍndice = (índiceActual + semitones + 12) % 12
  RETORNAR ESCALA_CROMÁTICA[nuevoÍndice] + sufijo

// 3. Transpositor de una línea completa con acordes
FUNCIÓN transposeLine(line, semitones):
  RETORNAR line.replace(/\[([^\]]+)\]/g, (match, chord) => {
    RETORNAR `[${transposeChord(chord, semitones)}]`
  })
```

---

### 2.5 Pseudocódigo: Compartición de Repertorios vía URL Comprimida (`src/services/urlSharing.ts`)
```text
// 1. Empaquetar y comprimir repertorio en URL
FUNCIÓN generateShareableSetlistUrl(setlist):
  payload = JSON.stringify({
    n: setlist.name,
    s: setlist.sedeId,
    i: setlist.items.map(item => [item.songId, item.key, item.notes])
  })
  compressed = LZString.compressToEncodedURIComponent(payload)
  RETORNAR `${window.location.origin}/#repertorio=${compressed}`

// 2. Desempaquetar repertorio al abrir enlace
FUNCIÓN parseSetlistFromUrl(hash):
  SI hash.includes("#repertorio="):
    encoded = hash.split("#repertorio=")[1]
    decompressed = LZString.decompressFromEncodedURIComponent(encoded)
    datos = JSON.parse(decompressed)
    RETORNAR recrearSetlist(datos)
  RETORNAR NULO
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo / Componente | Propósito / Ubicación Exacta |
| :--- | :--- | :--- |
| `package.json` | Configuración | Scripts (`dev`, `build`, `test`), dependencias (`react`, `react-dom`, `dexie`, `dexie-react-hooks`, `lz-string`, `lucide-react`) y devDependencies (`vite`, `vite-plugin-pwa`, `tailwindcss`, `vitest`, `typescript`). |
| `vite.config.ts` | Bundler & PWA | Configuración de Vite con plugin React y `VitePWA` configurado en modo standalone para soporte offline. |
| `src/types/index.ts` | Contratos de Datos | Definición completa de interfaces: `BaseSong`, `SedeSongOverride`, `Setlist`, `DisplaySong`, `SedeProfile`. |
| `src/data/seedSongs.ts` | Catálogo Base Inicial | 3 canciones representativas completas en formato ChordPro con versos y coros para pruebas inmediatas. |
| `src/db/index.ts` | Persistencia Dexie | Instancia IndexedDB, definición de almacenes de objetos y función `initializeSeedData()`. |
| `src/services/chordParser.ts` | Motor Musical | `getCleanLyrics()` (para proyector) y `transposeLine()` / `transposeChord()` (para músicos). |
| `src/services/songResolver.ts` | Lógica de Negocio | Función pura `resolveSongForDisplay()` que combina la base con la versión de la sede activa. |
| `src/services/urlSharing.ts` | Compartición | `generateShareableSetlistUrl()` y `parseSetlistFromUrl()` usando `lz-string` para WhatsApp. |
| `src/components/SedeSelector.tsx` | UI | Selector de Sede ("Catálogo General", "Sede Palestina", "Sede Central") para probar variantes al instante. |
| `src/components/MusicianView.tsx` | UI | Vista con acordes formateados, selector de tono (+/- semitonos) y cambio dinámico de visualización. |
| `src/components/ProjectionView.tsx` | UI | Modo pantalla completa 16:9, fondo oscuro, texto gigante limpio y navegación por teclado (flechas / barra espaciadora). |
| `src/components/SetlistManager.tsx` | UI | Creador de lista de canciones y botón "Compartir por WhatsApp" que copia el enlace comprimido. |
| `src/components/CorrectionModal.tsx` | UI | Modal para enviar sugerencia de corrección a canciones base. |
| `src/App.tsx` | UI Principal | Conexión de todos los módulos, pestañas de navegación (Cancionero, Repertorio, Proyección) y detección de estado de red. |
| `tests/chordParser.test.ts` | Pruebas Unitarias | Validación de extracción de letra limpia y transposición de acordes con sostenidos y menores. |
| `tests/songResolver.test.ts` | Pruebas Unitarias | Validación de que una sede ve su versión propia sin afectar a otras sedes ni al catálogo general. |
| `tests/urlSharing.test.ts` | Pruebas Unitarias | Validación de que la serialización, compresión y descompresión de repertorios no pierda datos. |

---

## 4. Plan de Verificación del MVP

Para validar que la arquitectura cumple el 100% de los requisitos se ejecutarán dos niveles de verificación:

### 4.1 Verificación Automatizada (Tests)
Comando: `npx vitest run`
- **Test 1 (`chordParser.test.ts`):**
  - Verifica que `[G]Sublime [C]gracia` genere `Sublime gracia` al solicitar letra de proyección.
  - Verifica que `[C] -> +2 semitonos -> [D]` y `[G#m] -> +1 semitono -> [Am]`.
- **Test 2 (`songResolver.test.ts`):**
  - Crea una canción base y un override para "Sede Palestina".
  - Comprueba que al consultar con sede "General" devuelve la base.
  - Comprueba que al consultar con sede "Palestina" devuelve el texto modificado y tono modificado.
- **Test 3 (`urlSharing.test.ts`):**
  - Comprime un repertorio de 3 canciones en una URL y verifica que la descompresión devuelva exactamente los mismos IDs, tonos y notas.

### 4.2 Verificación Manual del Flujo de Usuario (End-to-End)
1. **Comportamiento Offline:** Abrir la app en el navegador $\rightarrow$ Desconectar el Wi-Fi o activar "Offline" en DevTools $\rightarrow$ Comprobar que todas las canciones, búsquedas y visualizaciones siguen funcionando fluidamente.
2. **Prueba de Variantes de Sede:**
   - Seleccionar "Sede Palestina" en el selector.
   - Modificar una estrofa de una canción y guardar como "Versión Local".
   - Cambiar a "Catálogo General" y verificar que la canción se mantiene en su versión original.
   - Cambiar de nuevo a "Sede Palestina" y verificar que la versión local está intacta.
3. **Prueba de Vista de Proyección:** Entrar al modo proyección $\rightarrow$ Navegar con flechas de teclado $\rightarrow$ Verificar ausencia de acordes y texto legible a gran tamaño.
4. **Prueba de Compartir Repertorio:** Armar un repertorio $\rightarrow$ Presionar "Compartir" $\rightarrow$ Abrir el enlace en una pestaña de incógnito $\rightarrow$ Comprobar que el repertorio se importa automáticamente en el almacenamiento de la nueva pestaña.
