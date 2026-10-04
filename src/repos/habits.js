// Habitudes, cases cochées et journal (humeur/sommeil) : tout passe par le moteur de sync.
import { deterministicId } from '../lib/ids.js';
import { getEngine, getUid } from '../session.js';

const HABIT = 'habit';
const CHECK = 'habitCheck';
const DAY = 'habitDay';

/** Recharge à chaque changement d'une des collections. Retourne le désabonnement. */
function watch(collections, load, onData, onError) {
  const engine = getEngine();
  let active = true;
  const run = () =>
    load(engine)
      .then((data) => active && onData(data))
      .catch(onError);
  const unsubscribers = collections.map((c) => engine.subscribe(c, run));
  run();
  return () => {
    active = false;
    unsubscribers.forEach((u) => u());
  };
}

/** Toutes les habitudes (actives et archivées). */
export function watchHabits(onData, onError) {
  return watch([HABIT], (engine) => engine.getAll(HABIT), onData, onError);
}

/** Cases et journal d'un mois 'YYYY-MM'. */
export function watchMonthLogs(month, onData, onError) {
  const inMonth = (row) => typeof row.day === 'string' && row.day.startsWith(`${month}-`);
  return watch(
    [CHECK, DAY],
    async (engine) => {
      const [checks, days] = await Promise.all([engine.getAll(CHECK), engine.getAll(DAY)]);
      return { checks: checks.filter(inMonth), days: days.filter(inMonth) };
    },
    onData,
    onError,
  );
}

export function addHabit({ name, emoji }, existing) {
  const order = existing.reduce((max, h) => Math.max(max, h.order ?? 0), -1) + 1;
  return getEngine().patch(HABIT, crypto.randomUUID(), {
    name,
    emoji: emoji || null,
    order,
    active: true,
  });
}

export function updateHabit(id, patch) {
  return getEngine().patch(HABIT, id, patch);
}

/** Suppression logique côté serveur ; les cases déjà cochées restent en base. */
export function deleteHabit(id) {
  return getEngine().remove(HABIT, id);
}

export async function setCheck(habitId, day, done) {
  const id = await deterministicId(`habit-check:${getUid()}:${habitId}:${day}`);
  return getEngine().patch(CHECK, id, { habitId, day, done });
}

/** patch : { mood?: 1..5|null, sleepMinutes?: 0..1440|null } */
export async function setJournal(day, patch) {
  const id = await deterministicId(`habit-day:${getUid()}:${day}`);
  return getEngine().patch(DAY, id, { day, ...patch });
}
