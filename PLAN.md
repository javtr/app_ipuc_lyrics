# Plan de Desarrollo — Extractor Multi-Formato e Importación Masiva al Catálogo General (`catalog.json`)

> **Estado:** Fase 1 (Discusión y Planificación en Modo Solo Lectura — Esperando aprobación expresa del usuario antes de crear/modificar archivos en `src/`, `functions/` o `tests/`, o de subir el catálogo a `origin/catalog`).

---

## 1. Diagnóstico de las Fuentes Analizadas (`C:\Users\Javier-pc\Desktop\letras_ipuc`)

Se inspeccionaron **1,346 archivos** en modo solo lectura, encontrando 4 fuentes con estructuras distintas:

1. **`Coros RTF SIN REPETIR/` (1,181 archivos `.rtf`):**
   - Codificación `Windows-1252` (`ansicpg1252`) con bloques internos extensos de Word (`{\*\datastore ...}`, `{\fonttbl ...}`) que deben ignorarse.
   - El nombre suele traer sufijo numérico (`CELEBRA VICTORIOSO_1019.rtf`) y existen duplicados parciales (`_9.rtf`, `_10.rtf`). Muchas veces la primera línea repite el título y algunas estrofas están en mayúsculas sostenidas.
2. **`presentaciones letras/` (163 archivos `.ppsx`):**
   - Paquetes OpenXML ZIP (`ppt/slides/slide*.xml`).
   - Cada diapositiva representa una sección natural; los saltos de línea internos usan `<a:br/>` dentro de `<a:p>`, y los marcadores de pie/número de diapositiva (`1,4`, `2,4`) viven en formas `<p:ph type="ftr"|"sldNum"|"dt"|"hdr"/>` que deben excluirse.
3. **`Himnario Lluvias de Bendición.pdf` (253 páginas):**
   - Diseño de **1 columna** con ~253 himnos numerados (`1. LOORES DAD A CRISTO EL REY` ... `253. A DIOS EL PADRE` hasta página 251), estrofas en números romanos (`I`, `II`, `III`...) y secciones `CORO`.
   - Con `pdfplumber` (`x_tolerance=3, y_tolerance=3`) el texto sale limpio sin partir palabras.
4. **`himnario manantial de inspiracion.pdf` (142 páginas):**
   - Páginas 1–10: portada/presentación. Páginas **11–116**: himnos numerados en **diseño de 2 columnas por página**, con estrofas (`I`, `II`...), `Coro` y nombre del autor al pie. Páginas **117–142**: consejos útiles e índices alfabéticos/temáticos (se excluyen).
   - Requiere recorte por columna (`izquierda` y luego `derecha` con `pdfplumber`) para no mezclar líneas de dos himnos distintos.

---

## 2. Objetivo Técnico

1. **Crear el script importador en Python (`src/scripts/import_catalog.py`):**
   - Leer en **modo solo lectura** todas las fuentes de `C:\Users\Javier-pc\Desktop\letras_ipuc`.
   - Parsear `.rtf`, `.ppsx`, `Lluvias` (1 columna) y `Manantial` (2 columnas), limpiar títulos (eliminando prefijos numéricos `123. `, sufijos `_1019` y normalizando mayúsculas sostenidas a formato legible), detectar secciones (`Verso 1..N`, `Coro`) y asignar etiquetas por fuente (`"Himnario Lluvias de Bendición"`, `"Manantial de Inspiración"`, `"Coro"`, `"Presentación"`).
   - **Preservar canciones existentes del catálogo (`origin/catalog:catalog.json`)**: conservar intactos sus acordes ChordPro, `originalKey`, `bpm`, `timeSignature`, `artist` y `tags`.
   - **Deduplicar inteligentemente** por título normalizado (sin tildes ni signos `¡`/`¿`) y similitud de letra, conservando la versión de mayor prioridad (`Catálogo actual con acordes` > `Lluvias` > `Manantial` > `PPSX` > `RTF`) y generando IDs slug únicos (`BaseSong` válido para [`isValidBaseSong`](file:///f:/Desarrollo/app_lyrics/src/services/gitSyncService.ts#L48-L59)).
   - Emitir un archivo `src/data/imported_catalog.json` validado y un resumen estadístico detallado (conteo por fuente, duplicados fusionados, tamaño total y posibles archivos vacíos/ilegibles).
2. **Asegurar soporte para catálogos > 1 MB en el backend ([`functions/_lib/github.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/github.ts)):**
   - GitHub REST API `/contents/` omite `payload.content` cuando un archivo supera 1 MB. Actualizar `getJsonFile` para hacer fallback automático a `/git/blobs/{sha}` si `payload.content` viene vacío y `payload.sha` está presente, y guardar JSON compacto en `putJsonFile` para minimizar tamaño y consumo móvil.
3. **Subida controlada a `origin/catalog`:**
   - Validar el JSON generado con pruebas unitarias/validación de esquema `BaseSong` y publicar `catalog.json` en la rama `catalog` de `javtr/app_ipuc_lyrics` para que esté disponible en toda la iglesia al instante vía `/api/sync`.

---

## 3. Pseudocódigo y Flujo Lógico

### A. Script Importador (`src/scripts/import_catalog.py`)

```python
# 1. Extractores por formato (solo lectura)
def parse_rtf_text(path) -> str:
    # Leer bytes en cp1252; recorrer grupos {...} con pila:
    # - Ignorar destinos especiales (\*\..., fonttbl, colortbl, stylesheet, info, header, footer, datastore)
    # - Decodificar \'hh (cp1252), \uN, \par/\line -> '\n', \tab -> ' '
    # - Limpiar líneas vacías repetidas

def parse_ppsx_slides(path) -> list[list[str]]:
    # Abrir ZIP; ordenar ppt/slides/slide(\d+).xml numéricamente
    # Para cada <p:sp>: ignorar si tiene <p:ph type="ftr"|"sldNum"|"dt"|"hdr"/>
    # Para cada <a:p>: unir <a:t> y convertir <a:br/> en salto de línea '\n'
    # Devolver lista de diapositivas no vacías

def parse_pdf_lluvias(path) -> list[RawSong]:
    # Páginas 1..251 con pdfplumber (x_tolerance=3, y_tolerance=3)
    # Concatenar líneas eliminando números sueltos de página
    # Dividir por cabecera ^(\d{1,3})\.\s+(.+)$ -> (num, title, body_lines)

def parse_pdf_manantial(path) -> list[RawSong]:
    # Páginas 11..116 con pdfplumber; detenerse si aparece "Consejos Utiles"
    # Por cada página: recortar (0, 0, mid, h) y luego (mid, 0, w, h)
    # Descartar ruido numérico aislado ('0' en encabezado)
    # Dividir por cabecera ^(\d{1,3})\.\s+(.+)$ y detectar línea final de autor si aplica

# 2. Constructor de secciones BaseSong
def build_sections(blocks_or_lines) -> list[SongSection]:
    # Detectar encabezados I, II, III, IV... -> Verso 1, Verso 2...
    # Detectar "CORO" / "Coro:" -> type='chorus', label='Coro'
    # Si no hay marcadores explícitos, dividir por bloques separados por línea en blanco
    # Garantizar al menos 1 sección válida con líneas no vacías

# 3. Fusión y Deduplicación
def merge_and_deduplicate(existing_catalog, extracted_sources) -> list[BaseSong]:
    # index_by_norm_title: mapa de título normalizado -> canción ganadora
    # 1) Insertar canciones de existing_catalog (protegidas; conservan acordes, id y metadata)
    # 2) Recorrer fuentes en orden de prioridad: Lluvias -> Manantial -> PPSX -> RTF
    #    - Si título normalizado ya existe: fusionar tags faltantes y conservar la canción prioritaria
    #    - Si es nueva: asignar slug único (a-z0-9-), originalKey='C', updatedAt=NOW_ISO
    # 3) Ordenar resultado alfabéticamente y escribir JSON compacto en src/data/imported_catalog.json
```

### B. Lectura Segura > 1 MB en Backend (`functions/_lib/github.ts`)

```ts
// En getJsonFile(env, branch, filePath):
const payload = (await res.json()) as { content?: string; sha?: string };
let encodedContent = payload.content;

// Si GitHub omite content (archivo > 1 MB), leer vía Git Blob API usando el sha
if (!encodedContent && payload.sha) {
  const blobRes = await githubFetch(env, `/git/blobs/${encodeURIComponent(payload.sha)}`);
  if (!blobRes.ok) {
    throw new Error(`Error al leer blob de ${filePath} (HTTP ${blobRes.status})`);
  }
  const blobPayload = (await blobRes.json()) as { content?: string };
  encodedContent = blobPayload.content;
}

// En putJsonFile: usar JSON.stringify(data) compacto si filePath === 'catalog.json' o tamaño > 500 KB
```

---

## 4. Impacto (Archivos, Clases y Métodos Afectados)

| Archivo | Elemento | Cambio |
| :--- | :--- | :--- |
| `src/scripts/import_catalog.py` | Script completo | Nuevo script de extracción RTF / PPSX / PDF (1 y 2 columnas), normalización, deduplicación y exportación a `BaseSong[]`. |
| `src/data/imported_catalog.json` | Catálogo generado | Salida JSON validada lista para publicar en la rama `catalog` (`catalog.json`). |
| `functions/_lib/github.ts` | `getJsonFile`, `putJsonFile` | Soporte transparente para archivos > 1 MB vía `/git/blobs/{sha}` y escritura JSON compacta para catálogos grandes. |
| `tests/etapaB.test.ts` | Suite Etapa B | Prueba unitaria para `getJsonFile` cuando GitHub omite `content` y responde vía `/git/blobs/{sha}`, más validación del catálogo importado. |

---

## 5. Ubicación Exacta de Modificaciones

1. **[`src/scripts/import_catalog.py`](file:///f:/Desarrollo/app_lyrics/src/scripts/import_catalog.py):** archivo nuevo.
2. **[`src/data/imported_catalog.json`](file:///f:/Desarrollo/app_lyrics/src/data/imported_catalog.json):** archivo nuevo generado por el script (temporal/exportación verificable).
3. **[`functions/_lib/github.ts`](file:///f:/Desarrollo/app_lyrics/functions/_lib/github.ts#L80-L125):**
   - En `getJsonFile` (líneas 98–107): añadir fallback a `/git/blobs/${payload.sha}` cuando `!payload.content && payload.sha`.
   - En `putJsonFile` (línea 121): usar serialización compacta (`JSON.stringify(data)`) cuando la longitud supere 500 KB.
4. **[`tests/etapaB.test.ts`](file:///f:/Desarrollo/app_lyrics/tests/etapaB.test.ts#L730-L738):**
   - Al final del archivo, añadir prueba de lectura de blob > 1 MB en `/api/commit` (`getJsonFile`).
