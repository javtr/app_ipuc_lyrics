# Plan de Desarrollo — Extractor Local desde Generación Pentecostal (`wp-json`) con Deduplicación contra el Catálogo Actual

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de crear el script y `.bat` en `herramientas_locales/`).

---

## 1. Análisis de Viabilidad Confirmado

Se inspeccionó `https://www.generacionpentecostal.com/letras-de-canciones/` en modo solo lectura y se confirmó que es **100% viable**:

1. **Sin CAPTCHA ni bloqueos anti-bot:** responde `HTTP 200 OK` directamente.
2. **WordPress REST API oficial disponible (`/wp-json/wp/v2/posts`):**
   - La categoría **`Letras`** (`categories=127`) expone **3,047 canciones** estructuradas en JSON (`title.rendered`, `content.rendered`, `slug`, `link`, `modified`).
   - Usando paginación `per_page=100` (leyendo `X-WP-TotalPages` dinámicamente, ~31 peticiones en total), el script descarga las ~3,047 letras en pocos segundos con pausas respetuosas entre páginas (sin necesidad de abrir miles de URLs HTML individuales).
3. **Estructura predecible de títulos y letras:**
   - **Títulos:** siguen patrones como `"Letra Santo es el que vive de Montesanto"` o `"SUELTO – Letra de la canción de Sarai Rivera"`, permitiendo extraer limpiamente tanto el **título** como el **artista**.
   - **Letras (`content.rendered`):** organizadas en bloques `<p>...</p>` con `<br />` entre líneas, más bloques finales promocionales (`"Suscríbete a nuestro Canal de Youtube"`, `<script>`, `<iframe>`) que se descartan automáticamente.

---

## 2. Objetivo Técnico

Crear un segundo utilitario estrictamente local dentro de `herramientas_locales/` (ya excluida en [`.gitignore`](file:///f:/Desarrollo/app_lyrics/.gitignore#L14) para que nunca se suba a GitHub ni a Cloudflare Pages):

1. **Script extractor (`herramientas_locales/importar_generacion_pentecostal.py`):**
   - Consultar `/wp-json/wp/v2/posts?categories=127` página por página con reintentos suaves y pausa entre peticiones (`0.3 s`).
   - Limpiar entidades HTML (`&#8211;`, `&nbsp;`, etc.), extraer título limpio y artista cuando venga indicado (`" de <Artista>"` / `"Letra de la canción de <Artista>"`), eliminar nodos `<script>`, `<style>`, `<iframe>` y párrafos promocionales (`"Suscríbete"`, `"Canal de Youtube"`, enlaces externos, etc.).
   - Convertir cada párrafo `<p>` en secciones válidas de `BaseSong` (`Verso 1..N`, y `Coro` si un encabezado explícito dice `Coro:` / `CORO`).
   - **Contraste doble contra el catálogo existente** (leyendo `--existing` desde `herramientas_locales/salida/catalog.json` o `origin/catalog:catalog.json`):
     1. Coincidencia por **título normalizado** (sin tildes, signos iniciales ni sufijo de artista).
     2. Coincidencia por **huella de inicio de letra** (primeras 2 líneas limpias normalizadas de ≥ 20 caracteres), para evitar duplicados aunque el título varíe ligeramente.
   - Generar:
     - `herramientas_locales/salida/nuevas_generacion_pentecostal.json` (solo las canciones nuevas detectadas, para inspección).
     - `herramientas_locales/salida/catalog.json` (catálogo consolidado listo para subir: canciones existentes protegidas + nuevas canciones añadidas, con IDs slug únicos y formato JSON compacto).
     - `herramientas_locales/salida/resumen_generacion_pentecostal.txt` (estadísticas de descarga, descartes, duplicados detectados y total final).
2. **Lanzador interactivo (`herramientas_locales/Importar Web Generacion Pentecostal.bat`):**
   - Permite ejecutar el proceso con doble clic, pregunta opcionalmente la ruta del `catalog.json` base (Enter para usar `herramientas_locales\salida\catalog.json` o `origin/catalog:catalog.json`) y muestra el resumen al finalizar.

---

## 3. Pseudocódigo y Flujo Lógico

```python
# 1. Cargar catálogo base existente (para proteger canciones y evitar duplicados)
existing_songs = load_existing_catalog(existing_path_or_git_origin_catalog)
title_index = { normalize_title_key(s["title"]): s for s in existing_songs }
lyrics_fp_index = { build_lyrics_fingerprint(s["sections"]): s for s in existing_songs }

# 2. Paginar WP REST API categoría 127 ("Letras")
page = 1
while True:
    posts, total_pages = fetch_wp_posts(category_id=127, page=page, per_page=100)
    for post in posts:
        title, artist = extract_clean_title_and_artist(post["title"]["rendered"])
        blocks = extract_clean_html_blocks(post["content"]["rendered"])
        # Descartar scripts, iframes y líneas promocionales ("Suscríbete", "Canal de Youtube", etc.)
        sections = blocks_to_sections(blocks)
        if not title or not sections:
            skipped += 1
            continue

        tkey = normalize_title_key(title)
        lfp = build_lyrics_fingerprint(sections)
        if tkey in title_index or (lfp and lfp in lyrics_fp_index):
            duplicates += 1
            # Opcionalmente enriquecer artist/tag si faltaba en el registro nuevo sin pisar acordes
            continue

        new_song = build_base_song(title=title, artist=artist, sections=sections, tags=["Generación Pentecostal"])
        new_songs.append(new_song)
        title_index[tkey] = new_song
        if lfp:
            lyrics_fp_index[lfp] = new_song

    if page >= total_pages:
        break
    page += 1
    time.sleep(0.3)

# 3. Exportar nuevas_generacion_pentecostal.json + catalog.json consolidado compacto + resumen
```

---

## 4. Impacto y Ubicación Exacta

| Archivo | Propósito | Alcance |
| :--- | :--- | :--- |
| `herramientas_locales/importar_generacion_pentecostal.py` | Script extractor WP REST API + deduplicación doble | Solo local (ignorado por Git en `.gitignore`). |
| `herramientas_locales/Importar Web Generacion Pentecostal.bat` | Lanzador Windows con doble clic | Solo local (ignorado por Git en `.gitignore`). |
| `herramientas_locales/salida/nuevas_generacion_pentecostal.json` | Canciones nuevas extraídas sin duplicar | Generado al ejecutar. |
| `herramientas_locales/salida/catalog.json` | Catálogo consolidado listo para subir a rama `catalog` | Generado al ejecutar. |
| `herramientas_locales/salida/resumen_generacion_pentecostal.txt` | Reporte exacto de extracción y duplicados | Generado al ejecutar. |
