// Revue hebdomadaire automatique : fonctions pures, testées avec Vitest.
import { sumAmounts, totalsByCategory } from './expenses.js';
import {
  activeHabits,
  checkKey,
  formatPct,
  formatSleep,
  indexChecks,
  journalAverages,
  progress,
} from './habits.js';
import { shiftWeek, weekDays } from './house.js';
import { formatXOF } from './money.js';

export const weekDayKeys = (week) => weekDays(week).map((d) => d.date);

/** Habitudes de la semaine, sur les jours déjà écoulés uniquement. */
export function reviewHabits(habits, checks, days, today) {
  const active = activeHabits(habits);
  const elapsed = days.filter((d) => d <= today);
  const done = indexChecks(checks);
  const perHabit = active
    .map((habit) => ({
      habit,
      done: elapsed.filter((d) => done.has(checkKey(habit.id, d))).length,
      total: elapsed.length,
    }))
    .sort((a, b) => b.done - a.done || a.habit.name.localeCompare(b.habit.name, 'fr'));
  return {
    ...progress(active, done, elapsed),
    elapsedDays: elapsed.length,
    perHabit,
    perDay: days.map((day) => ({ day, future: day > today, ...progress(active, done, [day]) })),
    best: perHabit[0]?.done ? perHabit[0] : null,
    weakest: perHabit.length > 1 ? perHabit.at(-1) : null,
  };
}

export function reviewExpenses(expenses, previous, categories, elapsedDays) {
  const total = sumAmounts(expenses);
  const prevTotal = sumAmounts(previous);
  return {
    total,
    prevTotal,
    deltaRatio: prevTotal > 0 ? (total - prevTotal) / prevTotal : null,
    count: expenses.length,
    byCategory: totalsByCategory(expenses, categories),
    dailyAvg: elapsedDays > 0 ? Math.round(total / elapsedDays) : 0,
  };
}

export function reviewTasks(tasks, goals, days, today) {
  const inWeek = new Set(days);
  const done = tasks.filter((t) => t.done && inWeek.has(t.doneOn));
  const weekGoals = goals.filter((g) => inWeek.has(g.day));
  return {
    tasksDone: done.length,
    highPriorityDone: done.filter((t) => t.priority === 1).length,
    overdue: tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length,
    goalsTotal: weekGoals.length,
    goalsDone: weekGoals.filter((g) => g.done).length,
  };
}

const categoryName = (category) => category?.name ?? 'Sans catégorie';

function expenseLine(expenses) {
  if (expenses.deltaRatio === null) return `Dépenses : ${formatXOF(expenses.total)}.`;
  if (Math.abs(expenses.deltaRatio) < 0.05) {
    return `Dépenses stables : ${formatXOF(expenses.total)}.`;
  }
  const trend = expenses.deltaRatio > 0 ? 'hausse' : 'baisse';
  return `Dépenses en ${trend} de ${formatPct(Math.abs(expenses.deltaRatio))} : ${formatXOF(expenses.total)} (contre ${formatXOF(expenses.prevTotal)}).`;
}

/** Phrases courtes, dans l'ordre d'importance. Rien d'inventé : seulement ce que les chiffres disent. */
export function insights({ habits, expenses, tasks, journal }) {
  const lines = [];
  if (habits.goal > 0) {
    lines.push(`${formatPct(habits.pct)} des habitudes cochées (${habits.done}/${habits.goal}).`);
    const { best, weakest } = habits;
    if (best) lines.push(`Meilleure habitude : ${best.habit.name} (${best.done}/${best.total} j).`);
    if (weakest && weakest !== best && weakest.done < weakest.total / 2) {
      lines.push(`À relancer : ${weakest.habit.name} (${weakest.done}/${weakest.total} j).`);
    }
  }
  if (expenses.total > 0 || expenses.prevTotal > 0) {
    lines.push(expenseLine(expenses));
    const top = expenses.byCategory[0];
    if (top) lines.push(`Premier poste : ${categoryName(top.category)} (${formatXOF(top.total)}).`);
  }
  if (tasks.tasksDone > 0) lines.push(`${tasks.tasksDone} tâche(s) terminée(s).`);
  if (tasks.overdue > 0) lines.push(`${tasks.overdue} tâche(s) en retard à rattraper.`);
  if (tasks.goalsTotal > 0) {
    lines.push(`Objectifs du jour atteints : ${tasks.goalsDone}/${tasks.goalsTotal}.`);
  }
  if (journal.sleepMinutes != null) {
    lines.push(`Sommeil moyen : ${formatSleep(journal.sleepMinutes)}.`);
  }
  if (journal.mood != null) {
    lines.push(`Humeur moyenne : ${journal.mood.toFixed(1).replace('.', ',')} / 5.`);
  }
  return lines;
}

/** Revue complète d'une semaine 'YYYY-Www' à partir des données brutes. */
export function buildReview({
  week,
  today,
  habits,
  checks,
  journal,
  expenses,
  categories,
  tasks,
  goals,
}) {
  const days = weekDayKeys(week);
  const previousDays = new Set(weekDayKeys(shiftWeek(week, -1)));
  const inWeek = new Set(days);

  const habitReview = reviewHabits(
    habits,
    checks.filter((c) => inWeek.has(c.day)),
    days,
    today,
  );
  const expenseReview = reviewExpenses(
    expenses.filter((e) => inWeek.has(e.date)),
    expenses.filter((e) => previousDays.has(e.date)),
    categories,
    habitReview.elapsedDays,
  );
  const taskReview = reviewTasks(tasks, goals, days, today);
  const journalReview = journalAverages(journal.filter((j) => inWeek.has(j.day)));

  const review = {
    week,
    days,
    habits: habitReview,
    expenses: expenseReview,
    tasks: taskReview,
    journal: journalReview,
  };
  return { ...review, insights: insights(review) };
}
