// Planning envoyé au serveur Web Push (phase 7.6a) : logique pure, testée.
// Ne contient que des heures, un type et une étiquette opaque : jamais de nom ni de dose.
import {
  dayFromIndex,
  formatStamp,
  indexLogs,
  occurrencesBetween,
  parseStamp,
  statusFor,
  wallMinutes,
} from './schedule.js';

const DAY_MIN = 1440;
const MAX = 300;

/**
 * Rappels des `days` prochains jours, à l'heure murale de l'appareil :
 * [{ tag, kind: 'dose' | 'appointment', at: 'YYYY-MM-DDTHH:mm' }], triés, sans doublon d'étiquette.
 * Une étiquette de prise ne dépend que de l'horaire (deux médicaments à 08:00 = un seul rappel),
 * et reprend le format des rappels in-app pour qu'une notification remplace l'autre.
 */
export function planReminders(meds, logs, appointments, now, days = 7) {
  const today = Math.floor(now / DAY_MIN);
  const from = dayFromIndex(today);
  const to = dayFromIndex(today + days - 1);
  const index = indexLogs(logs);
  const plan = new Map();
  const add = (tag, kind, minutes) => {
    if (minutes < now) return;
    const current = plan.get(tag);
    if (!current || minutes < current.minutes) plan.set(tag, { tag, kind, minutes });
  };

  for (const med of meds) {
    const r = med.reminder;
    if (!med.active || !r?.enabled) continue;
    for (const occurrence of occurrencesBetween(med, from, to)) {
      const log = index.get(occurrence.key) ?? null;
      const status = statusFor(occurrence, log, now);
      if (status !== 'upcoming' && status !== 'snoozed') continue;
      const at =
        status === 'snoozed'
          ? parseStamp(log.snoozeUntil)
          : wallMinutes(occurrence.date, occurrence.time) - r.advanceMin;
      add(`dose-${occurrence.date}-${occurrence.time}`, 'dose', at);
    }
  }

  for (const a of appointments) {
    if (a.status !== 'planned') continue;
    const at = parseStamp(a.at);
    if (a.remindDayBefore) add(`rdv|${a.id}|day`, 'appointment', at - DAY_MIN);
    if (a.remindHoursBefore > 0) {
      add(`rdv|${a.id}|hours`, 'appointment', at - a.remindHoursBefore * 60);
    }
  }

  return [...plan.values()]
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, MAX)
    .map(({ tag, kind, minutes }) => ({ tag, kind, at: formatStamp(minutes) }));
}

/** Heure murale de l'appareil 'YYYY-MM-DDTHH:mm' → Date (instant absolu, fuseau de l'appareil). */
export function wallToDate(stamp) {
  const [y, m, d] = stamp.slice(0, 10).split('-').map(Number);
  const [hh, mm] = stamp.slice(11).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Empreinte du planning : on ne renvoie au serveur que si elle change. */
export const planSignature = (plan) => plan.map((r) => `${r.tag}@${r.at}`).join(',');
