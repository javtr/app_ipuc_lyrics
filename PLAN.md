# Plan de Desarrollo: Reubicación de Copia de Seguridad a Repertorios y Optimización del Navbar Móvil

> **Estado:** EJECUTADO (100% Implementado y Validado)

---

## 1. Objetivo Técnico y Justificación Arquitectónica

### 1.1 Justificación
En la discusión de diseño se estableció que:
1. El **Catálogo General de Canciones** pertenece y se versiona en el repositorio Git (GitHub / Cloudflare Pages).
2. Los **Repertorios de Culto** y las **Variantes de Sede** son los datos que realmente residen en el almacenamiento local del dispositivo (`IndexedDB`).
3. Ubicar el botón de "Copia de Seguridad" en el Navbar superior generaba ruido visual y sobrecarga en pantallas móviles pequeñas (360px - 390px).

### 1.2 Objetivo
- **Retirar** el botón de copia de seguridad del Navbar (`<header>`) en `src/App.tsx`.
- **Reubicarlo** dentro de `src/components/SetlistManager.tsx` en la cabecera de la sección de repertorios, junto a "Nuevo Repertorio".
- **Garantizar** que el Navbar móvil quede ultra limpio, mostrando únicamente los dos controles críticos de alabanza: el selector de **Sede** y el conmutador de **Modo Músico / Lector**.

---

## 2. Pseudocódigo y Flujo Lógico

### 2.1 En `src/components/SetlistManager.tsx`
```text
PROPS DE SETLISTMANAGER:
  - Añadir prop opcional: onOpenBackup?: () => void

EN LA CABECERA DE REPERTORIOS:
  - Contenedor de acciones:
    [ Botón: "Copia de Seguridad" (Icono HardDrive) -> Ejecuta onOpenBackup() ]
    [ Botón: "+ Nuevo Repertorio" (Icono Plus) -> Abre modal de nuevo repertorio ]
```

### 2.2 En `src/App.tsx`
```text
EN NAVBAR (<header>):
  - Eliminar el <button onClick={() => setIsBackupModalOpen(true)}> del header
  - Espacio visual optimizado para:
    [ Logo + App Lyrics ] --------- [ Selector Sede ] [ Modo Músico/Lector ]

EN RENDER DE SETLISTMANAGER:
  - Pasar onOpenBackup={() => setIsBackupModalOpen(true)}
```

---

## 3. Impacto en Componentes

| Archivo | Rol | Cambios |
| :--- | :--- | :--- |
| `src/App.tsx` | Contenedor principal | Retirar botón `HardDrive` del header; conectar prop `onOpenBackup` en `<SetlistManager />`. |
| `src/components/SetlistManager.tsx` | Gestión de repertorios | Añadir `HardDrive` a los iconos importados; añadir prop `onOpenBackup`; renderizar botón en la barra de herramientas de repertorios. |
| `tests/backupService.test.ts` | Pruebas | Mantener las pruebas existentes intactas (ya cubren exportación/importación y persistencia). |

---

## 4. Ubicación Exacta de los Cambios

### 4.1 `src/components/SetlistManager.tsx`
- **Líneas 1-15:** Importar `HardDrive` desde `lucide-react`.
- **Líneas 18-25:** Añadir `onOpenBackup?: () => void;` a la interfaz `SetlistManagerProps`.
- **Líneas 120-135:** En el bloque flex de cabecera de repertorios, agrupar las acciones y colocar el botón de copia de seguridad antes de "Nuevo Repertorio".

### 4.2 `src/App.tsx`
- **Líneas 175-195:** Eliminar el botón `<button onClick={() => setIsBackupModalOpen(true)}...>` del header.
- **Líneas 355-375:** Pasar `onOpenBackup={() => setIsBackupModalOpen(true)}` a `<SetlistManager ... />`.

---

## 5. Plan de Verificación

1. **TypeScript Check:** `npx tsc --noEmit` debe dar 0 errores.
2. **Suite de Pruebas:** `npm test` debe pasar todas las pruebas (8 suites, 24 tests).
3. **Validación Visual:**
   - Comprobar en viewport móvil (375px) que el Navbar superior ahora solo muestra Logo, Sede y Modo Músico/Lector con espacio amplio y holgado.
   - Ir a la pestaña "Repertorios" y validar que el botón "Copia de Seguridad" abre el modal de respaldo y restauración correctamente.
