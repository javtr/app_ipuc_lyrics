/**
 * Configuración centralizada del origen de datos en GitHub.
 * Al migrar a una cuenta oficial, basta actualizar `owner` y `repo`.
 */
export const GIT_CONFIG = {
  owner: 'javtr',
  repo: 'app_ipuc_lyrics',
  catalogBranch: 'catalog',
  rawBaseUrl: 'https://raw.githubusercontent.com'
} as const;

/**
 * Mapea un identificador de sede al nombre de su rama de datos en Git.
 * - 'general' -> 'catalog'
 * - 'sede-palestina' -> 'sede/palestina'
 */
export function getSedeBranch(sedeId?: string): string {
  if (!sedeId || sedeId === 'general') {
    return GIT_CONFIG.catalogBranch;
  }

  const slug = sedeId.startsWith('sede-') ? sedeId.slice(5) : sedeId;
  return `sede/${slug}`;
}

/**
 * Construye la URL pública de lectura directa para archivos JSON en GitHub Raw.
 */
export function getRawFileUrl(
  branch: string,
  filePath: string,
  cacheBustTimestamp?: number
): string {
  const cleanFilePath = filePath.replace(/^\/+/, '');
  const encodedBranch = branch
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const baseUrl = `${GIT_CONFIG.rawBaseUrl}/${GIT_CONFIG.owner}/${GIT_CONFIG.repo}/${encodedBranch}/${cleanFilePath}`;
  if (cacheBustTimestamp !== undefined) {
    return `${baseUrl}?t=${cacheBustTimestamp}`;
  }

  return baseUrl;
}
