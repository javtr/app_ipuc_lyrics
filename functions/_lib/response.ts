/**
 * Construye una respuesta JSON uniforme sin almacenamiento en caché para endpoints serverless.
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

/**
 * Construye una respuesta de error estructurada en formato JSON.
 */
export function errorResponse(
  message: string,
  status: number = 400,
  extraPayload?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Response {
  return jsonResponse({ ok: false, error: message, ...extraPayload }, status, extraHeaders);
}
