# Plan de Desarrollo Activo: Corrección del Navbar Móvil y Modal de Sede

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico y Causa Raíz

### 1.1 Diagnóstico de la Causa Raíz
Al presionar el botón de sede ("General Nacional") en móviles, la interfaz se desborda y el menú colapsa dentro del navbar debido a dos problemas técnicos concatenados:

1. **Trampa de Bloque Contenedor CSS (*Containing Block Trap*):**
   - El elemento `<header>` en `src/App.tsx` utiliza la clase `backdrop-blur-md` (`backdrop-filter`).
   - Según la especificación del W3C, cualquier elemento con `backdrop-filter` o `transform` se convierte en el **bloque contenedor forzado** para todos sus descendientes con `position: fixed`.
   - Por esta razón, el modal de sedes (`fixed inset-0`), en lugar de cubrir toda la pantalla del teléfono, queda atrapado y confinado dentro de la barra de navegación de 56px de altura, provocando que el navbar se deforme y desborde visualmente.
2. **Longitud del Texto en Pantallas Angostas (360px - 390px):**
   - El nombre `"Catálogo General (Nacional)"` es demasiado extenso para el espacio disponible junto al logotipo y el indicador de red en la cabecera móvil.

### 1.2 Alcance del Cambio
1. Desacoplar el Modal de Selección de Sedes del `<header>` usando un **React Portal** (`createPortal(..., document.body)`), garantizando que el modal se monte directamente en el `<body>` y cubra la pantalla completa sin interferencia de las cabeceras.
2. Agregar la propiedad `shortName` al modelo `SedeProfile` para mostrar nombres cortos optimizados en pantallas móviles (`"General"`, `"Palestina"`, `"Central"`).
3. Compactar el botón y el indicador de red en el navbar móvil para evitar cualquier desborde horizontal.

---

## 2. Flujo Lógico y Pseudocódigo

### 2.1 Uso de React Portal para el Modal de Sedes (`src/components/SedeSelector.tsx`)
```text
EN SedeSelector:
  ESTADO isOpen = false
  
  // El botón permanece en el navbar
  RENDERIZAR botón en el header con shortName
  
  // El modal se renderiza en document.body mediante createPortal
  SI isOpen:
    RETORNAR createPortal(
      <DIV fixed inset-0 z-50 flex items-end sm:items-center bg-black/75 ...>
        <DIV w-full sm:w-80 bg-slate-900 rounded-t-3xl ...>
          Contenido del selector de sedes y botón de nueva sede
        </DIV>
      </DIV>,
      document.body
    )
```

### 2.2 Nombres Cortos Adaptativos en el Modelo de Sedes
```text
SEDES_LIST = [
  { id: 'general', name: 'Catálogo General (Nacional)', shortName: 'General' },
  { id: 'sede-palestina', name: 'Sede Palestina (Caldas)', shortName: 'Palestina' },
  { id: 'sede-central', name: 'Sede Central', shortName: 'Central' }
]
```

---

## 3. Matriz de Cambios y Ubicaciones Exactas

| Archivo | Módulo / Componente | Propósito y Ubicación Exacta |
| :--- | :--- | :--- |
| `src/types/index.ts` | Modelos de Datos | Línea 65-70: Agregar campo opcional `shortName?: string` a la interfaz `SedeProfile`. |
| `src/components/SedeSelector.tsx` | Componente | 1. Línea 11-16: Definir `shortName` en `SEDES_LIST`.<br>2. Línea 70-85: Mostrar `shortName` en el botón móvil del navbar con ancho limitado (`max-w-[75px] sm:max-w-[120px]`).<br>3. Línea 88+: Envolver el renderizado del modal con `createPortal(..., document.body)` importado de `react-dom`. |
| `src/App.tsx` | Componente Raíz | Línea 80-110: Ajustar el espaciado del header (`gap-1.5 sm:gap-4`) y asegurar que los elementos no colisionen en pantallas estrechas. |

---

## 4. Plan de Verificación

1. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Criterio: 0 errores de tipado.
2. **Pruebas Unitarias:**
   - Comando: `npm test`
   - Criterio: Todos los tests pasan al 100%.
3. **Build de Producción:**
   - Comando: `npm run build`
   - Criterio: Compilación limpia sin advertencias ni desbordes.
4. **Verificación Visual en Móvil (360px - 390px):**
   - Abrir en vista móvil (iPhone SE / Galaxy S20).
   - Tocar el botón de sede: el modal debe abrirse suavemente como un *Bottom Sheet* desde el fondo de la pantalla completa del teléfono, sin alterar ni deformar el navbar superior.
   - Seleccionar "General" o "Palestina": el botón se actualiza sin desbordar el navbar.
