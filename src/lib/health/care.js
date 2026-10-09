// Contacts médicaux et rendez-vous (phase 7.4) : logique pure, testée dans tests/unit/care.test.js.
import { parseStamp } from './schedule.js';

export const DOCTOR_KINDS = {
  doctor: 'Médecin',
  pharmacy: 'Pharmacie',
  lab: 'Laboratoire',
  other: 'Autre',
};

export const APPOINTMENT_STATUS = {
  planned: 'Prévu',
  done: 'Fait',
  cancelled: 'Annulé',
};

const DAY_MIN = 1440;

/** Rendez-vous prévus à partir de maintenant, du plus proche au plus lointain. */
export function upcomingAppointments(appointments, now) {
  return appointments
    .filter((a) => a.status === 'planned' && parseStamp(a.at) >= now)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Rendez-vous passés (ou non prévus), du plus récent au plus ancien. */
export function pastAppointments(appointments, now) {
  return appointments
    .filter((a) => a.status !== 'planned' || parseStamp(a.at) < now)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Rendez-vous prévus un jour donné. */
export const appointmentsOn = (appointments, day) =>
  appointments
    .filter((a) => a.status === 'planned' && a.at.startsWith(day))
    .sort((a, b) => a.at.localeCompare(b.at));

/**
 * Rappels à afficher : la veille (même heure) et N heures avant, tant que le RDV n'est pas passé.
 * Seul le rappel échu le plus récent est proposé. Id stable, mémorisé par l'appelant.
 */
export function appointmentAlerts(appointments, now, reminded) {
  const alerts = [];
  for (const appointment of appointments) {
    if (appointment.status !== 'planned') continue;
    const at = parseStamp(appointment.at);
    if (now >= at) continue;
    const starts = [];
    if (appointment.remindDayBefore) starts.push(['day', at - DAY_MIN]);
    if (appointment.remindHoursBefore > 0) {
      starts.push(['hours', at - appointment.remindHoursBefore * 60]);
    }
    const due = starts.filter(([, start]) => now >= start).sort((a, b) => b[1] - a[1])[0];
    if (!due) continue;
    const id = `rdv|${appointment.id}|${due[0]}`;
    if (!reminded.has(id)) alerts.push({ id, appointment });
  }
  return alerts;
}

/** « Demain 09:30 », « Aujourd'hui 14:00 », « 20/10 09:30 ». */
export function whenLabel(at, today, tomorrow) {
  const time = at.slice(11);
  const day = at.slice(0, 10);
  if (day === today) return `Aujourd'hui ${time}`;
  if (day === tomorrow) return `Demain ${time}`;
  return `${day.slice(8)}/${day.slice(5, 7)} ${time}`;
}

/** Nom affiché d'un rendez-vous : médecin, sinon motif. */
export function appointmentTitle(appointment, doctors) {
  const doctor = doctors.find((d) => d.id === appointment.doctorId);
  return doctor?.name ?? appointment.reason ?? 'Rendez-vous';
}
