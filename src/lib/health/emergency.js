// Carte d'urgence : logique pure (pas de DOM, pas de stockage), testée dans tests/unit/health.test.js.

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Même motif que l'API et la contrainte CHECK de la base. Numéros courts acceptés (15, 112, 185).
const PHONE = /^\+?\(?[0-9][0-9 .()-]{1,22}$/;

export function isValidPhone(value) {
  return typeof value === 'string' && PHONE.test(value.trim());
}

/** Lien d'appel : on ne garde que les chiffres et le « + » initial. */
export function telHref(phone) {
  const trimmed = String(phone ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}` : null;
}

/** Texte libre « une par ligne » (virgules et points-virgules acceptés) → liste sans doublon. */
export function splitList(text) {
  const seen = new Set();
  const items = [];
  for (const raw of String(text ?? '').split(/[\n,;]+/)) {
    const item = raw.trim();
    const key = item.toLocaleLowerCase('fr');
    if (item && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

/** Champ texte facultatif : espaces retirés, chaîne vide → null (efface la valeur). */
export function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

/** Taille en cm saisie librement → entier entre 50 et 250, ou null si vide/invalide. */
export function parseHeight(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{2,3}$/.test(text)) return null;
  const cm = Number(text);
  return cm >= 50 && cm <= 250 ? cm : null;
}

export const sortContacts = (contacts) =>
  [...contacts].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'));

/** Vrai si la carte a de quoi aider un secouriste. */
export function hasEmergencyInfo(profile, contacts) {
  if (contacts.length) return true;
  if (!profile) return false;
  return Boolean(
    profile.bloodGroup ||
    profile.allergies ||
    profile.conditions ||
    profile.emergencyNotes ||
    profile.doctorPhone,
  );
}
