// Logique des tâches et objectifs du jour : fonctions pures, testées avec Vitest.
import { addDays, dayKey, daysInMonth, parseDayKey } from './dates.js';

export const MAX_GOALS = 5;

export const PRIORITIES = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
];

export const RECURRENCES = [
  { value: null, label: 'Jamais' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
];

const pad = (n) => String(n).padStart(2, '0');

/** Échéance suivante d'une tâche récurrente (le 31 devient le dernier jour des mois courts). */
export function nextDueDate(due, recurrence) {
  const date = parseDayKey(due);
  if (!date) throw new RangeError(`Échéance invalide : ${due}`);
  if (recurrence === 'daily') return dayKey(addDays(date, 1));
  if (recurrence === 'weekly') return dayKey(addDays(date, 7));
  if (recurrence === 'monthly') {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const month = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
    return `${month}-${pad(Math.min(date.getDate(), daysInMonth(month)))}`;
  }
  throw new RangeError(`Récurrence inconnue : ${recurrence}`);
}

/** done | overdue | today | upcoming | someday (sans échéance). */
export function taskBucket(task, today) {
  if (task.done) return 'done';
  if (!task.dueDate) return 'someday';
  if (task.dueDate < today) return 'overdue';
  return task.dueDate === today ? 'today' : 'upcoming';
}

const nullsLast = (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a.localeCompare(b));

/** Échéance, puis heure, puis priorité, puis titre. */
export function compareTasks(a, b) {
  return (
    nullsLast(a.dueDate, b.dueDate) ||
    nullsLast(a.dueTime, b.dueTime) ||
    (a.priority ?? 2) - (b.priority ?? 2) ||
    a.title.localeCompare(b.title, 'fr')
  );
}

/**
 * Tâches d'un onglet :
 * today = en retard + aujourd'hui ; upcoming = à venir puis sans date ; done = 100 dernières terminées.
 */
export function tasksForView(tasks, view, today) {
  if (view === 'done') {
    return tasks
      .filter((t) => t.done)
      .sort((a, b) => nullsLast(b.doneOn, a.doneOn) || compareTasks(a, b))
      .slice(0, 100);
  }
  const buckets = view === 'today' ? ['overdue', 'today'] : ['upcoming', 'someday'];
  return tasks.filter((t) => buckets.includes(taskBucket(t, today))).sort(compareTasks);
}

const shortDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** « Aujourd'hui · 09:00 », « Demain », « En retard · lun. 28 sept. », « ven. 9 oct. » */
export function dueLabel(task, today) {
  if (!task.dueDate) return null;
  const tomorrow = dayKey(addDays(parseDayKey(today), 1));
  let label;
  if (task.dueDate === today) label = "Aujourd'hui";
  else if (task.dueDate === tomorrow) label = 'Demain';
  else label = shortDate.format(parseDayKey(task.dueDate));
  if (!task.done && task.dueDate < today) label = `En retard · ${label}`;
  return task.dueTime ? `${label} · ${task.dueTime}` : label;
}

/** Tâches du jour dont l'heure est passée et pas encore rappelées. */
export function dueReminders(tasks, today, now, reminded) {
  return tasks.filter(
    (t) => !t.done && t.dueDate === today && t.dueTime && t.dueTime <= now && !reminded.has(t.id),
  );
}

/** Première position libre (0..4) pour un nouvel objectif du jour, ou null si complet. */
export function nextGoalPosition(goals) {
  const used = new Set(goals.map((g) => g.position));
  for (let p = 0; p < MAX_GOALS; p++) if (!used.has(p)) return p;
  return null;
}

/** 'HH:MM' local. */
export function timeKey(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
