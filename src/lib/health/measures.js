// Mesures de santé (phase 7.3) : types, mise en forme, statistiques. Logique pure, testée.
// Les plages cibles viennent toujours de l'utilisateur : aucune norme médicale n'est pré-remplie,
// et les chiffres (moyenne, tendance, IMC) sont descriptifs, jamais interprétés.
import { parseStamp } from './schedule.js';

/** Types intégrés. units : unités au choix (la première par défaut). */
export const BUILTIN_TYPES = [
  {
    key: 'bp',
    label: 'Tension',
    units: ['mmHg'],
    fields: ['sys', 'dia', 'pulse'],
    required: ['sys', 'dia'],
  },
  { key: 'glucose', label: 'Glycémie', units: ['mg/dL', 'mmol/L', 'g/L'], fields: ['value'] },
  { key: 'weight', label: 'Poids', units: ['kg'], fields: ['value'] },
  { key: 'temperature', label: 'Température', units: ['°C'], fields: ['value'] },
  { key: 'pulse', label: 'Pouls', units: ['bpm'], fields: ['value'] },
  { key: 'spo2', label: 'SpO₂', units: ['%'], fields: ['value'] },
  { key: 'waist', label: 'Tour de taille', units: ['cm'], fields: ['value'] },
  { key: 'hba1c', label: 'HbA1c', units: ['%', 'mmol/mol'], fields: ['value'] },
  {
    key: 'cholesterol',
    label: 'Cholestérol',
    units: ['g/L', 'mmol/L', 'mg/dL'],
    fields: ['value'],
  },
  { key: 'peakflow', label: 'Débit de pointe', units: ['L/min'], fields: ['value'] },
];

export const FIELD_LABELS = {
  value: 'Valeur',
  sys: 'Systolique',
  dia: 'Diastolique',
  pulse: 'Pouls',
};

export const CONTEXTS = {
  fasting: 'À jeun',
  after_meal: 'Après repas',
  before_exercise: 'Avant effort',
  after_exercise: 'Après effort',
  rest: 'Au repos',
};

/**
 * Types disponibles : intégrés (avec les cibles saisies par l'utilisateur) + personnalisés.
 * rows : documents measureType (clé, libellé, unité, cibles).
 */
export function allTypes(rows) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const builtins = BUILTIN_TYPES.map((t) => ({
    ...t,
    custom: false,
    targets: byKey.get(t.key)?.targets ?? {},
  }));
  const custom = rows
    .filter((r) => r.custom)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    .map((r) => ({
      key: r.key,
      label: r.label,
      units: [r.unit ?? ''],
      fields: ['value'],
      custom: true,
      targets: r.targets ?? {},
    }));
  return [...builtins, ...custom];
}

/** Clé d'un type personnalisé : « c_ » + libellé simplifié + suffixe (évite les collisions). */
export function customKey(label, suffix) {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return `c_${slug || 'mesure'}_${suffix}`.slice(0, 30);
}

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const formatNumber = (n) => number.format(n);

/** Saisie « 78,5 » / « 125 » → nombre (2 décimales max), ou null. */
export function parseReading(text) {
  const raw = String(text ?? '')
    .trim()
    .replace(',', '.');
  if (!/^-?\d{1,6}(\.\d{1,2})?$/.test(raw)) return null;
  return Number(raw);
}

/** « 125/82 mmHg · 70 bpm », « 78,5 kg ». */
export function formatReading(type, values, unit) {
  const u = unit ?? type.units[0];
  if (type.key === 'bp') {
    const main = `${formatNumber(values.sys)}/${formatNumber(values.dia)} ${u}`;
    return values.pulse != null ? `${main} · ${formatNumber(values.pulse)} bpm` : main;
  }
  return `${formatNumber(values.value)}${u ? ` ${u}` : ''}`;
}

/** Champs hors de la plage cible saisie par l'utilisateur. */
export function outOfTarget(type, values) {
  return Object.entries(type.targets ?? {})
    .filter(([field, range]) => {
      const v = values[field];
      if (v == null || !range) return false;
      return (range.min != null && v < range.min) || (range.max != null && v > range.max);
    })
    .map(([field]) => field);
}

/** Points [{ t (minutes murales), v }] d'un champ, à partir du jour `from` (inclus). */
export function series(measures, typeKey, field, from) {
  return measures
    .filter((m) => m.typeKey === typeKey && m.date >= from && m.values?.[field] != null)
    .map((m) => ({ t: parseStamp(m.at), v: m.values[field] }))
    .sort((a, b) => a.t - b.t);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * { count, avg, min, max, trend } ; trend = 'up' | 'down' | 'flat' (pente de régression,
 * « flat » si la variation sur la période fait moins de 2 % de la moyenne), null si < 2 points.
 */
export function stats(points) {
  if (!points.length) return { count: 0, avg: null, min: null, max: null, trend: null };
  const values = points.map((p) => p.v);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const result = {
    count: values.length,
    avg: round2(avg),
    min: Math.min(...values),
    max: Math.max(...values),
    trend: null,
  };
  if (points.length < 2) return result;
  const meanT = points.reduce((a, p) => a + p.t, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - avg);
    den += (p.t - meanT) ** 2;
  }
  const slope = den ? num / den : 0;
  const change = slope * (points.at(-1).t - points[0].t);
  const scale = Math.abs(avg) || 1;
  result.trend = Math.abs(change) < 0.02 * scale ? 'flat' : change > 0 ? 'up' : 'down';
  return result;
}

/** IMC = poids / taille², arrondi à 0,1. Donné à titre descriptif, sans catégorie. */
export function bmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Dernière mesure de chaque type : Map(typeKey → mesure). */
export function latestByType(measures) {
  const latest = new Map();
  for (const m of measures) {
    const current = latest.get(m.typeKey);
    if (!current || m.at > current.at) latest.set(m.typeKey, m);
  }
  return latest;
}
