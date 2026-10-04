// Objectifs du jour et tâches : tout passe par le moteur de sync.
import { dayKey } from '../lib/dates.js';
import { deterministicId } from '../lib/ids.js';
import { nextDueDate, nextGoalPosition } from '../lib/tasks.js';
import { getEngine, getUid } from '../session.js';

const GOAL = 'dailyGoal';
const TASK = 'task';

function watch(collection, load, onData, onError) {
  const engine = getEngine();
  let active = true;
  const run = () =>
    load(engine)
      .then((data) => active && onData(data))
      .catch(onError);
  const unsubscribe = engine.subscribe(collection, run);
  run();
  return () => {
    active = false;
    unsubscribe();
  };
}

// ---------- Objectifs du jour ----------

export function watchGoals(day, onData, onError) {
  return watch(
    GOAL,
    async (engine) =>
      (await engine.getAll(GOAL))
        .filter((g) => g.day === day)
        .sort((a, b) => a.position - b.position),
    onData,
    onError,
  );
}

/**
 * Id déterministe (utilisateur + jour + position) : une position libérée puis réutilisée
 * réécrit la même ligne, et la base garantit 5 objectifs maximum.
 */
export async function addGoal(day, text, goals) {
  const position = nextGoalPosition(goals);
  if (position === null) throw new Error('5 objectifs maximum par jour.');
  const id = await deterministicId(`goal:${getUid()}:${day}:${position}`);
  return getEngine().patch(GOAL, id, { day, position, text, done: false });
}

export function updateGoal(id, patch) {
  return getEngine().patch(GOAL, id, patch);
}

export function removeGoal(id) {
  return getEngine().remove(GOAL, id);
}

// ---------- Tâches ----------

export function watchTasks(onData, onError) {
  return watch(TASK, (engine) => engine.getAll(TASK), onData, onError);
}

export function addTask({
  title,
  priority = 2,
  dueDate = null,
  dueTime = null,
  recurrence = null,
}) {
  return getEngine().patch(TASK, crypto.randomUUID(), {
    title,
    done: false,
    priority,
    dueDate,
    dueTime,
    recurrence,
    doneOn: null,
  });
}

export function updateTask(id, patch) {
  return getEngine().patch(TASK, id, patch);
}

export function deleteTask(id) {
  return getEngine().remove(TASK, id);
}

/**
 * Coche / décoche. Pour une tâche récurrente, cocher crée l'occurrence suivante
 * (id déterministe : une seule suivante par tâche, même sur deux appareils) ;
 * décocher la retire si elle n'a pas encore été faite.
 */
export async function setTaskDone(task, done) {
  const engine = getEngine();
  await engine.patch(TASK, task.id, { done, doneOn: done ? dayKey() : null });
  if (!task.recurrence || !task.dueDate) return;

  const nextId = await deterministicId(`task-next:${getUid()}:${task.id}`);
  if (done) {
    await engine.patch(TASK, nextId, {
      title: task.title,
      priority: task.priority,
      dueDate: nextDueDate(task.dueDate, task.recurrence),
      dueTime: task.dueTime ?? null,
      recurrence: task.recurrence,
      done: false,
      doneOn: null,
    });
  } else {
    const next = await engine.get(TASK, nextId);
    if (next && !next.done) await engine.remove(TASK, nextId);
  }
}
