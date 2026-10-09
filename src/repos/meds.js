// Médicaments et journal des prises. Lectures/écritures locales, synchronisées.
// Données sensibles : jamais dans la console, les URLs ou un service tiers.
import { doseKey, nowStamp } from '../lib/health/schedule.js';
import { deterministicId } from '../lib/ids.js';
import { getEngine } from '../session.js';
import { addExpense } from './expenses.js';

const MED = 'med';
const DOSE = 'doseLog';
const REFILL = 'medRefill';
const CATEGORY = 'category';

function watch(collection, onData, onError) {
  const engine = getEngine();
  let active = true;
  const run = () =>
    engine
      .getAll(collection)
      .then((rows) => active && onData(rows))
      .catch(onError);
  const unsubscribe = engine.subscribe(collection, run);
  run();
  return () => {
    active = false;
    unsubscribe();
  };
}

/** Médicaments, journal des prises et rachats : onData({ meds, logs, refills }) dès que l'un change. */
export function watchMedsAndLogs(onData, onError) {
  const sources = { meds: MED, logs: DOSE, refills: REFILL };
  const state = { meds: null, logs: null, refills: null };
  const emit = () => Object.values(state).every(Boolean) && onData({ ...state });
  const stops = Object.entries(sources).map(([key, collection]) =>
    watch(
      collection,
      (rows) => {
        state[key] = rows;
        emit();
      },
      onError,
    ),
  );
  return () => stops.forEach((stop) => stop());
}

// ---------- Stock (7.2) ----------

/** Saisie du stock actuel : point de départ du calcul (prises et rachats comptés ensuite). */
export function setStock(medId, qty) {
  return getEngine().patch(MED, medId, { stockQty: qty, stockAt: nowStamp() });
}

/** Catégorie « Santé » des dépenses ; créée si l'utilisateur l'a supprimée. */
async function healthCategoryId() {
  const engine = getEngine();
  const categories = await engine.getAll(CATEGORY);
  const found = categories.find((c) => c.active && c.name.trim().toLowerCase() === 'santé');
  if (found) return found.id;
  const id = crypto.randomUUID();
  const order = categories.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1;
  await engine.patch(CATEGORY, id, {
    name: 'Santé',
    emoji: '🩺',
    color: 'red',
    monthlyBudget: 0,
    order,
    active: true,
  });
  return id;
}

/**
 * « J'ai racheté » : + quantité au stock, et si demandé une dépense FCFA (catégorie Santé).
 * price : entier FCFA ou null.
 */
export async function recordRefill(med, { qty, price, createExpense }) {
  const at = nowStamp();
  let expenseId = null;
  if (createExpense && price) {
    expenseId = await addExpense({
      amount: price,
      categoryId: await healthCategoryId(),
      note: `Pharmacie : ${med.name}`.slice(0, 200),
      date: at.slice(0, 10),
    });
  }
  return getEngine().patch(REFILL, crypto.randomUUID(), {
    medId: med.id,
    qty,
    at,
    price: price ?? null,
    expenseId,
  });
}

export function saveMed(id, data) {
  return getEngine().patch(MED, id ?? crypto.randomUUID(), data);
}

export function deleteMed(id) {
  return getEngine().remove(MED, id);
}

/** Id déterministe : deux appareils qui confirment la même prise écrivent la même ligne. */
const scheduledDoseId = (occurrence) =>
  deterministicId(`dose|${doseKey(occurrence.medId, occurrence.date, occurrence.time)}`);

/** Pris / ignoré / reporté pour une prise planifiée. */
export async function recordDose(occurrence, action) {
  const { status, takenAt = null, snoozeUntil = null, note = null, amount } = action;
  return getEngine().patch(DOSE, await scheduledDoseId(occurrence), {
    medId: occurrence.medId,
    date: occurrence.date,
    time: occurrence.time,
    amount: amount ?? occurrence.amount,
    status,
    takenAt,
    snoozeUntil,
    note,
    scheduled: true,
  });
}

/** Annule l'action : la prise redevient « à prendre » ou « manquée » selon l'heure. */
export async function undoDose(occurrence) {
  return getEngine().remove(DOSE, await scheduledDoseId(occurrence));
}

/** Prise « à la demande » (hors planning) à l'heure murale `takenAt`. */
export function recordAsNeeded(med, { takenAt, amount, note = null }) {
  return getEngine().patch(DOSE, crypto.randomUUID(), {
    medId: med.id,
    date: takenAt.slice(0, 10),
    time: takenAt.slice(11, 16),
    amount,
    status: 'taken',
    takenAt,
    snoozeUntil: null,
    note,
    scheduled: false,
  });
}

export function deleteDoseLog(id) {
  return getEngine().remove(DOSE, id);
}
