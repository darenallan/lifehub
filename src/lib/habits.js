// Calculs du tracker d'habitudes : fonctions pures, testées avec Vitest.
import { addDays, dayKey, isoWeekKey, parseDayKey } from './dates.js';

export const checkKey = (habitId, day) => `${habitId}|${day}`;

/** Ensemble des cases cochées, pour des lectures en O(1). */
export function indexChecks(checks) {
  const done = new Set();
  for (const c of checks) if (c.done) done.add(checkKey(c.habitId, c.day));
  return done;
}

/** Habitudes actives, dans l'ordre choisi (puis alphabétique). */
export function activeHabits(habits) {
  return habits
    .filter((h) => h.active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr'));
}

export const ratio = (n, total) => (total > 0 ? n / total : 0);

function countDone(habits, done, days) {
  let n = 0;
  for (const h of habits) for (const d of days) if (done.has(checkKey(h.id, d))) n++;
  return n;
}

/** Objectif / réalisé / restant / % sur un ensemble d'habitudes et de jours. */
export function progress(habits, done, days) {
  const goal = habits.length * days.length;
  const n = countDone(habits, done, days);
  return { goal, done: n, remaining: goal - n, pct: ratio(n, goal) };
}

/** % de chaque jour. */
export function dailyProgress(habits, done, days) {
  return days.map((day) => ({ day, ...progress(habits, done, [day]) }));
}

/** Jours du mois regroupés par semaine ISO (une semaine à cheval sur 2 mois est partielle). */
export function weeksOf(days) {
  const weeks = [];
  for (const day of days) {
    const week = isoWeekKey(parseDayKey(day));
    if (weeks.at(-1)?.week !== week) weeks.push({ week, days: [] });
    weeks.at(-1).days.push(day);
  }
  return weeks;
}

export function weeklyProgress(habits, done, days) {
  return weeksOf(days).map(({ week, days: wDays }) => ({
    week,
    days: wDays,
    ...progress(habits, done, wDays),
  }));
}

/** Tableau Analyse : une ligne par habitude. */
export function habitStats(habits, done, days) {
  return habits.map((habit) => ({ habit, ...progress([habit], done, days) }));
}

/** Meilleures habitudes du mois (au moins une case cochée). */
export function topHabits(habits, done, days, limit = 3) {
  return habitStats(habits, done, days)
    .filter((s) => s.done > 0)
    .sort(
      (a, b) => b.pct - a.pct || b.done - a.done || a.habit.name.localeCompare(b.habit.name, 'fr'),
    )
    .slice(0, limit);
}

/**
 * Série en cours : jours consécutifs cochés jusqu'à aujourd'hui.
 * Aujourd'hui pas encore coché ne casse pas la série (la journée n'est pas finie).
 */
export function currentStreak(habitId, done, today = new Date()) {
  let cursor = done.has(checkKey(habitId, dayKey(today))) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(checkKey(habitId, dayKey(cursor)))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Moyennes du journal (humeur 1–5, sommeil en minutes) sur les jours renseignés. */
export function journalAverages(entries) {
  const avg = (values) =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return {
    mood: avg(entries.map((e) => e.mood).filter(Number.isInteger)),
    sleepMinutes: avg(entries.map((e) => e.sleepMinutes).filter(Number.isInteger)),
  };
}

export function formatPct(r) {
  return `${Math.round(r * 100)} %`;
}

/** 450 → « 7 h 30 », 480 → « 8 h », null → « — » */
export function formatSleep(minutes) {
  if (minutes == null) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
