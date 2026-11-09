# Arquitectura y Contexto del Proyecto: App Lyrics

## 1. Visión General del Sistema
- **Propósito:** Plataforma web y PWA offline-first para la gestión, unificación y distribución de letras de alabanza y repertorios entre diferentes sedes y medios audiovisuales de la iglesia.
- **Filosofía de Costos:** Costo de infraestructura marginal $0 (usando Cloudflare Pages, Cloudflare Functions/Workers y GitHub como base de datos de persistencia).
- **Stack Principal:**
  - **Frontend:** React 19 + TypeScript + Vite.
  - **PWA / Offline:** `vite-plugin-pwa` (Workbox) + IndexedDB (vía `Dexie.js`).
  - **Estilos:** Tailwind CSS (diseño responsivo, modo oscuro para cabinas/escenarios).
  - **Backend Serverless:** Cloudflare Pages Functions (`/functions/api/`).
  - **Persistencia y Control de Versiones:** Repositorio GitHub mediante GitHub REST API / Octokit.
- **Directorio de Desarrollo:** `src/` (y `functions/` para endpoints serverless).
- **Directorio de Pruebas:** `tests/`

---

## 2. Arquitectura de Datos y Estrategia de Ramas (Git-backed)

### 2.1 Modelo de Ramas
- **Rama `main`:** Contiene el cancionero base oficial y general de la congregación.
- **Ramas `sede/{nombre_sede}` (ej. `sede/palestina`):** Ramas dedicadas para cada sede. 
  - La creación de ramas de nuevas sedes es automatizada desde la app mediante la contraseña de Administrador General.

### 2.2 Estrategia de Modificaciones (Variantes Locales sin Conflictos)
- Una sede **nunca** sobreescribe destructivamente los archivos base del catálogo general.
- Cuando una sede personaliza una canción, se crea un registro de versión local en la rama de su sede (`data/overrides/{song_id}.json` o `data/local_songs/`).
- La aplicación muestra la canción como: `Sublime Gracia (Versión Sede Palestina)` con prioridad sobre la versión general cuando se está en el perfil de esa sede.

### 2.3 Sistema de Corrección de Letras Generales
- Los usuarios o líderes de sede que detecten un error en una canción general envían un reporte mediante un formulario en la app ("Sugerir corrección").
- El backend serverless procesa la solicitud creando automáticamente un **GitHub Issue** etiquetado (`[Corrección Letra] Nombre Canción`).
- El **Administrador Central** es el único con privilegios para revisar y aplicar cambios sobre `main`.

---

## 3. Seguridad y Autenticación Ultraligera (Costos $0)

### 3.1 Abstracción de Git
- Los usuarios finales jamás ven terminología técnica de Git (ni commits, ni ramas, ni tokens).
- Todas las operaciones con GitHub se ejecutan a través de endpoints serverless protegidos.

### 3.2 Servidor Serverless (Cloudflare Functions)
- **Token de GitHub Seguro:** El *Personal Access Token* (PAT) de GitHub reside exclusivamente en variables de entorno seguras de Cloudflare (`GITHUB_PAT`). Nunca se expone al navegador.
- **Autenticación sin Base de Datos (Stateless JWT con HMAC-SHA256):**
  - Cada sede cuenta con una clave de acceso única; el administrador general cuenta con una clave maestra.
  - El servidor valida la clave contra secretos cifrados y emite un JWT firmado que define el alcance de escritura (ej. `claim.branch = "sede/palestina"`).
  - Consumo de recursos prácticamente nulo (~1ms de tiempo de CPU en edge).

---

## 4. Rendimiento y Distribución (Lectura vs. Escritura)
- **Lectura Masiva (95% del tráfico):** Totalmente desacoplada de la API de GitHub. Los archivos JSON del catálogo se sirven a través de CDN global estática con caché y se almacenan en el IndexedDB del cliente para soporte 100% offline.
- **Escritura (5% del tráfico):** Exclusiva de administradores autenticados mediante llamadas a `/functions/api/save` y `/functions/api/create-sede`.

---

## 5. Modos de Uso en el Frontend
1. **Modo Músicos / Alabanza:** Letras con acordes tipo ChordPro, botones de transposición de tono y auto-scroll.
2. **Modo Audiovisuales / Proyección:** Vista limpia 16:9, fuentes grandes de alto contraste, control por teclado (avanzar, retroceder, salto directo a coro, pantalla en negro).
3. **Modo Líder / Administración:** Editor de canciones de sede, creador de repertorios y generador de enlaces de WhatsApp / Códigos QR.
