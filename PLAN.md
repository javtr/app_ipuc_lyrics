# Plan de Desarrollo Activo: Optimización y Experiencia Móvil de Primera Clase (Mobile-First)

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico
Adaptar integralmente **App Lyrics** para teléfonos móviles (smartphones) donde los músicos tienen el dispositivo colocado en atriles o soportes de micrófono, conservando al 100% la experiencia de escritorio existente:

1. **Navegación Móvil Nativa (Patrón Master-Detail + Tab Bar Inferior):**
   - En pantallas pequeñas (`< 1024px`), desacoplar la lista de canciones del visor. Al seleccionar una canción, se abre a pantalla completa con botón `← Volver`.
   - Barra de navegación inferior fija (*Bottom Navigation Bar*) accesible con el pulgar: Cancionero, Repertorios y Sedes.
   - En escritorio (`lg:` en adelante), se conserva intacto el layout de 2 columnas lado a lado.
2. **Atril Digital Móvil (Musician View):**
   - **Control de Tamaño de Letra (A- / A+):** Permitir a los músicos ajustar el tamaño de fuente (desde compacto hasta extragrande) para lectura cómoda a distancia de atril.
   - **API de Bloqueo de Pantalla (*Screen Wake Lock API*):** Evitar que la pantalla del celular se apague o bloquee mientras el músico está tocando.
   - Barra de controles compacta y optimizada para no robar espacio vertical de lectura.
   - Salto de línea inteligente de acordes ChordPro en pantallas estrechas (360px-420px).
3. **Modo Proyección Táctil para Móviles (Swipe Gestures):**
   - Detección de gestos táctiles de deslizamiento (*Swipe Left* para avanzar, *Swipe Right* para retroceder).
   - Zonas de toque táctil en pantalla (tocar la mitad derecha para avanzar, mitad izquierda para retroceder).
   - Adaptación de tipografía y orientación vertical/horizontal.
4. **Selector de Sedes Adaptativo:**
   - Menú tipo *Bottom Sheet* / modal táctil en móviles para cambiar de congregación fácilmente sin desbordes.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Hook Screen Wake Lock (`src/hooks/useWakeLock.ts`)
```text
HOOK useWakeLock():
  ESTADO isSupported = 'wakeLock' in navigator
  ESTADO isActive = FALSE
  REFERENCIA sentinel = NULL

  FUNCIÓN requestWakeLock():
    SI isSupported:
      sentinel = await navigator.wakeLock.request('screen')
      isActive = VERDADERO
      sentinel.onrelease = () => isActive = FALSO

  FUNCIÓN releaseWakeLock():
    SI sentinel != NULL:
      await sentinel.release()
      sentinel = NULL
      isActive = FALSO

  EFECTO al montar/desmontar o cambiar visibilidad:
    SI document.visibilityState == 'visible' Y isActive:
      solicitar wakeLock de nuevo
```

### 2.2 Detección de Gestos Táctiles en Proyección (`src/components/ProjectionView.tsx`)
```text
VARIABLES touchStartX, touchEndX

EN onTouchStart(e):
  touchStartX = e.changedTouches[0].screenX

EN onTouchEnd(e):
  touchEndX = e.changedTouches[0].screenX
  diferencia = touchStartX - touchEndX
  
  SI diferencia > 50: // Deslizó hacia la izquierda
    handleNext()
  SINO SI diferencia < -50: // Deslizó hacia la derecha
    handlePrev()
```

### 2.3 Navegación Responsiva en `App.tsx`
```text
ESTADO mobileView: 'list' | 'detail' (Solo activo en móviles < 1024px)

AL SELECCIONAR CANCIÓN EN MÓVIL:
  selectedSongId = songId
  mobileView = 'detail'

AL PRESIONAR "VOLVER":
  mobileView = 'list'

EN ESCRITORIO (lg:):
  mobileView se ignora, mostrando siempre catálogo a la izquierda y atril a la derecha.
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo / Clase | Propósito y Ubicación Exacta |
| :--- | :--- | :--- |
| `src/hooks/useWakeLock.ts` | Nuevo Hook | Implementación de `useWakeLock` para mantener pantalla encendida en móviles. |
| `src/components/MobileBottomNav.tsx` | Nuevo Componente | Barra de pestañas inferior fija (`lg:hidden`) para Canciones, Repertorios y Sede. |
| `src/components/MusicianView.tsx` | Componente | Añadir selector de tamaño de fuente (`A-` / `A+`), indicador/toggle de pantalla encendida, botón móvil de retorno (`← Volver`) y controles compactos para móvil. |
| `src/components/ProjectionView.tsx` | Componente | Integración de gestos táctiles de swipe (`onTouchStart`, `onTouchEnd`) y zonas de toque táctil para navegación en teléfonos. |
| `src/components/SedeSelector.tsx` | Componente | Optimización de estilos táctiles y modal responsivo para móviles. |
| `src/App.tsx` | Componente Raíz | Soporte para vista Master-Detail en móvil (`mobileView: 'list' | 'detail'`), integración de `MobileBottomNav` y preservación íntegra de la grilla de escritorio. |
| `tests/wakeLock.test.ts` | Suite de Pruebas | Pruebas de simulación para el hook `useWakeLock`. |

---

## 4. Plan de Verificación

1. **Verificación de Pruebas Unitarias:**
   - Comando: `npm test`
   - Validar que todas las pruebas existentes de acordes, resolución y URLs siguen pasando al 100%, más las nuevas pruebas.
2. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Cero errores de compilación.
3. **Build de Producción:**
   - Comando: `npm run build`
   - Validación del bundle y service worker.
4. **Verificación en Navegador (DevTools Modo Móvil - iPhone / Pixel):**
   - Probar ancho 375px y 412px: la lista ocupa 100% del ancho con navegación táctil fluida.
   - Al tocar una canción se abre el atril completo con botón "Volver".
   - Botones A- / A+ ajustan el tamaño de letra en tiempo real.
   - En Proyección, tocar la mitad derecha avanza y la izquierda retrocede.
   - En pantalla de escritorio (`> 1024px`), la vista continúa con el panel dual lado a lado.
