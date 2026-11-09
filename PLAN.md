# Plan de Desarrollo Activo: Editor Visual de Canciones y Asistente ChordPro

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico
Implementar el **Editor Visual de Canciones y Asistente ChordPro** que permita a los líderes y músicos:
1. **Crear nuevas canciones** desde cero con metadatos completos (Título, Artista, Tono original, BPM, Compás, Tags) e incorporarlas al catálogo local (`db.songs`).
2. **Editar letras y acordes existentes**, permitiendo guardar como actualización general o como versión personalizada de sede (`db.overrides`).
3. **Asistente Táctil de Acordes:** Barra de botones con acordes comunes (`[C]`, `[D]`, `[G]`, `[Em]`, `[Am]`, `[F]`, etc.) y atajos de secciones (`+ Verso`, `+ Coro`, `+ Puente`) para insertar en el cursor sin usar corchetes manualmente en celulares.
4. **Previsualización en Vivo (*Live Preview*):**
   - **Escritorio:** Vista dividida lado a lado (*Split-View*).
   - **Móvil:** Pestañas *Editar* / *Previsualizar*.
5. **Servicio Serializador Bidireccional:** Conversión fluida entre texto ChordPro plano y la estructura tipada `SongSection[]`.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Parser Bidireccional (`src/services/chordSerializer.ts`)
```text
FUNCIÓN serializeSectionsToText(sections):
  Devuelve string formateado:
  {verse: Verso 1}
  [G]Sublime gracia del [C]Señor[G]
  Que a un [Em]infeliz sal[D]vó

  {chorus: Coro}
  [G]¡Aleluya! [C]¡Ale[G]luya!

FUNCIÓN parseTextToSections(rawText):
  Descompone el texto por directivas {tipo: Etiqueta} o infiere secciones por párrafos.
  Genera arreglo SongSection[] tipado y limpio.
```

### 2.2 Asistente de Cursor
```text
FUNCIÓN insertTagAtCursor(textarea, tag):
  Inserta `tag` en la posición actual de selección y reubica el cursor inmediatamente después.
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo | Propósito y Ubicación Exacta |
| :--- | :--- | :--- |
| `src/services/chordSerializer.ts` | Nuevo Servicio | Funciones puras `serializeSectionsToText()` y `parseTextToSections()`. |
| `src/components/SongEditorModal.tsx` | Nuevo Componente | Modal centrado (con React Portal) para creación/edición, barra de acordes y preview reactivo. |
| `src/components/MusicianView.tsx` | Componente | Añadir botón "Editar letra y acordes" que abre el `SongEditorModal`. |
| `src/App.tsx` | Componente Raíz | Añadir botón "+ Nueva Canción" en la lista del cancionero y conectar el estado del editor. |
| `tests/chordSerializer.test.ts` | Pruebas Unitarias | Validación de ida y vuelta (round-trip) entre texto y `SongSection[]`. |

---

## 4. Plan de Verificación

1. **Pruebas Unitarias:** `npm test` (validar serializador y tests existentes).
2. **Chequeo de Tipos:** `npx tsc --noEmit` (0 errores).
3. **Build de Producción:** `npm run build` (empaquetado PWA limpio).
