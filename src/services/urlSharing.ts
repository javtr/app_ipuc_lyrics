import LZString from 'lz-string';
import { Setlist, SetlistItem } from '../types';

interface CompressedSetlistPayload {
  n: string; // name
  d: string; // date
  s: string; // sedeId
  i: [string, string, number, string?][]; // [songId, key, order, notes?]
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
 * Descomprime un string de URL y reconstruye el objeto Setlist completo.
 */
export function decompressSetlist(compressed: string): Setlist | null {
  try {
    const jsonString = LZString.decompressFromEncodedURIComponent(compressed);
    if (!jsonString) return null;

    const payload = JSON.parse(jsonString) as CompressedSetlistPayload;
    if (!payload.n || !Array.isArray(payload.i)) return null;

    const items: SetlistItem[] = payload.i.map(raw => ({
      songId: raw[0],
      key: raw[1],
      order: raw[2],
      notes: raw[3] ? raw[3] : undefined
    }));

    return {
      id: `imported_${Date.now()}`,
      name: payload.n,
      date: payload.d,
      sedeId: payload.s,
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
export function generateShareableUrl(setlist: Setlist, baseUrl: string = window.location.origin): string {
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
