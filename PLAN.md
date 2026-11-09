# Plan de Desarrollo Activo: Modo Lector Normal (Por Defecto) vs. Modo Músico

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico y Justificación de Negocio

La gran mayoría de los usuarios de la aplicación serán miembros de la congregación, cantantes o asistentes que **únicamente necesitan leer la letra limpia de las canciones** para cantar durante el culto o devocional, sin verse abrumados por acordes, tonos, BPM, cifrado ni conceptos de teoría musical.

Por tanto, el objetivo es:
1. **Crear el Modo Lector (Usuario Normal / Congregación):**
   - **Activo por defecto** en la primera carga para cualquier usuario.
   - Oculta todos los acordes, tonalidades, BPM y notas técnicas de músicos.
   - Muestra tipografía elegante, espaciosa y de alta legibilidad, destacando sutilmente el **Coro** para facilitar el seguimiento visual del canto.
   - Conserva los controles esenciales para cantar: ajuste de tamaño de letra (`A-` / `A+`) y auto-scroll suave opcional.
2. **Modo Músico (Atril / Alabanza):**
   - Accesible con un toque mediante el botón `🎵 Ver Acordes`.
   - Muestra el atril completo con acordes ChordPro, transposición, tonos y notas de arreglo.
3. **Persistencia de Preferencia de Usuario:**
   - Guardar la selección en `localStorage` (`app_lyrics_view_mode: 'lyrics' | 'chords'`). Si un músico activa los acordes, la app recordará su preferencia; pero para nuevos usuarios o miembros generales siempre abrirá en **Modo Lector**.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Flujo de Selección de Vista y Persistencia (`src/App.tsx`)
```text
ESTADO viewMode = localStorage.getItem('app_lyrics_view_mode') || 'lyrics'

FUNCIÓN toggleViewMode():
  nuevoModo = (viewMode == 'lyrics') ? 'chords' : 'lyrics'
  viewMode = nuevoModo
  localStorage.setItem('app_lyrics_view_mode', nuevoModo)

AL RENDERIZAR CANCIÓN SELECCIONADA:
  SI viewMode == 'lyrics':
    RENDERIZAR <ReaderView song={activeDisplaySong} onSwitchToChords={toggleViewMode} />
  SINO:
    RENDERIZAR <MusicianView song={activeDisplaySong} onSwitchToLyrics={toggleViewMode} />
```

### 2.2 Componente Modo Lector (`src/components/ReaderView.tsx`)
```text
PROPIEDADES: song, onSwitchToChords, onEnterProjection, onBackToCatalog

ESTADO fontSize: 'sm' | 'base' | 'lg' | 'xl' | '2xl' (Default: 'base')
ESTADO isAutoScrolling: boolean
ESTADO scrollSpeed: number

PARA CADA seccion EN song.sections:
  lineasLimpias = getCleanLyrics(seccion.lines) // Remueve corchetes [G], [C]
  
  SI seccion.type == 'chorus':
    RENDERIZAR con borde izquierdo destacado esmeralda y etiqueta clara "CORO"
  SINO:
    RENDERIZAR estrofa normal espaciada
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo / Componente | Propósito y Ubicación Exacta |
| :--- | :--- | :--- |
| `src/components/ReaderView.tsx` | Nuevo Componente | Componente dedicado para el usuario normal: tipografía grande y limpia, sin acordes ni tonos, botones `A-`/`A+`, auto-scroll, y botón `🎵 Modo Músico (Acordes)`. |
| `src/components/MusicianView.tsx` | Componente | Añadir botón en la barra superior: `📖 Modo Lector (Solo Letra)` para regresar al modo normal con un solo toque. |
| `src/App.tsx` | Componente Raíz | Líneas 30-40: Inicializar estado `viewMode` desde `localStorage` con valor por defecto `'lyrics'`.<br>Líneas 275-290: Alternar entre `ReaderView` y `MusicianView` según el modo activo. |
| `tests/readerView.test.ts` | Suite de Pruebas | Pruebas unitarias para verificar que `ReaderView` procesa y presenta únicamente texto limpio sin acordes residuales. |

---

## 4. Plan de Verificación

1. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Criterio: 0 errores de compilación.
2. **Pruebas Unitarias:**
   - Comando: `npm test`
   - Criterio: Validación del filtrado de letras y estado de vista normal.
3. **Validación del Flujo de Usuario:**
   - Abrir la aplicación por primera vez (o en modo incógnito):
     - **Verificación 1:** La canción abre directamente en **Modo Lector**: solo texto limpio, sin botones de transposición ni acordes entre corchetes.
     - **Verificación 2:** El botón `🎵 Ver Acordes` está presente. Al pulsarlo, conmuta al atril de músicos con transposición.
     - **Verificación 3:** Al pulsar `📖 Solo Letra`, regresa instantáneamente a la vista limpia.
     - **Verificación 4:** En móviles, la experiencia de lectura es inmediata y cómoda a pantalla completa.
