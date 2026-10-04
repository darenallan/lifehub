// Toutes les clés de date sont calculées en heure locale de l'appareil.

const pad = (n) => String(n).padStart(2, '0');
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** 'YYYY-MM-DD' */
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM' */
export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** 'YYYY-Www' (semaine ISO 8601 : lundi, l'année est celle du jeudi). */
export function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** Date locale à minuit, ou null si la clé est invalide (ex. 2026-02-30). */
export function parseDayKey(key) {
  const m = DAY_KEY_RE.exec(key ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function daysInMonth(key) {
  const m = MONTH_KEY_RE.exec(key ?? '');
  if (!m) throw new RangeError(`Mois invalide : ${key}`);
  return new Date(Number(m[1]), Number(m[2]), 0).getDate();
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const longDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « samedi 4 octobre » */
export function formatLongDate(date = new Date()) {
  return longDate.format(date);
}
