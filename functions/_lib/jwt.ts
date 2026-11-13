import { errorResponse } from './response';
import { Env, JwtClaims } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

/**
 * Compara dos cadenas en tiempo constante mediante su digest SHA-256 para evitar filtraciones por timing.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b))
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0 && a.length === b.length;
}

/**
 * Firma un token JWT stateless (HMAC-SHA256) usando Web Crypto API.
 */
export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const headerSegment = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadSegment = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifica firma y vigencia de un JWT; retorna sus claims o null si es inválido/expirado.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, sigSegment] = parts;
  if (!headerSegment || !payloadSegment || !sigSegment) return null;

  try {
    const key = await importHmacKey(secret, ['verify']);
    const sigBytes = base64UrlToBytes(sigSegment);
    const signingInput = encoder.encode(`${headerSegment}.${payloadSegment}`);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      signingInput.buffer as ArrayBuffer
    );
    if (!isValid) return null;

    const claims = JSON.parse(decoder.decode(base64UrlToBytes(payloadSegment))) as Partial<JwtClaims>;
    if (
      (claims.role !== 'master' && claims.role !== 'sede') ||
      typeof claims.sedeId !== 'string' ||
      typeof claims.branch !== 'string' ||
      typeof claims.exp !== 'number'
    ) {
      return null;
    }

    if (Date.now() >= claims.exp) {
      return null;
    }

    return claims as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Extrae y valida el token Bearer de una petición HTTP protegida.
 */
export async function requireAuth(request: Request, env: Env): Promise<JwtClaims | Response> {
  if (!env.JWT_SECRET) {
    return errorResponse('Servidor sin JWT_SECRET configurado', 500);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return errorResponse('Sesión de administrador requerida', 401);
  }

  const claims = await verifyJwt(match[1].trim(), env.JWT_SECRET);
  if (!claims) {
    return errorResponse('Sesión inválida o expirada. Inicia sesión nuevamente.', 401);
  }

  return claims;
}
