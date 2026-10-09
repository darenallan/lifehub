// Santé : profil (singleton) et contacts d'urgence. Lectures/écritures locales, synchronisées.
// Données sensibles : jamais dans la console, les URLs ou un service tiers.
import { dayKey } from '../lib/dates.js';
import { deterministicId } from '../lib/ids.js';
import { getEngine, getUid } from '../session.js';

const PROFILE = 'healthProfile';
const CONTACT = 'emergencyContact';

function watch(load, collection, onData, onError) {
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

/** onData(profil|null). */
export const watchHealthProfile = (onData, onError) =>
  watch((engine) => engine.get(PROFILE, 'me'), PROFILE, onData, onError);

export function saveHealthProfile(patch) {
  return getEngine().patch(PROFILE, 'me', patch);
}

export function acceptDisclaimer() {
  return saveHealthProfile({ disclaimerSeenOn: dayKey() });
}

export const watchEmergencyContacts = (onData, onError) =>
  watch((engine) => engine.getAll(CONTACT), CONTACT, onData, onError);

export function saveEmergencyContact(id, data) {
  return getEngine().patch(CONTACT, id ?? crypto.randomUUID(), data);
}

export function deleteEmergencyContact(id) {
  return getEngine().remove(CONTACT, id);
}

// ---------- Mesures (7.3) ----------

const MEASURE = 'measure';
const MEASURE_TYPE = 'measureType';

/** onData({ types, measures }) : réglages/types perso et toutes les mesures. */
export function watchMeasures(onData, onError) {
  const state = { types: null, measures: null };
  const emit = () => state.types && state.measures && onData({ ...state });
  const stops = [
    watch(
      (engine) => engine.getAll(MEASURE_TYPE),
      MEASURE_TYPE,
      (types) => {
        state.types = types;
        emit();
      },
      onError,
    ),
    watch(
      (engine) => engine.getAll(MEASURE),
      MEASURE,
      (measures) => {
        state.measures = measures;
        emit();
      },
      onError,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

export function saveMeasure(id, data) {
  return getEngine().patch(MEASURE, id ?? crypto.randomUUID(), data);
}

export function deleteMeasure(id) {
  return getEngine().remove(MEASURE, id);
}

/** Un document par type (id déterministe) : cibles perso d'un type intégré, ou type perso. */
export async function saveMeasureType(key, data) {
  const id = await deterministicId(`measure-type:${getUid()}:${key}`);
  return getEngine().patch(MEASURE_TYPE, id, { key, ...data });
}

// ---------- Journal santé (7.3) ----------

const JOURNAL = 'healthJournal';

/** onData({ entry, habitDay }) pour un jour : journal santé + humeur/sommeil (Habitudes). */
export function watchJournalDay(day, onData, onError) {
  const state = { entry: undefined, habitDay: undefined };
  const emit = () =>
    state.entry !== undefined && state.habitDay !== undefined && onData({ ...state });
  const stops = [
    watch(
      async (engine) => (await engine.getAll(JOURNAL)).find((j) => j.date === day) ?? null,
      JOURNAL,
      (entry) => {
        state.entry = entry;
        emit();
      },
      onError,
    ),
    watch(
      async (engine) => (await engine.getAll('habitDay')).find((d) => d.day === day) ?? null,
      'habitDay',
      (habitDay) => {
        state.habitDay = habitDay;
        emit();
      },
      onError,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

/** Une ligne par jour (id déterministe) : deux appareils écrivent le même document. */
export async function saveJournal(day, patch) {
  const id = await deterministicId(`health-journal:${getUid()}:${day}`);
  return getEngine().patch(JOURNAL, id, { date: day, ...patch });
}

// ---------- Suppression ----------

const HEALTH_COLLECTIONS = [
  'emergencyContact',
  'med',
  'doseLog',
  'medRefill',
  'measureType',
  'measure',
  'healthJournal',
  'doctor',
  'appointment',
];

/**
 * « Supprimer toutes mes données de santé » (suppression logique, propagée aux autres appareils).
 * Les dépenses créées par « J'ai racheté » et l'humeur/sommeil (Habitudes) ne sont pas touchées.
 */
export async function deleteAllHealthData() {
  const engine = getEngine();
  let count = 0;
  for (const collection of HEALTH_COLLECTIONS) {
    for (const doc of await engine.getAll(collection)) {
      await engine.remove(collection, doc.id);
      count += 1;
    }
  }
  if (await engine.get(PROFILE, 'me')) {
    await engine.remove(PROFILE, 'me');
    count += 1;
  }
  return count;
}

// ---------- Contacts médicaux et rendez-vous (7.4) ----------

const DOCTOR = 'doctor';
const APPOINTMENT = 'appointment';

/** onData({ doctors, appointments }). */
export function watchCare(onData, onError) {
  const state = { doctors: null, appointments: null };
  const emit = () => state.doctors && state.appointments && onData({ ...state });
  const stops = [
    watch(
      (engine) => engine.getAll(DOCTOR),
      DOCTOR,
      (doctors) => {
        state.doctors = doctors;
        emit();
      },
      onError,
    ),
    watch(
      (engine) => engine.getAll(APPOINTMENT),
      APPOINTMENT,
      (appointments) => {
        state.appointments = appointments;
        emit();
      },
      onError,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

export function saveDoctor(id, data) {
  return getEngine().patch(DOCTOR, id ?? crypto.randomUUID(), data);
}

export function deleteDoctor(id) {
  return getEngine().remove(DOCTOR, id);
}

export function saveAppointment(id, data) {
  return getEngine().patch(APPOINTMENT, id ?? crypto.randomUUID(), data);
}

export function deleteAppointment(id) {
  return getEngine().remove(APPOINTMENT, id);
}

/** Tous les journaux santé (statistiques, rapport). */
export const watchJournals = (onData, onError) =>
  watch((engine) => engine.getAll(JOURNAL), JOURNAL, onData, onError);

/** Humeur et sommeil de tous les jours (Habitudes), pour le rapport. */
export const watchHabitDays = (onData, onError) =>
  watch((engine) => engine.getAll('habitDay'), 'habitDay', onData, onError);
