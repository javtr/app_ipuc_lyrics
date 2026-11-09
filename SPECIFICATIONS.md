# Especificaciones Técnicas y Funcionales del Sistema: App Lyrics

> **Documento Vivo de Arquitectura, Requerimientos y Diseño**  
> **Proyecto:** App Lyrics (Alabanza & Medios Audiovisuales)  
> **Versión:** 1.0.0  
> **Última Actualización:** 2026-11-09  

---

## 1. Visión del Producto y Objetivos de Negocio

### 1.1 Propósito
**App Lyrics** es una plataforma web progresiva (**PWA**) diseñada para unificar, distribuir y proyectar letras de alabanza y repertorios entre diferentes congregaciones (sedes) y equipos audiovisuales de la iglesia, eliminando la fricción técnica y garantizando operatividad total sin conexión a internet.

### 1.2 Principios Inviolables de Diseño
1. **Costo Marginal Cero ($0/mes sostenido):** No se contratan servidores dedicados ni bases de datos de pago. Toda la infraestructura opera sobre niveles gratuitos de **Cloudflare Pages**, **GitHub API** y **Client-Side Storage**.
2. **Resiliencia Total sin Conexión (*Offline-First*):** Los templos suelen tener saturación de red o carecer de Wi-Fi estable. La app debe funcionar al 100% desconectada durante cultos y ensayos.
3. **Abstracción Total de Git:** La persistencia, ramas y versionado ocurren bajo el capó. El usuario final jamás ve términos como *commit*, *push*, *branch* ni *merge*.
4. **Diseño Mobile-First con Soporte Desktop:** Adaptada prioritariamente para smartphones colocados en atriles de instrumentos y pantallas táctiles, conservando una experiencia enriquecida para cabinas audiovisuales en computadores.

---

## 2. Arquitectura General del Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENTE: PWA / NAVEGADOR MÓVIL                       │
│                                                                        │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │   IndexedDB (Dexie)    │  │          Vistas de Usuario           │  │
│  │  - songs (Catálogo)    │  │  1. Modo Lector (Congregación)       │  │
│  │  - overrides (Sedes)   │  │  2. Modo Músico (Atril + Acordes)    │  │
│  │  - setlists (Cultos)   │  │  3. Modo Proyección (16:9 Audiovis.) │  │
│  │  - suggestions (Fixes) │  │  4. Editor Visual ChordPro           │  │
│  └────────────────────────┘  └──────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Peticiones de Escritura / Auth
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          CAPA SERVERLESS: Cloudflare Pages Functions (/api/)           │
│                                                                        │
│   • /api/auth               -> Emisión JWT (Web Crypto HMAC-SHA256)   │
│   • /api/commit             -> Proxy seguro con Token GitHub (PAT)     │
│   • /api/suggest-correction -> Crea GitHub Issue en repositorio        │
│   • /api/create-sede        -> Crea rama Git independiente para sede   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Git REST API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               CAPA DE PERSISTENCIA Y AUDITORÍA: GitHub                 │
│                                                                        │
│   • Rama 'main'             -> Catálogo general oficial nacional       │
│   • Rama 'sede/palestina'   -> Versiones y arreglos de Sede Palestina  │
│   • Rama 'sede/central'     -> Versiones y arreglos de Sede Central    │
│   • GitHub Issues           -> Bandeja de entrada para correcciones    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Perfiles de Usuario y Modos de Visualización

### 3.1 Modo Lector (Usuario Normal / Congregación) — *Por Defecto*
- **Público Objetivo:** Miembros de la iglesia, coristas y asistentes que cantan en el culto.
- **Premisa:** No requieren teoría musical, tonalidades, compás ni acordes.
- **Características:**
  - Letra 100% limpia sin corchetes ni notas.
  - Tipografía grande y espaciada con control de tamaño (`A-` / `A+`).
  - Distinción visual inmediata del **Coro** (barra esmeralda e insignia `"CORO"`).
  - Auto-Scroll suave para cantar sin tocar la pantalla.
  - Conmutador directo de un solo toque: `🎵 Ver Acordes`.

### 3.2 Modo Músico (Atril de Instrumentistas)
- **Público Objetivo:** Guitarristas, pianistas, bajistas y directores de alabanza.
- **Características:**
  - Acordes formateados en notación ChordPro alineados exactamente sobre las sílabas.
  - **Transposición en tiempo real:** Botones $\pm 1$ semitono y restauración al tono original.
  - **Screen WakeLock API:** Impide que la pantalla del celular o tablet se apague o bloquee mientras el músico toca.
  - Visualización de notas locales de la sede (ej. *"Entrada con pad suave y guitarra"*).
  - Conmutador directo: `📖 Solo Letra`.

### 3.3 Modo Proyección (Equipo de Medios / Video Beam)
- **Público Objetivo:** Operadores de sonido, proyección y transmisión.
- **Características:**
  - Pantalla completa limpia en relación 16:9 sin menús ni acordes.
  - Fondo negro absoluto (`#000000`) con tipografía blanca de máximo contraste.
  - **Control por teclado en PC:**
    - `Espacio` / `Flecha Derecha` / `Enter`: Avanzar estrofa.
    - `Flecha Izquierda`: Retroceder estrofa.
    - `B`: Pantalla en negro instantánea (*Blackout*).
    - `C`: Salto directo al Coro.
    - `V`: Salto al Verso 1.
    - `Esc`: Salir de proyección.
  - **Control táctil en celular:** Deslizar horizontalmente (*swipe*) o tocar los laterales de la pantalla.

### 3.4 Modo Líder / Administrador de Sede
- Acceso mediante contraseña de sede.
- Creación y edición de canciones con previsualización en vivo.
- Armado de listas de canciones para cultos (repertorios) y exportación a WhatsApp.

---

## 4. Estructura de Datos y Persistencia

### 4.1 Formato ChordPro Estructurado
Las canciones se almacenan internamente en formato JSON con secciones tipadas:

```typescript
interface SongSection {
  id: string;
  type: 'verse' | 'chorus' | 'bridge' | 'tag' | 'intro' | 'outro';
  label: string; // Ej: "Verso 1", "Coro"
  lines: string[]; // Ej: ["[G]Sublime gracia del [C]Señor[G]", "Que a un [Em]infeliz sal[D]vó"]
}

interface BaseSong {
  id: string; // Slug único: "sublime-gracia"
  title: string;
  artist?: string;
  originalKey: string; // "G"
  bpm?: number;
  timeSignature?: string; // "4/4"
  sections: SongSection[];
  tags?: string[];
  updatedAt: string;
}
```

### 4.2 Modelo de Variantes de Sede (*Overrides*)
Para evitar conflictos de Git (*merge conflicts*), una sede **nunca** sobreescribe de forma destructiva el archivo base del catálogo general.

```typescript
interface SedeSongOverride {
  id: string; // `${songId}_${sedeId}`
  baseSongId: string;
  sedeId: string; // "sede-palestina"
  customTitle?: string;
  customKey?: string; // Tono preferido de la sede
  customSections?: SongSection[]; // Modificaciones en la letra o acordes
  localNotes?: string; // Instrucciones de arreglo para los músicos
  updatedAt: string;
}
```

**Regla de Resolución y Resiliencia:**
- Si el usuario está en el perfil de su sede y existe un registro en `overrides`, la app muestra la versión local con la insignia `[Versión Sede]`.
- Si no existe override o si se abre un repertorio de otra sede sin conexión, el sistema aplica **fallback instantáneo al Catálogo General** (ver Sección 5.3). Jamás se muestra un error de canción no encontrada.

---

## 5. Distribución y Compartición de Repertorios

### 5.1 Enlace de WhatsApp Comprimido (Cero Servidor)
- Cuando el líder de alabanza arma el repertorio del domingo, la aplicación serializa la lista de IDs de canciones, tonos asignados y notas de orden.
- El payload se comprime usando el algoritmo **LZ-String** y se añade al fragmento hash de la URL:
  ```text
  https://app-lyrics.pages.dev/#repertorio=N4IgJgpg...
  ```
- **Ventaja Técnica:** Los fragmentos hash (`#...`) nunca se transmiten al servidor HTTP, eliminando problemas de límite de longitud de cabeceras.
- El músico recibe el enlace por WhatsApp, lo toca en su celular y la PWA importa el culto directamente a su IndexedDB local.

### 5.2 Copia de Seguridad Completa (`.lyrics.json`)
- Para respaldar todo el cancionero de una sede o transferirlo entre dispositivos sin internet:
  - Botón **"Descargar Respaldo"**: Genera un archivo `app_lyrics_respaldo_YYYY-MM-DD.json`.
  - Botón **"Restaurar Respaldo"**: Carga el archivo y realiza un *upsert* masivo en IndexedDB.

### 5.3 Estrategia de Sincronización Híbrida y Fallback Seguro entre Sedes
Para resolver el flujo donde músicos interactúan con canciones o repertorios de distintas sedes sin saturar el almacenamiento del dispositivo ni requerir servidores complejos:

1. **Descarga Base por Perfil:**
   - Al instalar la app o seleccionar una congregación en el Navbar, el dispositivo descarga el **Catálogo General Nacional** (rama `main`) y las **variantes específicas de esa sede** (`overrides` de la rama `sede/{nombre_sede}`).
2. **Sincronización On-Demand al Compartir Repertorios:**
   - Todo repertorio compartido lleva asociada la sede de origen (`sedeId`).
   - Cuando un músico abre un enlace de WhatsApp con conexión, la app verifica si el repertorio contiene variantes de esa otra sede que no estén en su `IndexedDB`. De haberlas, las descarga en segundo plano en milisegundos y las guarda localmente.
3. **Mecanismo de Resiliencia / Fallback Seguro (Cero Pantallas Vacías):**
   - Si el músico abre el repertorio de otra sede estando sin señal (en el templo o en modo avión):
     - La app **hace fallback inmediato al Catálogo General** para cada canción cuya variante de sede externa no esté descargada.
     - Se despliega un aviso discreto:  
       > *"Mostrando versión base del catálogo general (la adaptación de [Sede] requiere conexión para sincronizarse)."*
     - De esta forma, el músico **siempre tiene acordes y letra en pantalla y puede tocar sin interrupciones**.
4. **Persistencia Acumulativa:**
   - Toda variante de sede externa sincronizada se almacena en el `IndexedDB` local (`db.overrides`), asegurando que para futuros ensayos o cultos funcione 100% desconectada.

---

## 6. Sistema de Correcciones al Catálogo General

Para evitar que cualquier usuario modifique el catálogo oficial nacional por error:
1. Cualquier usuario puede pulsar el botón con icono de bandera `[Reportar Corrección]`.
2. Se despliega un formulario sencillo:
   - Sección con error (Verso 1, Coro, etc.).
   - Detalle de la corrección o errata sugerida.
   - Nombre o sede de quien reporta.
3. El backend serverless (`/api/suggest-correction`) crea un **GitHub Issue** etiquetado en el repositorio central:
   - Título: `[Corrección] Sublime Gracia - Coro`
   - El Administrador General recibe una notificación en su teléfono y puede aplicar el cambio en `main` cuando lo valide.

---

## 7. Seguridad y Microservicios Serverless (Cloudflare Pages)

| Endpoint | Método | Autenticación | Función Principal |
| :--- | :--- | :--- | :--- |
| `/api/auth` | `POST` | Contraseña Sede / Maestra | Valida credenciales contra secretos de Cloudflare y emite JWT firmado con **Web Crypto HMAC-SHA256**. |
| `/api/suggest-correction` | `POST` | Pública | Recibe reporte de errata y crea un GitHub Issue en el repositorio mediante la GitHub REST API. |
| `/api/commit` | `POST` | `Bearer <JWT>` | Valida permisos de sede y comitea cambios a la rama `sede/{nombre_sede}` usando el token privado `GITHUB_PAT`. |
| `/api/create-sede` | `POST` | `Bearer <JWT>` (Master) | Crea una nueva rama Git independiente para una congregación que se incorpora. |

> [!IMPORTANT]
> El token de GitHub (`GITHUB_PAT`) reside **exclusivamente** en las variables de entorno seguras de Cloudflare. Jamás se envía ni se expone en el código cliente de React.

---

## 8. Stack Tecnológico Definitivo

- **Frontend Core:** React 18/19 + TypeScript + Vite.
- **Estilos y UI:** Tailwind CSS (diseño responsivo con tema oscuro absoluto para escenarios y cabinas de proyección).
- **Persistencia Local:** IndexedDB mediante `Dexie.js` y `dexie-react-hooks` para consultas reactivas en vivo.
- **Soporte Offline & PWA:** `vite-plugin-pwa` (Workbox) con estrategia *Stale-While-Revalidate* y manifiesto de instalación para Android, iOS y Desktop.
- **Compresión de Datos:** `lz-string` para compresión URI-safe en WhatsApp.
- **Backend Serverless:** Cloudflare Pages Functions (`functions/api/`) ejecutadas en V8 Isolates con Web Crypto nativo.
- **Control de Versiones y Base de Datos:** Repositorio Git en GitHub con ramas dedicadas por sede.
- **Testing:** Vitest con pruebas unitarias para serialización, parsing de acordes, transposición musical y validación de respaldos.

---

## 9. Convenciones de Desarrollo y Gobernanza

1. **Protocolo Two-Phase Gate ([.agent/AGENTS.md](file:///f:/Desarrollo/app_lyrics/.agent/AGENTS.md)):**
   - **Fase 1 (Modo Solo Lectura):** Análisis y diseño técnico obligatorio en [PLAN.md](file:///f:/Desarrollo/app_lyrics/PLAN.md) con pseudocódigo y matriz de cambios. Queda prohibido modificar código en esta fase.
   - **Fase 2 (Ejecución):** Solo se implementa código tras la aprobación humana expresa ("Aprobado" / "Ejecuta el plan").
2. **Estándar de Calidad:**
   - Cero código incompleto o *placeholders* (`// tu código aquí` o `pass`).
   - Todo cambio debe compilar con 0 errores de TypeScript (`npx tsc --noEmit`) y pasar la suite de pruebas (`npm test`).
