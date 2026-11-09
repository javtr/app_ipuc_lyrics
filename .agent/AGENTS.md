# Directivas del Agente y Políticas de Seguridad

## 1. Reglas Inviolables de Sandbox y Acceso al Sistema de Archivos
- **Permiso de Lectura Global:** Tienes autorización total para inspeccionar, leer y analizar cualquier archivo, módulo, dependencia o directorio fuera de la carpeta de desarrollo si es necesario para entender la arquitectura, interfaces, tipos o lógica del sistema global.
- **Prohibición Absoluta de Escritura Externa:** Queda terminantemente prohibido crear, modificar, sobrescribir o eliminar archivos fuera del directorio de desarrollo (`src/` y `tests/`).
- **Mecanismos de Modificación Prohibidos:** Esta prohibición aplica a:
  - Ediciones directas mediante llamadas a herramientas de archivos.
  - Creación o ejecución de scripts (Python, Bash, PowerShell, Node, etc.) que escriban o manipulen rutas fuera de la carpeta de desarrollo.
  - Comandos de terminal, pipes, redirecciones (`>`, `>>`) o herramientas CLI que toquen archivos o directorios fuera de la carpeta de desarrollo.
- **Archivos Sensibles:** Jamás leas, expongas ni modifiques archivos `.env`, credenciales, llaves API o secretos.

## 2. Protocolo Operativo Obligatorio (Two-Phase Gate)
Operarás estrictamente bajo un flujo supervisado por el usuario:

### Fase 1: Discusión y Planificación (Modo Solo Lectura)
- **Lectura Obligatoria de Especificaciones:** Antes de analizar o formular cualquier propuesta técnica, es mandatorio leer e interiorizar el archivo `SPECIFICATIONS.md` (y `.agent/ARCHITECTURE.md`) para asegurar total alineación con la visión del producto, los modos de visualización (Modo Lector por defecto vs. Modo Músico), la experiencia mobile-first y las restricciones arquitectónicas de costo $0.
- Cuando el usuario plantee una tarea, analiza el código relevante (dentro y fuera de la carpeta de desarrollo según corresponda).
- Diseña una solución técnica definitiva y redáctala en el archivo `PLAN.md`.
- El plan debe incluir obligatoriamente:
  1. **Objetivo técnico:** Alcance exacto y justificación del cambio.
  2. **Pseudocódigo y flujo lógico:** Estructura clara y flujo de los datos antes de escribir código real.
  3. **Impacto:** Archivos, clases y métodos afectados.
  4. **Ubicación exacta:** Archivo, clase, método y referencia de líneas exactas donde se aplicará la modificación.
- **EN ESTA FASE QUEDA PROHIBIDO TOCAR CÓDIGO FUENTE O TESTS.** Espera la revisión humana.

### Fase 2: Ejecución (Requiere Aprobación Expresa)
- Solo comenzarás a implementar cuando el usuario escriba una orden explícita de aprobación (ej: "Aprobado", "Ejecuta el plan").
- **Estándar de Entrega:** Todo el código debe ser 100% completo, funcional y listo para producción.
- **Prohibición de Placeholders:** Prohibido usar comentarios de delegación como `// tu código aquí`, `// resto del código igual`, `pass` o métodos incompletos.
- **Especificación de Ubicación:** Indica siempre archivo exacto, clase, método y las líneas precisas antes/después de las cuales se inserta o reemplaza el código.
