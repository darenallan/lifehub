// Journal santé du jour (phase 7.3) : #/health/journal[/YYYY-MM-DD].
// Enregistrement automatique à chaque changement. Humeur et sommeil vont dans habitDay
// (une seule source de vérité, partagée avec l'écran Habitudes).
import { reportError } from '../../components/toast.js';
import { dayKey, formatLongDate, parseDayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import {
  DEFAULT_SYMPTOMS,
  ENERGY,
  MOODS,
  formatSleep,
  parseSleep,
  parseTags,
  setSeverity,
  toggleSymptom,
} from '../../lib/health/journal.js';
import { dayFromIndex, dayIndex } from '../../lib/health/schedule.js';
import { setJournal } from '../../repos/habits.js';
import { saveJournal, watchJournalDay } from '../../repos/health.js';
import { card } from '../common.js';

/**
 * Échelle 1..n de boutons. `labels` : texte affiché (emoji) ou intitulé (affiché en chiffre).
 * Un second appui désélectionne (onPick(null)), sauf si `required`.
 */
function scale(labels, current, label, onPick, { required = false } = {}) {
  let value = current;
  const buttons = labels.map((text, i) => {
    const n = i + 1;
    const isWord = text.length > 2;
    return h(
      'button',
      {
        class: 'scale__btn',
        type: 'button',
        title: isWord ? text : null,
        'aria-pressed': String(value === n),
        'aria-label': `${label} : ${isWord ? text : `${n} sur ${labels.length}`}`,
        onclick: () => {
          if (value === n && required) return;
          value = value === n ? null : n;
          for (const [j, b] of buttons.entries()) {
            b.setAttribute('aria-pressed', String(value === j + 1));
          }
          onPick(value);
        },
      },
      isWord ? String(n) : text,
    );
  });
  return h('div', { class: 'scale', role: 'group', 'aria-label': label }, buttons);
}

function switchRow(box, label) {
  return h(
    'label',
    { class: 'switch' },
    box,
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
    label,
  );
}

function moodCard(entry, habitDay, { save, saveHabit, setStatus }) {
  const sleep = h('input', {
    class: 'input',
    inputmode: 'decimal',
    placeholder: 'ex. 7,5',
    'aria-label': 'Heures de sommeil',
  });
  sleep.value = formatSleep(habitDay?.sleepMinutes);
  sleep.addEventListener('change', () => {
    const minutes = parseSleep(sleep.value);
    if (minutes === undefined) setStatus("Sommeil : un nombre d'heures (ex. 7,5).");
    else saveHabit({ sleepMinutes: minutes });
  });
  return card({
    title: 'Humeur et énergie',
    body: [
      h('span', { class: 'field__label' }, 'Humeur'),
      scale(MOODS, habitDay?.mood ?? null, 'Humeur', (mood) => saveHabit({ mood })),
      h('span', { class: 'field__label' }, 'Énergie (1 = épuisé, 5 = en pleine forme)'),
      scale(ENERGY, entry?.energy ?? null, 'Énergie', (energy) => save({ energy })),
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field__label' }, 'Sommeil (heures)'),
        sleep,
      ),
    ],
  });
}

function painCard(entry, { save }) {
  const painOn = h('input', { type: 'checkbox', class: 'switch__input' });
  painOn.checked = entry?.painLevel != null;
  const pain = h('input', {
    class: 'range',
    type: 'range',
    min: 0,
    max: 10,
    step: 1,
    'aria-label': 'Niveau de douleur, de 0 à 10',
  });
  pain.value = String(entry?.painLevel ?? 0);
  const painValue = h('strong', { class: 'range__value' }, `${pain.value}/10`);
  const zone = h('input', {
    class: 'input',
    maxlength: 40,
    placeholder: 'Zone (ex. dos, tête)',
    'aria-label': 'Zone de la douleur',
  });
  zone.value = entry?.painZone ?? '';
  const box = h(
    'div',
    { class: 'stack stack--tight' },
    h('div', { class: 'row' }, pain, painValue),
    zone,
  );
  box.hidden = !painOn.checked;

  painOn.addEventListener('change', () => {
    box.hidden = !painOn.checked;
    save(painOn.checked ? { painLevel: Number(pain.value) } : { painLevel: null, painZone: null });
  });
  pain.addEventListener('input', () => {
    painValue.textContent = `${pain.value}/10`;
  });
  pain.addEventListener('change', () => save({ painLevel: Number(pain.value) }));
  zone.addEventListener('change', () => save({ painZone: zone.value.trim() || null }));

  return card({ title: 'Douleur', body: [switchRow(painOn, "J'ai mal aujourd'hui"), box] });
}

function symptomsCard(entry, { save }) {
  let symptoms = entry?.symptoms ?? [];
  const box = h('div', { class: 'stack' });
  const custom = h('input', {
    class: 'input',
    maxlength: 40,
    placeholder: 'Autre symptôme',
    'aria-label': 'Autre symptôme',
  });

  function update(next) {
    symptoms = next;
    render();
    save({ symptoms });
  }

  function render() {
    const names = [
      ...DEFAULT_SYMPTOMS,
      ...symptoms.map((s) => s.name).filter((n) => !DEFAULT_SYMPTOMS.includes(n)),
    ];
    const selected = (name) => symptoms.some((s) => s.name.toLowerCase() === name.toLowerCase());
    mount(
      box,
      h(
        'div',
        { class: 'chips' },
        names.map((name) =>
          h(
            'button',
            {
              class: 'chip chip--toggle',
              type: 'button',
              'aria-pressed': String(selected(name)),
              onclick: () => update(toggleSymptom(symptoms, name)),
            },
            name,
          ),
        ),
      ),
      symptoms.length
        ? h(
            'ul',
            { class: 'symptom-list' },
            symptoms.map((s) =>
              h(
                'li',
                { class: 'symptom' },
                h('span', { class: 'symptom__name' }, s.name),
                scale(
                  ['1', '2', '3', '4', '5'],
                  s.severity,
                  `Intensité de ${s.name}`,
                  (v) => update(setSeverity(symptoms, s.name, v)),
                  { required: true },
                ),
              ),
            ),
          )
        : null,
    );
  }

  render();
  const addCustom = (e) => {
    e.preventDefault();
    if (!custom.value.trim()) return;
    update(toggleSymptom(symptoms, custom.value));
    custom.value = '';
  };
  return card({
    title: 'Symptômes',
    body: [
      box,
      h(
        'form',
        { class: 'row', onsubmit: addCustom },
        custom,
        h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Ajouter'),
      ),
    ],
  });
}

function notesCard(entry, { save }) {
  const tags = h('input', {
    class: 'input',
    maxlength: 300,
    placeholder: 'ex. chaleur, stress, voyage',
    'aria-label': 'Tags, séparés par des virgules',
  });
  tags.value = (entry?.tags ?? []).join(', ');
  tags.addEventListener('change', () => save({ tags: parseTags(tags.value) }));
  const note = h('textarea', {
    class: 'input textarea',
    rows: 4,
    maxlength: 1000,
    placeholder: "Comment tu te sens aujourd'hui ?",
    'aria-label': 'Note du jour',
  });
  note.value = entry?.note ?? '';
  note.addEventListener('change', () => save({ note: note.value.trim() || null }));
  return card({ title: 'Tags et note', body: [tags, note] });
}

export function renderJournal(outlet, requestedDay) {
  const today = dayKey();
  const day = parseDayKey(requestedDay) && requestedDay <= today ? requestedDay : today;
  const prev = dayFromIndex(dayIndex(day) - 1);
  const next = dayFromIndex(dayIndex(day) + 1);
  const status = h('p', { class: 'field__hint', role: 'status' });
  const setStatus = (text) => {
    status.textContent = text;
  };
  const save = (patch) =>
    saveJournal(day, patch)
      .then(() => setStatus('Enregistré.'))
      .catch(reportError);
  const saveHabit = (patch) =>
    setJournal(day, patch)
      .then(() => setStatus('Enregistré.'))
      .catch(reportError);
  const actions = { save, saveHabit, setStatus };

  const header = h(
    'header',
    { class: 'page-header page-header--row' },
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, 'Journal santé'),
      h(
        'h1',
        { class: 'page-title' },
        day === today ? "Aujourd'hui" : formatLongDate(parseDayKey(day)),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'a',
        { class: 'icon-btn', href: `#/health/journal/${prev}`, 'aria-label': 'Jour précédent' },
        '‹',
      ),
      day < today
        ? h(
            'a',
            { class: 'icon-btn', href: `#/health/journal/${next}`, 'aria-label': 'Jour suivant' },
            '›',
          )
        : null,
    ),
  );

  let mounted = false;
  return watchJournalDay(
    day,
    ({ entry, habitDay }) => {
      if (mounted) return; // pas de reconstruction pendant la saisie
      mounted = true;
      mount(
        outlet,
        header,
        h(
          'div',
          { class: 'stack' },
          moodCard(entry, habitDay, actions),
          painCard(entry, actions),
          symptomsCard(entry, actions),
          notesCard(entry, actions),
          status,
        ),
      );
      setStatus('Enregistrement automatique, même hors ligne.');
    },
    reportError,
  );
}
