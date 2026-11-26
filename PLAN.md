# Plan de Desarrollo — Proxy Local de Desarrollo (`/api/*` → Cloudflare Pages)

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de modificar `vite.config.ts`).

---

## 1. Objetivo Técnico

Permitir que el inicio de sesión (`POST /api/auth`), la sincronización rápida (`GET /api/sync`) y demás endpoints serverless (`/api/*`) funcionen **directamente al probar la aplicación en local** mediante [`Iniciar App Lyrics.bat`](file:///f:/Desarrollo/app_lyrics/Iniciar%20App%20Lyrics.bat) (`npm run dev -- --host --open`) o `npm run preview`, **sin almacenar secretos ni tokens en el computador local** y sin alterar el build de producción en Cloudflare Pages:

1. **Por qué falla actualmente en local:**
   - Vite (`npm run dev`) solo sirve el frontend estático de React; no ejecuta la carpeta `functions/api/` ni posee las variables secretas (`MASTER_PASSWORD`, `SEDE_PASSWORDS_JSON`, `JWT_SECRET`, `GITHUB_PAT`). Por eso `fetch('/api/auth')` en `localhost` devuelve error `404`/HTML en lugar de autenticar.
2. **Solución:**
   - Configurar `server.proxy` y `preview.proxy` en [`vite.config.ts`](file:///f:/Desarrollo/app_lyrics/vite.config.ts) para reenviar las rutas `/api/*` hacia `https://app-ipuc-lyrics.pages.dev` con `changeOrigin: true` durante pruebas locales (y con fallback configurable mediante `VITE_API_PROXY_TARGET`).
   - En producción (`vite build` en Cloudflare Pages), esta sección de proxy de desarrollo se ignora automáticamente y la app usa sus propias Cloudflare Pages Functions.

---

## 2. Pseudocódigo y Flujo Lógico

```ts
// En vite.config.ts
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'https://app-ipuc-lyrics.pages.dev';

const devApiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: true
  }
};

export default defineConfig({
  plugins: [...],
  server: {
    proxy: devApiProxy
  },
  preview: {
    proxy: devApiProxy
  },
  resolve: { ... }
});
```

**Flujo en pruebas locales (`http://localhost:5173` o red Wi-Fi local):**
1. El usuario abre [`Iniciar App Lyrics.bat`](file:///f:/Desarrollo/app_lyrics/Iniciar%20App%20Lyrics.bat), va a **Seleccionar Congregación → Iniciar sesión** e ingresa su clave.
2. El navegador envía `POST http://localhost:5173/api/auth` (mismo origen, sin problemas de CORS).
3. Vite intercepta `/api/*` en el servidor local y lo reenvía de forma transparente a `https://app-ipuc-lyrics.pages.dev/api/auth`.
4. Cloudflare valida la contraseña contra sus secretos cifrados y devuelve el JWT válido al navegador local.

---

## 3. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `vite.config.ts` | `defineConfig` (`server`, `preview`) | Añadir objeto compartido `devApiProxy` para redirigir `/api` a `https://app-ipuc-lyrics.pages.dev` en `vite dev` y `vite preview`. |

---

## 4. Ubicación Exacta de Modificaciones

1. **[`vite.config.ts`](file:///f:/Desarrollo/app_lyrics/vite.config.ts#L5-L44):**
   - Después de los imports (línea 5), declarar `devApiProxy`.
   - Dentro de `defineConfig({ ... })` (entre las líneas 38 y 43, junto a `resolve`), añadir `server: { proxy: devApiProxy }` y `preview: { proxy: devApiProxy }`.
