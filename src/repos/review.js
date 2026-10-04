// Lecture seule des données perso pour la revue et le tableau de bord « Aujourd'hui ».
import { getEngine } from '../session.js';

const SOURCES = {
  habits: 'habit',
  checks: 'habitCheck',
  journal: 'habitDay',
  expenses: 'expense',
  categories: 'category',
  tasks: 'task',
  goals: 'dailyGoal',
};

/** onData({ habits, checks, journal, expenses, categories, tasks, goals }) à chaque changement. */
export function watchReviewData(onData, onError) {
  const engine = getEngine();
  const entries = Object.entries(SOURCES);
  let active = true;
  const reload = () =>
    Promise.all(entries.map(([, collection]) => engine.getAll(collection)))
      .then((lists) => {
        if (active) onData(Object.fromEntries(entries.map(([key], i) => [key, lists[i]])));
      })
      .catch(onError);
  const unsubscribers = entries.map(([, collection]) => engine.subscribe(collection, reload));
  reload();
  return () => {
    active = false;
    unsubscribers.forEach((u) => u());
  };
}
