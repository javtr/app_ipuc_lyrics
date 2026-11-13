import { Env } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class GitHubConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubConflictError';
  }
}

function encodeBase64Utf8(text: string): string {
  const bytes = encoder.encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64: string): string {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return decoder.decode(bytes);
}

export function resolveRepoConfig(env: Env) {
  return {
    owner: env.GITHUB_OWNER || 'javtr',
    repo: env.GITHUB_REPO || 'app_ipuc_lyrics',
    catalogBranch: env.CATALOG_BRANCH || 'catalog'
  };
}

/**
 * Mapea un sedeId ('sede-palestina') a su rama Git ('sede/palestina').
 */
export function toSedeBranch(sedeId: string, catalogBranch: string = 'catalog'): string {
  if (!sedeId || sedeId === 'general') {
    return catalogBranch;
  }
  const slug = sedeId.startsWith('sede-') ? sedeId.slice(5) : sedeId;
  return `sede/${slug}`;
}

async function githubFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.GITHUB_PAT) {
    throw new Error('GITHUB_PAT no está configurado en Cloudflare.');
  }

  const { owner, repo } = resolveRepoConfig(env);
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AppLyrics-Cloudflare-Pages',
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
}

function encodeRepoPath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

/**
 * Lee y decodifica (UTF-8) un archivo JSON desde una rama específica de GitHub.
 */
export async function getJsonFile<T>(
  env: Env,
  branch: string,
  filePath: string
): Promise<{ data: T; sha: string } | null> {
  const res = await githubFetch(
    env,
    `/contents/${encodeRepoPath(filePath)}?ref=${encodeURIComponent(branch)}`
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Error al leer ${filePath} en ${branch} (HTTP ${res.status})`);
  }

  const payload = (await res.json()) as { content?: string; sha?: string };
  if (!payload.content || !payload.sha) {
    throw new Error(`Respuesta incompleta de GitHub al leer ${filePath}`);
  }

  const decoded = decodeBase64Utf8(payload.content);
  return {
    data: JSON.parse(decoded) as T,
    sha: payload.sha
  };
}

/**
 * Crea o actualiza un archivo JSON en la rama indicada usando la API de Contenidos de GitHub.
 */
export async function putJsonFile(
  env: Env,
  branch: string,
  filePath: string,
  data: unknown,
  sha: string | undefined,
  commitMessage: string
): Promise<void> {
  const content = encodeBase64Utf8(`${JSON.stringify(data, null, 2)}\n`);
  const res = await githubFetch(env, `/contents/${encodeRepoPath(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content,
      branch,
      ...(sha ? { sha } : {})
    })
  });

  if (res.status === 409 || res.status === 422) {
    throw new GitHubConflictError(`Conflicto de versión al escribir ${filePath} (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(`Error al guardar ${filePath} en ${branch} (HTTP ${res.status})`);
  }
}

/**
 * Garantiza que exista la rama de sede; si no existe, la crea a partir de la rama `catalog`.
 */
export async function ensureSedeBranch(env: Env, targetBranch: string): Promise<boolean> {
  const encodedBranch = encodeRepoPath(targetBranch);
  const existingRes = await githubFetch(env, `/git/ref/heads/${encodedBranch}`);
  if (existingRes.ok) {
    return false;
  }

  const { catalogBranch } = resolveRepoConfig(env);
  const baseRefRes = await githubFetch(env, `/git/ref/heads/${encodeRepoPath(catalogBranch)}`);
  if (!baseRefRes.ok) {
    throw new Error(
      `No se encontró la rama base '${catalogBranch}' en GitHub (HTTP ${baseRefRes.status})`
    );
  }

  const baseRefData = (await baseRefRes.json()) as { object?: { sha?: string } };
  const baseSha = baseRefData.object?.sha;
  if (!baseSha) {
    throw new Error(`La referencia base '${catalogBranch}' no devolvió un SHA válido.`);
  }

  const createRes = await githubFetch(env, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${targetBranch}`,
      sha: baseSha
    })
  });

  // Si otra petición concurrente acaba de crear la rama, validar sin fallar
  if (createRes.status === 422) {
    return false;
  }

  if (!createRes.ok) {
    throw new Error(`Error al crear la rama '${targetBranch}' (HTTP ${createRes.status})`);
  }

  return true;
}

/**
 * Crea un GitHub Issue para reportes de corrección de letras.
 */
export async function createGitHubIssue(
  env: Env,
  title: string,
  body: string,
  labels: string[] = ['correccion-letra']
): Promise<{ number: number; html_url: string }> {
  const res = await githubFetch(env, '/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body, labels })
  });

  if (!res.ok) {
    throw new Error(`No se pudo crear el Issue en GitHub (HTTP ${res.status})`);
  }

  return (await res.json()) as { number: number; html_url: string };
}
