# Plan de Desarrollo Activo: Centrado Visual del Modal de Sedes

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico
Modificar el posicionamiento del modal de selección de sede en **[src/components/SedeSelector.tsx](file:///f:/Desarrollo/app_lyrics/src/components/SedeSelector.tsx)** para que se muestre **completamente centrado** (vertical y horizontalmente) tanto en dispositivos móviles como en pantallas de escritorio, eliminando el comportamiento de panel inferior (*Bottom Sheet*).

---

## 2. Flujo Lógico y Estilos de Posicionamiento

```text
CONTENEDOR EXTERNO (Overlay):
  - fixed inset-0 z-50
  - flex items-center justify-center (Centrado vertical y horizontal en todas las pantallas)
  - p-4 (Margen de seguridad respecto a los bordes de la pantalla móvil)
  - bg-black/75 backdrop-blur-sm

CONTENEDOR INTERNO (Tarjeta Modal):
  - w-full max-w-sm (Ancho responsivo que se adapta a teléfonos sin desbordar)
  - rounded-2xl (Bordes redondeados completos en todas las esquinas)
  - border border-slate-700 bg-slate-900 shadow-2xl
  - max-h-[85vh] flex flex-col (Scroll interno suave si la lista de sedes crece)
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Componente | Ubicación y Modificación Exacta |
| :--- | :--- | :--- |
| `src/components/SedeSelector.tsx` | `SedeSelector` | **Líneas 91-98:**<br>Reemplazar `items-end sm:items-center sm:justify-center p-0 sm:p-4` por `items-center justify-center p-4`.<br>Reemplazar `w-full sm:w-96 rounded-t-3xl sm:rounded-2xl` por `w-full max-w-sm rounded-2xl`. |

---

## 4. Plan de Verificación

1. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Criterio: 0 errores.
2. **Pruebas Unitarias:**
   - Comando: `npm test`
   - Criterio: 14/14 tests aprobados.
3. **Verificación Visual:**
   - Abrir en vista móvil (iPhone SE / Galaxy S20).
   - Tocar el botón de sede: el modal debe aparecer en el **centro geométrico exacto de la pantalla**, con bordes redondeados y fondo oscurecido uniforme.
