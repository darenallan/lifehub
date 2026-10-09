// Stock des médicaments (phase 7.2) : logique pure, testée dans tests/unit/tracking.test.js.
//
// Le stock n'est jamais décrémenté en base : restant = quantité saisie (stockQty, à stockAt)
// + rachats postérieurs − prises postérieures. Annuler une prise remet donc le stock tout seul,
// et deux appareils hors ligne ne peuvent pas se contredire.
import { dayFromIndex, dayIndex, occurrencesBetween, parseStamp } from './schedule.js';

const round2 = (n) => Math.round(n * 100) / 100;
const PROJECTION_DAYS = 30; // conso moyenne planifiée sur les 30 prochains jours
const AS_NEEDED_DAYS = 14; // « à la demande » : conso réelle des 14 derniers jours
const LOW_DAYS = 7; // sans seuil saisi, alerte quand il reste moins d'une semaine

export const tracksStock = (med) => med.stockQty != null && Boolean(med.stockAt);

/** Quantité restante (≥ 0), ou null si le stock n'est pas suivi. */
export function remainingStock(med, logs, refills) {
  if (!tracksStock(med)) return null;
  const since = parseStamp(med.stockAt);
  const added = refills
    .filter((r) => r.medId === med.id && parseStamp(r.at) > since)
    .reduce((sum, r) => sum + r.qty, 0);
  const used = logs
    .filter((l) => l.medId === med.id && l.status === 'taken' && l.takenAt)
    .filter((l) => parseStamp(l.takenAt) > since)
    .reduce((sum, l) => sum + l.amount, 0);
  return round2(Math.max(0, med.stockQty + added - used));
}

/** Consommation moyenne par jour, d'après le planning réel (ou l'usage récent « à la demande »). */
export function dailyUse(med, logs, today) {
  const start = dayIndex(today);
  if (med.schedule?.type === 'asNeeded') {
    const from = dayFromIndex(start - AS_NEEDED_DAYS + 1);
    const taken = logs
      .filter((l) => l.medId === med.id && l.status === 'taken')
      .filter((l) => l.date >= from && l.date <= today)
      .reduce((sum, l) => sum + l.amount, 0);
    return taken / AS_NEEDED_DAYS;
  }
  const planned = occurrencesBetween(med, today, dayFromIndex(start + PROJECTION_DAYS - 1));
  return planned.reduce((sum, o) => sum + o.amount, 0) / PROJECTION_DAYS;
}

/**
 * État du stock : { remaining, days, runsOutOn, level } ou null si non suivi.
 * days : jours entiers couverts (null si aucune consommation prévue).
 * level : 'out' | 'low' | 'ok' (seuil saisi par l'utilisateur, sinon moins de 7 jours).
 */
export function stockStatus(med, logs, refills, today) {
  const remaining = remainingStock(med, logs, refills);
  if (remaining == null) return null;
  const perDay = dailyUse(med, logs, today);
  const days = perDay > 0 ? Math.floor(remaining / perDay) : null;
  const runsOutOn = days == null ? null : dayFromIndex(dayIndex(today) + days);
  const low = med.refillAt != null ? remaining <= med.refillAt : days != null && days < LOW_DAYS;
  const level = remaining <= 0 ? 'out' : low ? 'low' : 'ok';
  return { remaining, days, runsOutOn, level };
}

/** Quantité proposée pour « J'ai racheté » : taille de boîte, sinon dernier rachat. */
export function suggestedRefill(med, refills) {
  if (med.packSize) return med.packSize;
  const last = refills
    .filter((r) => r.medId === med.id)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return last?.qty ?? null;
}
