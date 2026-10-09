// Journal santé quotidien (phase 7.3) : logique pure, testée dans tests/unit/tracking.test.js.
// Humeur et sommeil ne sont pas ici : ils restent dans habitDay (une seule source de vérité).

export const DEFAULT_SYMPTOMS = [
  'Fatigue',
  'Maux de tête',
  'Fièvre',
  'Toux',
  'Nausée',
  'Vertiges',
  'Douleur abdominale',
  'Essoufflement',
  'Courbatures',
  'Insomnie',
  'Anxiété',
  'Rhume',
];

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
export const ENERGY = ['Épuisé', 'Fatigué', 'Moyen', 'En forme', "Plein d'énergie"];

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ajoute (intensité 3 par défaut) ou retire un symptôme ; 20 maximum. */
export function toggleSymptom(list, name) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return list;
  if (list.some((s) => sameName(s.name, clean))) {
    return list.filter((s) => !sameName(s.name, clean));
  }
  if (list.length >= 20) return list;
  return [...list, { name: clean, severity: 3, note: null }];
}

export function setSeverity(list, name, severity) {
  return list.map((s) => (sameName(s.name, name) ? { ...s, severity } : s));
}

/** « chaleur, stress , Chaleur » → ['chaleur', 'stress'] (20 max, 30 caractères). */
export function parseTags(text) {
  const seen = new Set();
  const tags = [];
  for (const raw of String(text ?? '').split(',')) {
    const tag = raw.trim().slice(0, 30);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key) && tags.length < 20) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

/** Heures de sommeil saisies (« 7,5 ») → minutes (null si vide, undefined si invalide). */
export function parseSleep(text) {
  const raw = String(text ?? '')
    .trim()
    .replace(',', '.');
  if (!raw) return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw)) return undefined;
  const minutes = Math.round(Number(raw) * 60);
  return minutes <= 1440 ? minutes : undefined;
}

export const formatSleep = (minutes) =>
  minutes == null ? '' : String(Math.round((minutes / 60) * 100) / 100).replace('.', ',');

/** Résumé d'une journée pour l'accueil Santé. */
export function journalSummary(entry, habitDay) {
  const parts = [];
  if (habitDay?.mood) parts.push(MOODS[habitDay.mood - 1]);
  if (entry?.energy) parts.push(`Énergie ${entry.energy}/5`);
  if (entry?.painLevel != null) parts.push(`Douleur ${entry.painLevel}/10`);
  if (entry?.symptoms?.length) parts.push(`${entry.symptoms.length} symptôme(s)`);
  return parts.join(' · ');
}
