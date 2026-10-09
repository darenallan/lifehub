// Rendez-vous et contacts médicaux (phase 7.4) : #/health/care.
import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { dayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import {
  APPOINTMENT_STATUS,
  DOCTOR_KINDS,
  appointmentTitle,
  pastAppointments,
  upcomingAppointments,
  whenLabel,
} from '../../lib/health/care.js';
import { cleanText, isValidPhone, telHref } from '../../lib/health/emergency.js';
import { medTitle } from '../../lib/health/meds.js';
import { dayFromIndex, dayIndex, nowStamp, parseStamp } from '../../lib/health/schedule.js';
import { icon } from '../../lib/icons.js';
import {
  deleteAppointment,
  deleteDoctor,
  saveAppointment,
  saveDoctor,
  watchCare,
} from '../../repos/health.js';
import { watchMedsAndLogs } from '../../repos/meds.js';
import { card, emptyState, pageHeader } from '../common.js';

const REMIND_HOURS = {
  0: 'Pas de rappel',
  1: '1 h avant',
  2: '2 h avant',
  3: '3 h avant',
  6: '6 h avant',
  12: '12 h avant',
};

function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
  );
}

function input(value, props = {}) {
  const el = h('input', { class: 'input', autocomplete: 'off', ...props });
  el.value = value ?? '';
  return el;
}

function select(options, value) {
  const el = h(
    'select',
    { class: 'input' },
    Object.entries(options).map(([key, label]) => h('option', { value: key }, label)),
  );
  el.value = value;
  return el;
}

function textarea(value, maxlength, placeholder) {
  const el = h('textarea', { class: 'input textarea', rows: 3, maxlength, placeholder });
  el.value = value ?? '';
  return el;
}

function callLink(phone, name) {
  const href = telHref(phone);
  if (!href) return null;
  return h(
    'a',
    { class: 'icon-btn contact__call', href, 'aria-label': `Appeler ${name}` },
    icon('phone', { size: 18 }),
  );
}

function dangerButton(label, action) {
  return h(
    'button',
    { class: 'btn btn--danger', type: 'button', onclick: () => action().catch(reportError) },
    label,
  );
}

/** Fiche contact médical : médecin, pharmacie, laboratoire… */
function openDoctorSheet(doctor) {
  const name = input(doctor?.name, {
    maxlength: 60,
    required: true,
    placeholder: 'ex. Dr Kouassi',
  });
  const kind = select(DOCTOR_KINDS, doctor?.kind ?? 'doctor');
  const specialty = input(doctor?.specialty, { maxlength: 60, placeholder: 'ex. Cardiologue' });
  const phone = input(doctor?.phone, { type: 'tel', inputmode: 'tel', maxlength: 24 });
  const address = input(doctor?.address, { maxlength: 200 });
  const notes = textarea(doctor?.notes, 500, 'Horaires, accès, infos utiles…');
  let dialog;

  const submit = async (e) => {
    e.preventDefault();
    const clean = cleanText(name.value, 60);
    if (!clean) return;
    if (phone.value.trim() && !isValidPhone(phone.value)) {
      showToast('Numéro de téléphone invalide.', { tone: 'danger' });
      return;
    }
    try {
      await saveDoctor(doctor?.id, {
        name: clean,
        kind: kind.value,
        specialty: cleanText(specialty.value, 60),
        phone: phone.value.trim() || null,
        address: cleanText(address.value, 200),
        notes: cleanText(notes.value, 500),
      });
      dialog.close();
      showToast(doctor ? 'Contact enregistré.' : 'Contact ajouté.');
    } catch (err) {
      reportError(err);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer ${doctor.name} ?`,
      message: 'Les rendez-vous passés gardent leur date et leur motif.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await deleteDoctor(doctor.id);
    dialog.close();
  };

  dialog = openDialog({
    title: doctor ? doctor.name : 'Nouveau contact médical',
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      field('Nom', name),
      h('div', { class: 'form-grid' }, field('Type', kind), field('Spécialité', specialty)),
      field('Téléphone', phone),
      field('Adresse', address),
      field('Notes', notes),
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
      doctor ? dangerButton('Supprimer', remove) : null,
    ),
  });
  name.focus();
}

function medPicker(meds, initial) {
  const selected = new Set(initial);
  const chips = meds.map((med) => {
    const chip = h(
      'button',
      {
        class: 'chip chip--toggle',
        type: 'button',
        'aria-pressed': String(selected.has(med.id)),
      },
      medTitle(med),
    );
    chip.onclick = () => {
      if (selected.has(med.id)) selected.delete(med.id);
      else if (selected.size < 20) selected.add(med.id);
      chip.setAttribute('aria-pressed', String(selected.has(med.id)));
    };
    return chip;
  });
  return { el: h('div', { class: 'chips' }, chips), read: () => [...selected] };
}

/** Rendez-vous : création, report, notes post-consultation, médicaments prescrits. */
function openAppointmentSheet(appointment, { doctors, meds }) {
  const now = nowStamp();
  const tomorrow = dayFromIndex(dayIndex(now.slice(0, 10)) + 1);
  const doctorOptions = Object.fromEntries(doctors.map((d) => [d.id, d.name]));
  const doctor = select({ '': 'Aucun', ...doctorOptions }, appointment?.doctorId ?? '');
  const date = input(appointment?.at.slice(0, 10) ?? tomorrow, { type: 'date', required: true });
  const time = input(appointment?.at.slice(11) ?? '09:00', { type: 'time', required: true });
  const reason = input(appointment?.reason, {
    maxlength: 120,
    placeholder: 'ex. Contrôle tension',
  });
  const place = input(appointment?.place, { maxlength: 200, placeholder: 'Clinique, adresse…' });
  const dayBefore = h('input', { type: 'checkbox', class: 'switch__input' });
  dayBefore.checked = appointment?.remindDayBefore ?? true;
  const hours = select(REMIND_HOURS, String(appointment?.remindHoursBefore ?? 2));
  const status = select(APPOINTMENT_STATUS, appointment?.status ?? 'planned');
  const afterNotes = textarea(
    appointment?.afterNotes,
    2000,
    'Ce qui a été dit, prescriptions, prochaine étape…',
  );
  const prescribed = medPicker(meds, appointment?.medIds ?? []);
  let dialog;

  const submit = async (e) => {
    e.preventDefault();
    if (!date.value || !time.value) return;
    try {
      await saveAppointment(appointment?.id, {
        doctorId: doctor.value || null,
        at: `${date.value}T${time.value}`,
        reason: cleanText(reason.value, 120),
        place: cleanText(place.value, 200),
        status: status.value,
        afterNotes: cleanText(afterNotes.value, 2000),
        remindDayBefore: dayBefore.checked,
        remindHoursBefore: Number(hours.value),
        medIds: prescribed.read(),
      });
      dialog.close();
      showToast(appointment ? 'Rendez-vous enregistré.' : 'Rendez-vous ajouté.');
    } catch (err) {
      reportError(err);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer ce rendez-vous ?',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await deleteAppointment(appointment.id);
    dialog.close();
  };

  dialog = openDialog({
    title: appointment ? 'Rendez-vous' : 'Nouveau rendez-vous',
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      doctors.length
        ? field('Médecin', doctor)
        : h(
            'p',
            { class: 'field__hint' },
            'Astuce : ajoute tes médecins dans « Contacts médicaux ».',
          ),
      h('div', { class: 'form-grid' }, field('Jour', date), field('Heure', time)),
      field('Motif', reason),
      field('Lieu', place),
      h(
        'label',
        { class: 'switch' },
        dayBefore,
        h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
        'Me le rappeler la veille',
      ),
      field('Rappel le jour même', hours),
      appointment ? field('Statut', status) : null,
      appointment ? field('Notes après la consultation', afterNotes) : null,
      meds.length ? field('Médicaments prescrits', prescribed.el) : null,
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
      appointment ? dangerButton('Supprimer', remove) : null,
    ),
  });
}

function appointmentRow(appointment, ctx, today, tomorrow) {
  const doctor = ctx.doctors.find((d) => d.id === appointment.doctorId);
  const details = [doctor?.specialty, appointment.reason, appointment.place].filter(Boolean);
  return h(
    'li',
    { class: `appt appt--${appointment.status}` },
    h(
      'button',
      {
        class: 'appt__body',
        type: 'button',
        onclick: () => openAppointmentSheet(appointment, ctx),
      },
      h('span', { class: 'appt__when' }, whenLabel(appointment.at, today, tomorrow)),
      h('strong', {}, appointmentTitle(appointment, ctx.doctors)),
      details.length ? h('span', { class: 'muted' }, details.join(' · ')) : null,
      appointment.status !== 'planned'
        ? h('span', { class: 'appt__status' }, APPOINTMENT_STATUS[appointment.status])
        : null,
      appointment.afterNotes ? h('span', { class: 'appt__notes' }, appointment.afterNotes) : null,
    ),
    doctor?.phone ? callLink(doctor.phone, doctor.name) : null,
  );
}

function doctorRow(doctor) {
  return h(
    'li',
    { class: 'contact' },
    h(
      'button',
      {
        class: 'contact__text contact__text--button',
        type: 'button',
        onclick: () => openDoctorSheet(doctor),
      },
      h('strong', {}, doctor.name),
      h(
        'span',
        { class: 'muted' },
        [DOCTOR_KINDS[doctor.kind], doctor.specialty, doctor.phone].filter(Boolean).join(' · '),
      ),
    ),
    callLink(doctor.phone, doctor.name),
  );
}

export function renderCare(outlet) {
  const state = { care: null, meds: [] };

  function render() {
    if (!state.care) return;
    const { doctors, appointments } = state.care;
    const ctx = { doctors, meds: state.meds.filter((m) => m.active) };
    const now = parseStamp(nowStamp());
    const today = dayKey();
    const tomorrow = dayFromIndex(dayIndex(today) + 1);
    const upcoming = upcomingAppointments(appointments, now);
    const past = pastAppointments(appointments, now);
    const sortedDoctors = [...doctors].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'fr'),
    );
    const rows = (list) =>
      h(
        'ul',
        { class: 'appt-list' },
        list.map((a) => appointmentRow(a, ctx, today, tomorrow)),
      );

    mount(
      outlet,
      pageHeader('Rendez-vous', 'Santé'),
      h(
        'div',
        { class: 'stack' },
        h(
          'button',
          {
            class: 'btn btn--primary btn--lg',
            type: 'button',
            onclick: () => openAppointmentSheet(null, ctx),
          },
          '+ Rendez-vous',
        ),
        card({
          title: 'À venir',
          iconName: 'today',
          body: upcoming.length ? rows(upcoming) : emptyState('Aucun rendez-vous prévu.'),
        }),
        past.length
          ? card({
              title: 'Historique',
              body: h(
                'details',
                { class: 'more' },
                h('summary', {}, `${past.length} rendez-vous`),
                rows(past),
              ),
            })
          : null,
        card({
          title: 'Contacts médicaux',
          iconName: 'phone',
          body: sortedDoctors.length
            ? h('ul', { class: 'contact-list' }, sortedDoctors.map(doctorRow))
            : emptyState("Médecins, pharmacies, laboratoires : appelle-les d'un tap."),
          footer: h(
            'button',
            {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () => openDoctorSheet(null),
            },
            '+ Contact',
          ),
        }),
      ),
    );
  }

  const stops = [
    watchCare((care) => {
      state.care = care;
      render();
    }, reportError),
    watchMedsAndLogs(({ meds }) => {
      state.meds = meds;
      render();
    }, reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
