// Santé : validation des objets structurés (planning, rappels) des médicaments.
// Les messages d'erreur ne contiennent jamais de valeur saisie (ils sont journalisés).

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SCHEDULE_TYPES = [
  'daily',
  'weekdays',
  'everyNDays',
  'everyNHours',
  'cycle',
  'monthly',
  'asNeeded',
];
const SCHEDULE_KEYS = new Set([
  'type',
  'times',
  'weekdays',
  'interval',
  'cycle',
  'monthDay',
  'amount',
  'maxPer24h',
  'minGapMin',
]);
const REMINDER_KEYS = [
  'enabled',
  'advanceMin',
  'repeatEveryMin',
  'repeatCount',
  'snoozeMin',
  'discreet',
];

const isInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Quantité par prise : > 0, ≤ 1000, au plus 2 décimales (½ comprimé, 2,5 ml). */
export function isDoseAmount(v) {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v > 0 &&
    v <= 1000 &&
    Math.abs(Math.round(v * 100) - v * 100) < 1e-9
  );
}

function checkTimes(times, { exactlyOne = false } = {}) {
  if (!Array.isArray(times) || times.length < 1 || times.length > 8) {
    return 'times : 1 à 8 horaires';
  }
  if (exactlyOne && times.length !== 1) return 'times : un seul horaire de départ';
  const seen = new Set();
  for (const slot of times) {
    const keysOk =
      isPlainObject(slot) && Object.keys(slot).every((k) => k === 'time' || k === 'amount');
    if (!keysOk || !TIME.test(slot.time ?? '') || !isDoseAmount(slot.amount)) {
      return 'times : horaire invalide';
    }
    if (seen.has(slot.time)) return 'times : horaire en double';
    seen.add(slot.time);
  }
  return null;
}

function checkWeekdays(days) {
  if (!Array.isArray(days) || days.length < 1 || days.length > 7) return 'weekdays : 1 à 7 jours';
  if (!days.every((d) => isInt(d, 1, 7)) || new Set(days).size !== days.length) {
    return 'weekdays : jours invalides';
  }
  return null;
}

function checkCycle(c) {
  const ok =
    isPlainObject(c) && Object.keys(c).length === 2 && isInt(c.on, 1, 365) && isInt(c.off, 1, 365);
  return ok ? null : 'cycle invalide';
}

/** Erreur (chaîne) ou null. Seules les clés utiles au type sont requises ; aucune clé inconnue. */
export function checkSchedule(s) {
  if (Object.keys(s).some((k) => !SCHEDULE_KEYS.has(k))) return 'clé inconnue';
  if (!SCHEDULE_TYPES.includes(s.type)) return 'type invalide';
  if (s.maxPer24h != null && !isInt(s.maxPer24h, 1, 48)) return 'maxPer24h invalide';
  if (s.minGapMin != null && !isInt(s.minGapMin, 0, 2880)) return 'minGapMin invalide';

  switch (s.type) {
    case 'asNeeded':
      return isDoseAmount(s.amount) ? null : 'amount invalide';
    case 'daily':
      return checkTimes(s.times);
    case 'weekdays':
      return checkTimes(s.times) ?? checkWeekdays(s.weekdays);
    case 'everyNDays':
      return checkTimes(s.times) ?? (isInt(s.interval, 2, 365) ? null : 'interval invalide');
    case 'everyNHours':
      return (
        checkTimes(s.times, { exactlyOne: true }) ??
        (isInt(s.interval, 1, 24) ? null : 'interval invalide')
      );
    case 'cycle':
      return checkTimes(s.times) ?? checkCycle(s.cycle);
    case 'monthly':
      return checkTimes(s.times) ?? (isInt(s.monthDay, 1, 31) ? null : 'monthDay invalide');
    default:
      return 'type invalide';
  }
}

export function checkReminder(r) {
  const keys = Object.keys(r);
  if (keys.length !== REMINDER_KEYS.length || !REMINDER_KEYS.every((k) => keys.includes(k))) {
    return `clés attendues : ${REMINDER_KEYS.join(', ')}`;
  }
  if (typeof r.enabled !== 'boolean' || typeof r.discreet !== 'boolean') return 'booléen attendu';
  if (!isInt(r.advanceMin, 0, 120)) return 'advanceMin invalide';
  if (!isInt(r.repeatEveryMin, 0, 120)) return 'repeatEveryMin invalide';
  if (!isInt(r.repeatCount, 0, 10)) return 'repeatCount invalide';
  if (!isInt(r.snoozeMin, 5, 240)) return 'snoozeMin invalide';
  return null;
}

// ---------- Mesures et journal (phase 7.3) ----------

export const MEASURE_FIELDS = ['value', 'sys', 'dia', 'pulse'];
const twoDecimals = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9;
const isReading = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v >= -100 && v <= 100000 && twoDecimals(v);

/** { value } ou { sys, dia, pulse? } : nombres bornés, 2 décimales au plus. */
export function checkMeasureValues(values) {
  const keys = Object.keys(values);
  if (keys.length < 1 || keys.length > 3) return '1 à 3 valeurs';
  if (!keys.every((k) => MEASURE_FIELDS.includes(k))) return 'champ de mesure inconnu';
  if (!keys.every((k) => isReading(values[k]))) return 'valeur invalide';
  return null;
}

/** { champ: { min, max } } : bornes saisies par l'utilisateur, min ≤ max. */
export function checkTargets(targets) {
  for (const [key, range] of Object.entries(targets)) {
    if (!MEASURE_FIELDS.includes(key)) return 'champ de cible inconnu';
    if (!isPlainObject(range)) return 'cible invalide';
    const keys = Object.keys(range);
    if (keys.length !== 2 || !keys.includes('min') || !keys.includes('max')) {
      return 'cible : min et max attendus';
    }
    const { min, max } = range;
    if (![min, max].every((v) => v === null || isReading(v))) return 'cible invalide';
    if (min !== null && max !== null && min > max) return 'cible : min > max';
  }
  return null;
}

const shortText = (v, max) => typeof v === 'string' && v.trim().length >= 1 && v.length <= max;

/** [{ name, severity 1..5, note|null }], 20 max, sans doublon de nom. */
export function checkSymptoms(list) {
  if (list.length > 20) return '20 symptômes maximum';
  const seen = new Set();
  for (const s of list) {
    const keysOk =
      isPlainObject(s) &&
      Object.keys(s).length === 3 &&
      ['name', 'severity', 'note'].every((k) => k in s);
    if (!keysOk || !shortText(s.name, 40) || !isInt(s.severity, 1, 5)) return 'symptôme invalide';
    if (s.note !== null && !(typeof s.note === 'string' && s.note.length <= 100)) {
      return 'note de symptôme invalide';
    }
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) return 'symptôme en double';
    seen.add(key);
  }
  return null;
}

/** Tags libres : 20 max, 30 caractères, sans doublon. */
export function checkTags(list) {
  if (list.length > 20) return '20 tags maximum';
  if (!list.every((t) => shortText(t, 30))) return 'tag invalide';
  if (new Set(list.map((t) => t.trim().toLowerCase())).size !== list.length) return 'tag en double';
  return null;
}

// ---------- Rendez-vous (phase 7.4) ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Médicaments liés à un rendez-vous : 20 ids max, sans doublon. */
export function checkMedIds(list) {
  if (list.length > 20) return '20 médicaments maximum';
  if (!list.every((id) => typeof id === 'string' && UUID.test(id))) return 'identifiant invalide';
  if (new Set(list).size !== list.length) return 'médicament en double';
  return null;
}
