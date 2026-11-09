# Plan de Desarrollo Activo: Estado Global "Modo Músico" y Corrección de Scroll en Editor Móvil

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico y Causa Raíz

### 1.1 Diagnóstico del Problema en Móvil (`SongEditorModal.tsx`)
En dispositivos móviles, el modal de edición de canciones no permitía ver la letra ni desplazarse hacia abajo debido a que múltiples contenedores anidados tenían la propiedad `overflow-hidden` y alturas fijas (`max-h-[95vh]`, `flex-1 overflow-hidden`). La cabecera de metadatos (título, artista, tono, compás) sumada a la barra de acordes rápidos ocupaba todo el alto disponible de la pantalla, dejando la caja de texto de la letra aplastada o fuera del área visible sin posibilidad de hacer scroll.

### 1.2 Estado Global de "Modo Músico" en el Navbar
Actualmente la app asume que cualquiera que edite canciones es un músico que entiende de cifrado. Siguiendo la visión del producto en **[SPECIFICATIONS.md](file:///f:/Desarrollo/app_lyrics/SPECIFICATIONS.md)**, la inmensa mayoría de los usuarios y líderes son miembros que solo necesitan leer y editar la letra lírica de las canciones.

Por tanto, se implementará un **conmutador global en el Navbar superior**:
1. **`isMusicianMode === false` (Modo Normal / Congregación - Por defecto):**
   - **En el visor:** Muestra exclusivamente `ReaderView` (letra limpia, coro destacado, auto-scroll). No hay botones para transponer ni ver acordes.
   - **En el editor:** Se ocultan todos los conceptos de teoría musical (Tono, BPM, Compás, barra de acordes rápidos). Solo permite editar título, artista y el texto de las estrofas limpias.
   - **En repertorios:** Oculta los selectores y columnas de tonalidad musical.
   - **En el cancionero:** Oculta las etiquetas de tono en las tarjetas de canciones.
2. **`isMusicianMode === true` (Modo Músico Activo):**
   - Habilita acordes ChordPro, transposición en tiempo real, atril con WakeLock, barra táctil de acordes en el editor y selección de tono por canción en repertorios.
3. **Persistencia:** Guardado en `localStorage` (`app_lyrics_musician_mode: 'true' | 'false'`), iniciando siempre por defecto en `false`.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Estado Global en `src/App.tsx`
```text
ESTADO isMusicianMode = (localStorage.getItem('app_lyrics_musician_mode') == 'true') // Default: false

FUNCIÓN toggleMusicianMode():
  nuevoEstado = !isMusicianMode
  isMusicianMode = nuevoEstado
  localStorage.setItem('app_lyrics_musician_mode', nuevoEstado.toString())

EN NAVBAR (<header>):
  RENDERIZAR botón conmutador:
    - Inactivo: "📖 Modo Lector" (Gris / Neutro)
    - Activo: "🎵 Modo Músico" (Borde e icono Esmeralda activo)
```

### 2.2 Reestructuración del Scroll en `src/components/SongEditorModal.tsx`
```text
MODAL CONTAINER:
  - fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4
  - max-h-[92vh] flex flex-col bg-slate-900 rounded-2xl overflow-hidden

CUERPO DEL MODAL (ÚNICO SCROLL FLUIDO):
  - flex-1 overflow-y-auto p-4 space-y-4
  
  SI isMusicianMode:
    - Mostrar campos: Título, Artista, Tono, BPM, Compás
    - Mostrar Barra de Inserción de Acordes [G], [C], [D]...
    - Textarea con acordes y live preview
  SINO:
    - Mostrar solo campos: Título, Artista
    - Ocultar Barra de Acordes y selectores de Tono
    - Textarea enfocado únicamente en la letra lírica limpia
    - Atajos de sección: + Verso, + Coro

FOOTER:
  - shrink-0 border-t p-3 (Botones Cancelar y Guardar siempre accesibles)
```

### 2.3 Filtrado Condicional en `src/components/SetlistManager.tsx`
```text
SI isMusicianMode == true:
  Mostrar selector de tono y badge "Tono: G" en cada canción
SINO:
  Ocultar tono; mostrar solo título, orden y notas
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo / Componente | Propósito y Ubicación Exacta |
| :--- | :--- | :--- |
| `src/App.tsx` | Componente Raíz | 1. Líneas 30-45: Estado `isMusicianMode` persistido en `localStorage`.<br>2. Líneas 140-160: Botón de conmutación `Modo Músico` en el Navbar superior.<br>3. Líneas 270-290: Condicionar `MusicianView` vs `ReaderView` según `isMusicianMode`.<br>4. Líneas 360-380: Pasar `isMusicianMode` al `SongEditorModal` y `SetlistManager`. |
| `src/components/SongEditorModal.tsx` | Componente | 1. Props: Añadir `isMusicianMode: boolean`.<br>2. Layout: Eliminar bloqueos de `overflow-hidden` y unificar en un contenedor con `overflow-y-auto`.<br>3. Renderizado condicional: Ocultar selectores de tono, BPM, compás y barra de acordes rápidos si `isMusicianMode === false`. |
| `src/components/SetlistManager.tsx` | Componente | 1. Props: Añadir `isMusicianMode: boolean`.<br>2. Condicionar la visualización de tonos en las canciones del culto. |
| `src/components/ReaderView.tsx` | Componente | Eliminar el botón interno "Ver Acordes" si el modo músico ahora se gobierna globalmente desde el Navbar superior. |
| `tests/musicianMode.test.ts` | Suite de Pruebas | Pruebas unitarias para verificar la consistencia del modo lector limpio vs modo músico en el editor y visor. |

---

## 4. Plan de Verificación

1. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit` (0 errores).
2. **Pruebas Unitarias:**
   - Comando: `npm test` (Todas las pruebas aprobadas).
3. **Validación en Móvil (Viewport 375px / 390px):**
   - **Prueba 1 (Modo Normal por Defecto):**
     - Abrir la app: el Navbar muestra el botón en modo Lector (apagado).
     - El cancionero no muestra tonos musicales en las canciones.
     - Al abrir una canción, se lee la letra limpia sin acordes.
     - Al tocar "+ Nueva" o "Editar", el modal se despliega: se puede hacer scroll hacia abajo cómodamente, la caja de texto para escribir la letra es grande y accesible, y no aparece ninguna barra de acordes ni selector de tono.
   - **Prueba 2 (Activación de Modo Músico):**
     - Tocar el botón "Modo Músico" en el Navbar: se enciende con badge verde esmeralda.
     - La canción actual muestra inmediatamente los acordes y el atril de músicos con transposición.
     - Al abrir el editor, se despliegan los controles de tono, BPM y la barra táctil de acordes.
