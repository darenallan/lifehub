// Identifiants déterministes : la même graine donne le même UUID sur tous les appareils.
// Sert aux documents « une ligne par (x, jour) » pour que deux appareils écrivent la même ligne.

/** SHA-256(graine) → UUID version 8 (RFC 9562, contenu libre). */
export async function deterministicId(seed) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
