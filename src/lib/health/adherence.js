// Observance (phase 7.5) : logique pure, testée dans tests/unit/care.test.js.
// Chiffres descriptifs uniquement : aucune interprétation médicale.
import { dayPart } from './meds.js';
import {
  GRACE_MIN,
  dayFromIndex,
  dayIndex,
  indexLogs,
  occurrencesBetween,
  parseStamp,
  statusFor,
  wallMinutes,
} from './schedule.js';

const empty = () => ({ onTime: 0, late: 0, skipped: 0, missed: 0, total: 0, pct: null });

/**
 * onTime | late | skipped | missed, ou null si la prise n'est pas encore jugeable
 * (à venir, à prendre, reportée). « À l'heure » : prise dans les 2 h autour de l'horaire.
 */
export function outcome(occurrence, log, now) {
  const status = statusFor(occurrence, log, now);
  if (status === 'taken') {
    const due = wallMinutes(occurrence.date, occurrence.time);
    return Math.abs(parseStamp(log.takenAt) - due) <= GRACE_MIN ? 'onTime' : 'late';
  }
  if (status === 'skipped' || status === 'missed') return status;
  return null;
}

function add(counts, result) {
  counts[result] += 1;
  counts.total += 1;
}

function finish(counts) {
  const taken = counts.onTime + counts.late;
  counts.pct = counts.total ? Math.round((taken / counts.total) * 100) : null;
  return counts;
}

/** Toutes les prises jugeables de la période : [{ med, occurrence, result }]. */
function judged(meds, logs, from, to, now) {
  const index = indexLogs(logs);
  const list = [];
  for (const med of meds) {
    for (const occurrence of occurrencesBetween(med, from, to)) {
      const result = outcome(occurrence, index.get(occurrence.key) ?? null, now);
      if (result) list.push({ med, occurrence, result });
    }
  }
  return list;
}

/** { overall, byMed: [{ med, ...compteurs }], byPart: { Matin: compteurs, … } } */
export function adherence(meds, logs, from, to, now) {
  const overall = empty();
  const byMed = new Map();
  const byPart = {};
  for (const { med, occurrence, result } of judged(meds, logs, from, to, now)) {
    add(overall, result);
    if (!byMed.has(med.id)) byMed.set(med.id, { med, ...empty() });
    add(byMed.get(med.id), result);
    const part = dayPart(occurrence.time);
    byPart[part] ??= empty();
    add(byPart[part], result);
  }
  Object.values(byPart).forEach(finish);
  return {
    overall: finish(overall),
    byMed: [...byMed.values()].map(finish).sort((a, b) => a.med.name.localeCompare(b.med.name)),
    byPart,
  };
}

/** Par jour : { taken, total } (prises jugeables seulement), pour le calendrier. */
export function dailyRates(meds, logs, from, to, now) {
  const days = new Map();
  for (const { occurrence, result } of judged(meds, logs, from, to, now)) {
    const day = days.get(occurrence.date) ?? { taken: 0, total: 0 };
    day.total += 1;
    if (result === 'onTime' || result === 'late') day.taken += 1;
    days.set(occurrence.date, day);
  }
  return days;
}

/**
 * Série : jours consécutifs (en remontant depuis aujourd'hui) où toutes les prises jugeables
 * ont été prises. Les jours sans prise ne cassent pas la série ; on remonte au plus 365 jours.
 */
export function streak(meds, logs, today, now) {
  const end = dayIndex(today);
  const rates = dailyRates(meds, logs, dayFromIndex(end - 365), today, now);
  let count = 0;
  for (let i = end; i > end - 365; i--) {
    const day = rates.get(dayFromIndex(i));
    if (!day) continue;
    if (day.taken < day.total) break;
    count += 1;
  }
  return count;
}

/** Ton d'une case du calendrier : none | full | partial | low. */
export function dayTone(day) {
  if (!day || !day.total) return 'none';
  const ratio = day.taken / day.total;
  if (ratio === 1) return 'full';
  return ratio >= 0.5 ? 'partial' : 'low';
}

/**
 * Lien descriptif symptômes ↔ prises oubliées : pour chaque symptôme noté au moins 2 jours,
 * % des jours « avec oubli » (au moins une prise manquée ou ignorée) où il apparaît,
 * et % des jours « sans oubli ». Calculé seulement si les deux groupes de jours existent.
 */
export function symptomCorrelation(meds, logs, journals, from, to, now) {
  const rates = dailyRates(meds, logs, from, to, now);
  const withMiss = new Set();
  const withoutMiss = new Set();
  for (const [day, { taken, total }] of rates) (taken < total ? withMiss : withoutMiss).add(day);
  if (!withMiss.size || !withoutMiss.size) return [];

  const daysBySymptom = new Map();
  for (const entry of journals) {
    if (!rates.has(entry.date)) continue;
    for (const s of entry.symptoms ?? []) {
      const key = s.name.trim();
      if (!daysBySymptom.has(key)) daysBySymptom.set(key, new Set());
      daysBySymptom.get(key).add(entry.date);
    }
  }
  const pct = (days, group) =>
    Math.round(([...days].filter((d) => group.has(d)).length / group.size) * 100);
  return [...daysBySymptom]
    .filter(([, days]) => days.size >= 2)
    .map(([name, days]) => ({
      name,
      days: days.size,
      withMissed: pct(days, withMiss),
      withoutMissed: pct(days, withoutMiss),
    }))
    .sort((a, b) => b.days - a.days);
}
