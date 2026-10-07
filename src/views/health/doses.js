// Prises : lignes, feuille d'actions, prises à la demande, rattrapage.
// Partagé par l'écran Santé et la carte « Prises du jour » d'Aujourd'hui.
import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { h, mount } from '../../lib/dom.js';
import { INSTRUCTIONS, MED_FORMS, dayPart, formatAmount, medTitle } from '../../lib/health/meds.js';
import {
  doseWarnings,
  formatStamp,
  nowStamp,
  parseStamp,
  wallMinutes,
} from '../../lib/health/schedule.js';
import { deleteDoseLog, recordAsNeeded, recordDose, undoDose } from '../../repos/meds.js';

const STATUS_LABEL = {
  upcoming: null,
  due: 'À prendre',
  snoozed: 'Reportée',
  missed: 'Manquée',
  taken: 'Prise',
  skipped: 'Ignorée',
};

const shortDate = (date) => `${date.slice(8)}/${date.slice(5, 7)}`;

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

/**
 * Limites saisies par l'utilisateur (max / 24 h, écart minimal) : on prévient, on n'empêche pas.
 * Résout true si on enregistre.
 */
async function confirmLimits(med, logs, now, ignoreKey) {
  const w = doseWarnings(med, logs, now, ignoreKey);
  const reasons = [];
  if (w.tooSoon) {
    reasons.push(
      `Dernière prise il y a ${formatDuration(w.sinceLast)} ; tu as fixé un écart minimal de ${formatDuration(med.schedule.minGapMin)}.`,
    );
  }
  if (w.overMax) {
    reasons.push(
      `${w.count24h} prise(s) sur les dernières 24 h ; ta limite est de ${med.schedule.maxPer24h}.`,
    );
  }
  if (!reasons.length) return true;
  return confirmDialog({
    title: 'Attention : risque de double prise',
    message: `${reasons.join(' ')} En cas de doute, demande l'avis d'un médecin ou d'un pharmacien.`,
    confirmLabel: 'Enregistrer quand même',
    danger: true,
  });
}

/** Marque une prise planifiée comme prise (heure réelle `takenAt`, par défaut maintenant). */
export async function markTaken(entry, logs, takenAt = nowStamp()) {
  const ok = await confirmLimits(entry.med, logs, parseStamp(takenAt), entry.occurrence.key);
  if (!ok) return false;
  await recordDose(entry.occurrence, { status: 'taken', takenAt });
  return true;
}

function statusText(entry) {
  const { status, log } = entry;
  if (status === 'taken') return `Prise à ${log.takenAt.slice(11)}`;
  if (status === 'snoozed') return `Reportée → ${log.snoozeUntil.slice(11)}`;
  return STATUS_LABEL[status];
}

/** Ligne de prise : rond à cocher (pris / annuler) + zone qui ouvre la feuille d'actions. */
export function doseRow(entry, logs) {
  const { med, occurrence, status } = entry;
  const done = status === 'taken';
  const toggle = async () => {
    try {
      if (done) {
        await undoDose(occurrence);
        showToast('Prise annulée.');
      } else if (await markTaken(entry, logs)) {
        showToast('Prise enregistrée.');
      }
    } catch (err) {
      reportError(err);
    }
  };
  const label = statusText(entry);
  return h(
    'li',
    { class: `dose dose--${status} cat--${med.color}` },
    h(
      'button',
      {
        class: 'dose__check',
        type: 'button',
        'aria-pressed': String(done),
        'aria-label': done ? `Annuler la prise de ${med.name}` : `Marquer ${med.name} comme pris`,
        onclick: toggle,
      },
      done ? '✓' : '',
    ),
    h(
      'button',
      {
        class: 'dose__body',
        type: 'button',
        'aria-label': `Options pour ${med.name} à ${occurrence.time}`,
        onclick: () => openDoseSheet(entry, logs),
      },
      h('strong', { class: 'dose__name' }, medTitle(med)),
      h(
        'span',
        { class: 'dose__meta' },
        [formatAmount(occurrence.amount, med.unit), INSTRUCTIONS[med.instructions]]
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    h(
      'span',
      { class: 'dose__when' },
      h('span', { class: 'dose__time' }, occurrence.time),
      label ? h('span', { class: 'dose__status' }, label) : null,
    ),
  );
}

/** Prises regroupées par moment de la journée. */
export function doseList(entries, logs) {
  const groups = new Map();
  for (const entry of entries) {
    const part = dayPart(entry.occurrence.time);
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part).push(entry);
  }
  return [...groups].map(([part, list]) =>
    h(
      'section',
      { class: 'dose-group' },
      h('h3', { class: 'dose-group__title' }, part),
      h(
        'ul',
        { class: 'dose-list' },
        list.map((entry) => doseRow(entry, logs)),
      ),
    ),
  );
}

/** Feuille d'actions d'une prise : pris (maintenant ou à une heure), reporter, ignorer, annuler. */
export function openDoseSheet(entry, logs) {
  const { med, occurrence, log, status } = entry;
  const now = nowStamp();
  const note = h('input', {
    class: 'input',
    maxlength: 200,
    placeholder: 'Note (facultatif)',
    autocomplete: 'off',
    'aria-label': 'Note',
  });
  note.value = log?.note ?? '';
  const takenTime = h('input', { class: 'input', type: 'time', required: true });
  takenTime.value = log?.takenAt?.slice(11) ?? now.slice(11);
  const noteValue = () => note.value.trim() || null;

  let dialog;
  const run = (fn, message) => async () => {
    try {
      if ((await fn()) === false) return;
      dialog.close();
      if (message) showToast(message);
    } catch (err) {
      reportError(err);
    }
  };

  // Le jour de la prise, ou le lendemain pour une prise du soir confirmée après minuit
  // (ex. prise de 22:00 prise à 00:30).
  function takenStamp() {
    const sameDay = parseStamp(`${occurrence.date}T${takenTime.value}`);
    const due = wallMinutes(occurrence.date, occurrence.time);
    return formatStamp(sameDay < due - 12 * 60 ? sameDay + 1440 : sameDay);
  }

  const takeAt = (takenAt) => async () => {
    if (!(await confirmLimits(med, logs, parseStamp(takenAt()), occurrence.key))) return false;
    return recordDose(occurrence, { status: 'taken', takenAt: takenAt(), note: noteValue() });
  };

  const snoozeOptions = [...new Set([med.reminder?.snoozeMin ?? 15, 10, 30, 60])].sort(
    (a, b) => a - b,
  );
  const logged = ['taken', 'skipped', 'snoozed'].includes(status);

  dialog = openDialog({
    title: `${medTitle(med)} · ${occurrence.time}`,
    content: h(
      'div',
      { class: 'stack dose-sheet' },
      h(
        'p',
        { class: 'muted' },
        [
          `${MED_FORMS[med.form]?.emoji ?? ''} ${formatAmount(occurrence.amount, med.unit)}`,
          INSTRUCTIONS[med.instructions],
          occurrence.date !== now.slice(0, 10) ? `prévue le ${shortDate(occurrence.date)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      med.notes ? h('p', { class: 'dose-sheet__notes' }, med.notes) : null,
      logged
        ? h(
            'div',
            { class: 'notice' },
            h('span', {}, statusText(entry)),
            h(
              'button',
              {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                onclick: run(() => undoDose(occurrence), 'Action annulée.'),
              },
              'Annuler',
            ),
          )
        : null,
      h(
        'button',
        {
          class: 'btn btn--primary btn--lg',
          type: 'button',
          onclick: run(
            takeAt(() => now),
            'Prise enregistrée.',
          ),
        },
        'Pris maintenant',
      ),
      h(
        'div',
        { class: 'dose-sheet__row' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Pris à'), takenTime),
        h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: run(takeAt(takenStamp), 'Heure de prise enregistrée.'),
          },
          'Enregistrer',
        ),
      ),
      h(
        'div',
        { class: 'stack stack--tight' },
        h('span', { class: 'field__label' }, 'Reporter de'),
        h(
          'div',
          { class: 'chips' },
          snoozeOptions.map((minutes) =>
            h(
              'button',
              {
                class: 'chip',
                type: 'button',
                onclick: run(
                  () =>
                    recordDose(occurrence, {
                      status: 'snoozed',
                      snoozeUntil: formatStamp(parseStamp(nowStamp()) + minutes),
                      note: noteValue(),
                    }),
                  `Reportée de ${minutes} min.`,
                ),
              },
              `${minutes} min`,
            ),
          ),
        ),
      ),
      note,
      h(
        'button',
        {
          class: 'btn btn--ghost',
          type: 'button',
          onclick: run(
            () => recordDose(occurrence, { status: 'skipped', note: noteValue() }),
            'Prise ignorée.',
          ),
        },
        'Ignorer cette prise',
      ),
    ),
  });
}

/** Médicament « à la demande » : compteur sur 24 h, bouton de prise, prises du jour annulables. */
export function asNeededRow(med, logs, today) {
  const now = parseStamp(nowStamp());
  const w = doseWarnings(med, logs, now);
  const todays = logs
    .filter((l) => l.medId === med.id && !l.scheduled && l.date === today)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const take = async () => {
    try {
      const takenAt = nowStamp();
      if (!(await confirmLimits(med, logs, parseStamp(takenAt)))) return;
      await recordAsNeeded(med, { takenAt, amount: med.schedule.amount });
      showToast('Prise enregistrée.');
    } catch (err) {
      reportError(err);
    }
  };
  const max = med.schedule.maxPer24h ? ` / ${med.schedule.maxPer24h}` : '';
  return h(
    'li',
    { class: `dose dose--asneeded cat--${med.color}` },
    h('span', { class: 'dose__dot', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'dose__body dose__body--static' },
      h('strong', { class: 'dose__name' }, medTitle(med)),
      h(
        'span',
        { class: 'dose__meta' },
        `${formatAmount(med.schedule.amount, med.unit)} · ${w.count24h}${max} sur 24 h`,
      ),
      todays.length
        ? h(
            'span',
            { class: 'chips dose__taken' },
            todays.map((l) =>
              h(
                'button',
                {
                  class: 'chip chip--sm',
                  type: 'button',
                  'aria-label': `Annuler la prise de ${l.takenAt.slice(11)}`,
                  onclick: () =>
                    deleteDoseLog(l.id)
                      .then(() => showToast('Prise annulée.'))
                      .catch(reportError),
                },
                `${l.takenAt.slice(11)} ×`,
              ),
            ),
          )
        : null,
    ),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: take }, "J'en prends"),
  );
}

/** Rattrapage : prises manquées depuis hier, à confirmer (prises à l'heure prévue) ou ignorer. */
export function openCatchUp(missed, logs) {
  const list = h('ul', { class: 'dose-list' });
  const remaining = new Set(missed.map((m) => m.occurrence.key));
  const rows = new Map();
  let dialog;
  const done = (key) => {
    remaining.delete(key);
    rows.get(key)?.remove();
    if (!remaining.size) dialog.close();
  };
  mount(
    list,
    missed.map((entry) => {
      const { med, occurrence } = entry;
      const row = h(
        'li',
        { class: `dose cat--${med.color}` },
        h('span', { class: 'dose__dot', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'dose__body dose__body--static' },
          h('strong', { class: 'dose__name' }, medTitle(med)),
          h('span', { class: 'dose__meta' }, `${shortDate(occurrence.date)} à ${occurrence.time}`),
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn btn--primary btn--sm',
              type: 'button',
              onclick: () =>
                markTaken(entry, logs, `${occurrence.date}T${occurrence.time}`)
                  .then((ok) => ok && done(occurrence.key))
                  .catch(reportError),
            },
            'Prise',
          ),
          h(
            'button',
            {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () =>
                recordDose(occurrence, { status: 'skipped' })
                  .then(() => done(occurrence.key))
                  .catch(reportError),
            },
            'Ignorée',
          ),
        ),
      );
      rows.set(occurrence.key, row);
      return row;
    }),
  );
  dialog = openDialog({
    title: 'Prises manquées',
    content: h(
      'div',
      { class: 'stack' },
      h(
        'p',
        { class: 'muted' },
        "Indique ce qui s'est passé. « Prise » enregistre l'heure prévue ; pour une autre heure, ouvre la prise depuis la liste du jour.",
      ),
      list,
    ),
  });
}
