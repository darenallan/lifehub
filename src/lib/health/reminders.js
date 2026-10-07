// Rappels de prise (niveau 1 : app ouverte) : logique pure, testée dans tests/unit/schedule.test.js.
import { formatAmount, medTitle } from './meds.js';
import {
  dayFromIndex,
  indexLogs,
  occurrencesBetween,
  parseStamp,
  statusFor,
  wallMinutes,
} from './schedule.js';

const DAY_MIN = 1440;

/**
 * Rappels à afficher maintenant. Chaque rappel a un id stable (prise + départ + n° de répétition),
 * mémorisé par l'appelant dans `reminded` pour ne jamais le répéter.
 * Départ : l'heure prévue moins l'avance, ou la fin d'un report.
 * Plus de rappel une fois la prise faite, ignorée ou manquée.
 */
export function doseAlerts(meds, logs, now, reminded) {
  const today = dayFromIndex(Math.floor(now / DAY_MIN));
  const index = indexLogs(logs);
  const alerts = [];
  for (const med of meds) {
    const r = med.reminder;
    if (!med.active || !r?.enabled) continue;
    for (const occurrence of occurrencesBetween(med, today, today)) {
      const log = index.get(occurrence.key) ?? null;
      const status = statusFor(occurrence, log, now);
      if (!['upcoming', 'due'].includes(status)) continue;
      const start =
        log?.status === 'snoozed'
          ? parseStamp(log.snoozeUntil)
          : wallMinutes(occurrence.date, occurrence.time) - r.advanceMin;
      if (now < start) continue;
      const repeat = r.repeatEveryMin
        ? Math.min(Math.floor((now - start) / r.repeatEveryMin), r.repeatCount)
        : 0;
      const id = `${occurrence.key}@${start}#${repeat}`;
      if (!reminded.has(id)) alerts.push({ id, med, occurrence });
    }
  }
  return alerts;
}

/** Texte du rappel ; en mode discret, rien ne révèle le traitement. */
export function alertText({ med, occurrence }) {
  if (med.reminder?.discreet) {
    return { title: 'Rappel de prise', body: `Prise prévue à ${occurrence.time}.` };
  }
  return {
    title: `Prise : ${medTitle(med)}`,
    body: `${formatAmount(occurrence.amount, med.unit)} à ${occurrence.time}`,
  };
}
