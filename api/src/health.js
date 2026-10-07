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
