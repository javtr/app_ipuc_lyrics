import { createGitHubIssue } from '../_lib/github';
import { errorResponse, jsonResponse } from '../_lib/response';
import { PagesContext } from '../_lib/types';

interface SuggestCorrectionBody {
  songId?: string;
  songTitle?: string;
  sectionLabel?: string;
  suggestedFix?: string;
  reportedBy?: string;
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  let body: SuggestCorrectionBody;
  try {
    body = (await request.json()) as SuggestCorrectionBody;
  } catch {
    return errorResponse('Cuerpo JSON inválido', 400);
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  const songTitle = typeof body.songTitle === 'string' ? body.songTitle.trim() : '';
  const sectionLabel = typeof body.sectionLabel === 'string' && body.sectionLabel.trim()
    ? body.sectionLabel.trim()
    : 'General';
  const suggestedFix = typeof body.suggestedFix === 'string' ? body.suggestedFix.trim() : '';
  const reportedBy = typeof body.reportedBy === 'string' && body.reportedBy.trim()
    ? body.reportedBy.trim().slice(0, 120)
    : 'Anónimo';

  if (!songId || !songTitle || !suggestedFix) {
    return errorResponse('Debes indicar canción y detalle de la corrección', 400);
  }

  if (suggestedFix.length > 2000) {
    return errorResponse('La descripción de corrección supera los 2000 caracteres', 400);
  }

  try {
    const issueTitle = `[Corrección] ${songTitle} - ${sectionLabel}`.slice(0, 200);
    const issueBody = [
      '### Reporte de Corrección de Letra / Acordes',
      `- **Canción:** ${songTitle} (\`${songId}\`)`,
      `- **Sección:** ${sectionLabel}`,
      `- **Reportado por:** ${reportedBy}`,
      `- **Fecha:** ${new Date().toISOString()}`,
      '',
      '#### Detalle sugerido:',
      suggestedFix
    ].join('\n');

    const issue = await createGitHubIssue(env, issueTitle, issueBody, ['correccion-letra']);
    return jsonResponse({
      ok: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al registrar sugerencia en GitHub';
    return errorResponse(message, 502);
  }
};
