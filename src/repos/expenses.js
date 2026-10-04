// Dépenses, catégories et dépenses récurrentes : tout passe par le moteur de sync.
import { dayKey } from '../lib/dates.js';
import { planRecurring } from '../lib/expenses.js';
import { deterministicId } from '../lib/ids.js';
import { getEngine, getUid } from '../session.js';

const CATEGORY = 'category';
const EXPENSE = 'expense';
const RECURRING = 'recurringExpense';

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

// ---------- Catégories ----------

export function watchCategories(onData, onError) {
  return watch([CATEGORY], (engine) => engine.getAll(CATEGORY), onData, onError);
}

export function addCategory({ name, emoji, color, monthlyBudget }, existing) {
  const order = existing.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1;
  return getEngine().patch(CATEGORY, crypto.randomUUID(), {
    name,
    emoji: emoji || null,
    color,
    monthlyBudget,
    order,
    active: true,
  });
}

export function updateCategory(id, patch) {
  return getEngine().patch(CATEGORY, id, patch);
}

/** Les dépenses déjà saisies gardent leur catégorie (affichée « Sans catégorie »). */
export function deleteCategory(id) {
  return getEngine().remove(CATEGORY, id);
}

// ---------- Dépenses ----------

/** Dépenses d'un mois 'YYYY-MM'. */
export function watchMonthExpenses(month, onData, onError) {
  return watch(
    [EXPENSE],
    async (engine) => (await engine.getAll(EXPENSE)).filter((e) => e.date?.startsWith(`${month}-`)),
    onData,
    onError,
  );
}

/** Retourne l'id créé (pour « Annuler »). */
export async function addExpense({ amount, categoryId, note, date }) {
  const id = crypto.randomUUID();
  await getEngine().patch(EXPENSE, id, {
    amount,
    categoryId,
    note: note || null,
    date,
    recurringId: null,
  });
  return id;
}

export function updateExpense(id, patch) {
  return getEngine().patch(EXPENSE, id, patch);
}

export function deleteExpense(id) {
  return getEngine().remove(EXPENSE, id);
}

// ---------- Récurrentes ----------

export function watchRecurring(onData, onError) {
  return watch([RECURRING], (engine) => engine.getAll(RECURRING), onData, onError);
}

/** Création (id absent) ou modification d'un modèle. */
export function saveRecurring(id, data) {
  return getEngine().patch(RECURRING, id ?? crypto.randomUUID(), data);
}

export function deleteRecurring(id) {
  return getEngine().remove(RECURRING, id);
}

let generating = null;

/**
 * Crée les occurrences dues des dépenses récurrentes.
 * Id déterministe (modèle + mois) : deux appareils qui génèrent le même mois écrivent la même ligne.
 * lastMonth avance ensuite, pour ne jamais recréer une occurrence supprimée.
 */
export function generateRecurring() {
  generating ??= (async () => {
    const engine = getEngine();
    const uid = getUid();
    const plan = planRecurring(await engine.getAll(RECURRING), dayKey());
    const lastMonths = new Map();
    for (const { template, month, date } of plan) {
      const id = await deterministicId(`expense-recurring:${uid}:${template.id}:${month}`);
      await engine.patch(EXPENSE, id, {
        amount: template.amount,
        categoryId: template.categoryId,
        note: template.note ?? null,
        date,
        recurringId: template.id,
      });
      lastMonths.set(template.id, month);
    }
    for (const [id, lastMonth] of lastMonths) await engine.patch(RECURRING, id, { lastMonth });
    return plan.length;
  })().finally(() => {
    generating = null;
  });
  return generating;
}
