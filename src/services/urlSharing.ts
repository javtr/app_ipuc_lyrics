import LZString from 'lz-string';
import { Setlist, SetlistItem } from '../types';
import { normalizeSearchText } from './songEditorHelper';

interface CompressedSetlistPayload {
  n: string; // name
  d: string; // date
  s: string; // sedeId
  i: [string, string, number, string?][]; // [songId, key, order, notes?]
}

function buildDeterministicSetlistId(name: string, date: string, sedeId: string): string {
  const nameSlug = normalizeSearchText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'culto';
  const datePart = (date || 'sin-fecha').replace(/[^0-9a-z-]/gi, '');
  const sedePart = normalizeSearchText(sedeId || 'general')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';

  return `imported_${nameSlug}_${datePart}_${sedePart}`;
}

/**
 * Serializa y comprime un repertorio dominical a un string seguro para URLs y WhatsApp.
 */
export function compressSetlist(setlist: Setlist): string {
  const payload: CompressedSetlistPayload = {
    n: setlist.name,
    d: setlist.date,
    s: setlist.sedeId,
    i: setlist.items.map(item => [
      item.songId,
      item.key,
      item.order,
      item.notes || ''
    ])
  };

  const jsonString = JSON.stringify(payload);
  return LZString.compressToEncodedURIComponent(jsonString);
}

/**
 * Descomprime un string de URL y reconstruye el objeto Setlist completo con ID determinístico.
 */
export function decompressSetlist(compressed: string): Setlist | null {
  try {
    const jsonString = LZString.decompressFromEncodedURIComponent(compressed);
    if (!jsonString) return null;

    const payload = JSON.parse(jsonString) as CompressedSetlistPayload;
    if (!payload.n || !Array.isArray(payload.i)) return null;

    const sedeId = payload.s || 'general';
    const date = payload.d || '';

    const items: SetlistItem[] = payload.i.map(raw => ({
      songId: raw[0],
      key: raw[1],
      order: raw[2],
      notes: raw[3] ? raw[3] : undefined
    }));

    return {
      id: buildDeterministicSetlistId(payload.n, date, sedeId),
      name: payload.n,
      date,
      sedeId,
      items,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error al descomprimir repertorio de URL:', error);
    return null;
  }
}

/**
 * Genera el enlace completo con hash para compartir por mensajería.
 */
export function generateShareableUrl(
  setlist: Setlist,
  baseUrl: string = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''
): string {
  const compressed = compressSetlist(setlist);
  return `${baseUrl}#repertorio=${compressed}`;
}

/**
 * Genera un enlace directo con formato WhatsApp listo para enviar con 1 clic.
 */
export function generateWhatsAppLink(setlist: Setlist, shareableUrl: string): string {
  const message = `🎵 *Repertorio de Alabanza: ${setlist.name}*\n📅 Fecha: ${setlist.date}\n\nAbre este enlace en tu teléfono o tablet para ensayar:\n${shareableUrl}`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

/**
 * Copia texto al portapapeles de forma segura incluyendo fallback para red local HTTP sin HTTPS.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continuar al fallback clásico en navegadores o contextos HTTP locales
    }
  }

  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return false;
}
