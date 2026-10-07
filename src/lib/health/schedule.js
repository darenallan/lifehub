// Planning des médicaments : logique pure, testée dans tests/unit/schedule.test.js.
//
// Heures « murales » : « 08:00 » reste 08:00 partout (Casablanca ↔ Ouagadougou, changement d'heure
// du Ramadan au Maroc). Tout est donc calculé en minutes sur des jours civils (index de jour UTC
// × 1440 + heure:minute), sans jamais passer par un fuseau. Seul nowStamp() lit l'horloge locale.
import { daysInMonth, dayKey } from '../dates.js';

const DAY_MIN = 1440;
const DAY_MS = 86_400_000;
export const GRACE_MIN = 120; // une prise reste « à prendre » 2 h, puis devient « manquée »

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → nombre de jours depuis le 1970-01-01. */
export function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function dayFromIndex(index) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** Lundi = 1 … dimanche = 7 (le 1970-01-01 était un jeudi). */
export function isoWeekday(index) {
  return ((((index + 3) % 7) + 7) % 7) + 1;
}

const timeMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const formatTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function wallMinutes(date, time) {
  return dayIndex(date) * DAY_MIN + timeMinutes(time);
}

/** 'YYYY-MM-DDTHH:mm' ↔ minutes murales. */
export function parseStamp(stamp) {
  return wallMinutes(stamp.slice(0, 10), stamp.slice(11, 16));
}

export function formatStamp(minutes) {
  const day = Math.floor(minutes / DAY_MIN);
  return `${dayFromIndex(day)}T${formatTime(minutes - day * DAY_MIN)}`;
}

/** Heure murale de l'appareil, 'YYYY-MM-DDTHH:mm'. */
export function nowStamp(date = new Date()) {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Clé d'une prise planifiée (graine de son identifiant déterministe). */
export const doseKey = (medId, date, time) => `${medId}|${date}|${time}`;

const byTime = (a, b) => a.time.localeCompare(b.time);

function hourlySlots(schedule, offset) {
  const [{ time, amount }] = schedule.times;
  const step = schedule.interval * 60;
  const t0 = timeMinutes(time); // minutes après minuit du jour de début
  const dayStart = offset * DAY_MIN;
  const slots = [];
  const k = Math.max(0, Math.ceil((dayStart - t0) / step));
  for (let m = t0 + k * step; m < dayStart + DAY_MIN; m += step) {
    slots.push({ time: formatTime(m - dayStart), amount });
  }
  return slots;
}

/** Horaires du jour `date`, `offset` jours après le début du traitement. */
function slotsOn(schedule, offset, index, date) {
  const { times = [] } = schedule;
  switch (schedule.type) {
    case 'daily':
      return times;
    case 'weekdays':
      return schedule.weekdays.includes(isoWeekday(index)) ? times : [];
    case 'everyNDays':
      return offset % schedule.interval === 0 ? times : [];
    case 'cycle': {
      const { on, off } = schedule.cycle;
      return offset % (on + off) < on ? times : [];
    }
    case 'monthly': {
      // Le 31 d'un mois de 30 jours : dernier jour du mois.
      const target = Math.min(schedule.monthDay, daysInMonth(date.slice(0, 7)));
      return Number(date.slice(8)) === target ? times : [];
    }
    case 'everyNHours':
      return hourlySlots(schedule, offset);
    default:
      return [];
  }
}

/**
 * Prises planifiées d'un médicament entre deux jours inclus, bornées par ses dates de traitement.
 * → [{ key, medId, date, time, amount }] triées. Rien pour « à la demande ».
 */
export function occurrencesBetween(med, from, to) {
  const schedule = med.schedule;
  if (!schedule || schedule.type === 'asNeeded') return [];
  const start = dayIndex(med.startDate);
  const first = Math.max(dayIndex(from), start);
  const last = Math.min(dayIndex(to), med.endDate ? dayIndex(med.endDate) : Infinity);
  const out = [];
  for (let index = first; index <= last; index++) {
    const date = dayFromIndex(index);
    const slots = [...slotsOn(schedule, index - start, index, date)].sort(byTime);
    for (const { time, amount } of slots) {
      out.push({ key: doseKey(med.id, date, time), medId: med.id, date, time, amount });
    }
  }
  return out;
}

/** Journal des prises planifiées, indexé par clé de prise. */
export function indexLogs(logs) {
  const map = new Map();
  for (const log of logs) {
    if (log.scheduled) map.set(doseKey(log.medId, log.date, log.time), log);
  }
  return map;
}

/**
 * upcoming | due | taken | skipped | snoozed | missed.
 * `now` en minutes murales. Un report expiré repart de l'heure de fin du report.
 */
export function statusFor(occurrence, log, now, graceMin = GRACE_MIN) {
  if (log?.status === 'taken') return 'taken';
  if (log?.status === 'skipped') return 'skipped';
  let base = wallMinutes(occurrence.date, occurrence.time);
  if (log?.status === 'snoozed' && log.snoozeUntil) {
    const until = parseStamp(log.snoozeUntil);
    if (now < until) return 'snoozed';
    base = until;
  }
  if (now < base) return 'upcoming';
  return now <= base + graceMin ? 'due' : 'missed';
}

function withStatus(med, index, now) {
  return (occurrence) => {
    const log = index.get(occurrence.key) ?? null;
    return { occurrence, med, log, status: statusFor(occurrence, log, now) };
  };
}

/** Prises du jour de tous les traitements actifs : [{ occurrence, med, log, status }]. */
export function dosesForDay(meds, logs, day, now) {
  const index = indexLogs(logs);
  return meds
    .filter((med) => med.active)
    .flatMap((med) => occurrencesBetween(med, day, day).map(withStatus(med, index, now)))
    .sort(
      (a, b) =>
        a.occurrence.time.localeCompare(b.occurrence.time) || a.med.name.localeCompare(b.med.name),
    );
}

/** Prises manquées depuis hier (écran de rattrapage). */
export function missedDoses(meds, logs, now) {
  const today = Math.floor(now / DAY_MIN);
  const index = indexLogs(logs);
  return meds
    .filter((med) => med.active)
    .flatMap((med) =>
      occurrencesBetween(med, dayFromIndex(today - 1), dayFromIndex(today))
        .map(withStatus(med, index, now))
        .filter((d) => d.status === 'missed'),
    )
    .sort(
      (a, b) =>
        a.occurrence.date.localeCompare(b.occurrence.date) ||
        a.occurrence.time.localeCompare(b.occurrence.time),
    );
}

/** Prochaine prise à venir aujourd'hui, ou null. */
export function nextDose(doses) {
  return doses.find((d) => d.status === 'upcoming' || d.status === 'snoozed') ?? null;
}

/**
 * Avertissements avant d'enregistrer une prise (limites fixées par l'utilisateur, jamais par l'app) :
 * overMax : une prise de plus atteindrait/dépasserait le max sur 24 h glissantes ;
 * tooSoon : l'écart minimal depuis la dernière prise n'est pas atteint.
 */
export function doseWarnings(med, logs, now, ignoreKey = null) {
  const taken = logs
    .filter((l) => l.medId === med.id && l.status === 'taken' && l.takenAt)
    .filter((l) => !ignoreKey || doseKey(l.medId, l.date, l.time) !== ignoreKey)
    .map((l) => parseStamp(l.takenAt))
    .filter((t) => t <= now)
    .sort((a, b) => a - b);
  const count24h = taken.filter((t) => t > now - DAY_MIN).length;
  const last = taken.at(-1);
  const sinceLast = last == null ? null : now - last;
  const { maxPer24h = null, minGapMin = null } = med.schedule ?? {};
  return {
    count24h,
    sinceLast,
    overMax: maxPer24h != null && count24h >= maxPer24h,
    tooSoon: minGapMin != null && sinceLast != null && sinceLast < minGapMin,
  };
}

/** Traitement temporaire dont la date de fin est passée. */
export function cureEnded(med, today) {
  return Boolean(med.endDate) && med.endDate < today;
}

/** Bilan d'une cure : prises prévues vs prises faites. */
export function cureSummary(med, logs) {
  const planned = med.endDate ? occurrencesBetween(med, med.startDate, med.endDate).length : 0;
  const taken = logs.filter((l) => l.medId === med.id && l.status === 'taken').length;
  return { planned, taken };
}
