// Médicaments et journal des prises. Lectures/écritures locales, synchronisées.
// Données sensibles : jamais dans la console, les URLs ou un service tiers.
import { doseKey } from '../lib/health/schedule.js';
import { deterministicId } from '../lib/ids.js';
import { getEngine } from '../session.js';

const MED = 'med';
const DOSE = 'doseLog';

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

/** Médicaments + journal ensemble : onData({ meds, logs }) dès que l'un change. */
export function watchMedsAndLogs(onData, onError) {
  const state = { meds: null, logs: null };
  const emit = () => state.meds && state.logs && onData({ meds: state.meds, logs: state.logs });
  const stops = [
    watch(
      MED,
      (meds) => {
        state.meds = meds;
        emit();
      },
      onError,
    ),
    watch(
      DOSE,
      (logs) => {
        state.logs = logs;
        emit();
      },
      onError,
    ),
  ];
  return () => stops.forEach((stop) => stop());
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
