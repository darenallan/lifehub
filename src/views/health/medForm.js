// Fiche médicament : création / modification, planning, dates, rappels.
// Tout est saisi par l'utilisateur : aucune dose suggérée, aucune base médicamenteuse.
import { confirmDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { dayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import {
  DEFAULT_REMINDER,
  INSTRUCTIONS,
  MED_COLORS,
  MED_FORMS,
  SCHEDULE_TYPES,
  WEEKDAY_LABELS,
  parseAmount,
} from '../../lib/health/meds.js';
import { nowStamp } from '../../lib/health/schedule.js';
import { stockStatus, tracksStock } from '../../lib/health/stock.js';
import { parseAmount as parseXOF } from '../../lib/money.js';
import { deleteMed, saveMed, watchMedsAndLogs } from '../../repos/meds.js';
import { card, pageHeader } from '../common.js';
import { openRefillSheet, openStockSheet, stockBadge } from './stock.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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

const decimal = (n) => String(n).replace('.', ',');

function intOrNull(text, min, max) {
  const t = String(text ?? '').trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** Liste d'horaires (heure + quantité). En mode « single », un seul horaire de départ. */
function timesEditor(initial) {
  const list = h('div', { class: 'times' });
  const add = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, '+ Horaire');
  let single = false;

  function row(slot) {
    const time = input(slot.time, { type: 'time', 'aria-label': 'Heure' });
    const amount = input(decimal(slot.amount), {
      inputmode: 'decimal',
      'aria-label': 'Quantité',
    });
    const el = h(
      'div',
      { class: 'times__row' },
      time,
      amount,
      h(
        'button',
        {
          class: 'icon-btn icon-btn--quiet',
          type: 'button',
          'aria-label': 'Retirer cet horaire',
          onclick: () => {
            if (list.children.length > 1) el.remove();
          },
        },
        '×',
      ),
    );
    el.read = () => ({ time: time.value, amount: parseAmount(amount.value) });
    return el;
  }

  add.onclick = () => {
    const last = list.lastElementChild?.read();
    list.append(row({ time: '', amount: last?.amount ?? 1 }));
  };
  const slots = initial.length ? initial : [{ time: '08:00', amount: 1 }];
  for (const slot of slots) list.append(row(slot));

  return {
    el: h('div', { class: 'stack stack--tight' }, list, add),
    setSingle(value) {
      single = value;
      add.hidden = value;
      while (value && list.children.length > 1) list.lastElementChild.remove();
    },
    /** [{ time, amount }] triés, ou un message d'erreur. */
    read() {
      const values = [...list.children].map((el) => el.read());
      if (values.some((s) => !TIME.test(s.time))) return 'Chaque horaire doit avoir une heure.';
      if (values.some((s) => s.amount == null)) return 'Quantité invalide (ex. 1 ou 0,5).';
      if (new Set(values.map((s) => s.time)).size !== values.length) return 'Horaire en double.';
      return (single ? values.slice(0, 1) : values).sort((a, b) => a.time.localeCompare(b.time));
    },
  };
}

function weekdayPicker(initial) {
  const selected = new Set(initial.length ? initial : [1, 2, 3, 4, 5]);
  const buttons = WEEKDAY_LABELS.map((label, i) => {
    const day = i + 1;
    const btn = h(
      'button',
      { class: 'chip chip--toggle', type: 'button', 'aria-pressed': String(selected.has(day)) },
      label,
    );
    btn.onclick = () => {
      if (selected.has(day)) selected.delete(day);
      else selected.add(day);
      btn.setAttribute('aria-pressed', String(selected.has(day)));
    };
    return btn;
  });
  return { el: h('div', { class: 'chips' }, buttons), read: () => [...selected].sort() };
}

const COLOR_NAMES = {
  blue: 'Bleu',
  green: 'Vert',
  orange: 'Orange',
  red: 'Rouge',
  purple: 'Violet',
  yellow: 'Jaune',
  teal: 'Turquoise',
  pink: 'Rose',
  gray: 'Gris',
};

function colorPicker(initial) {
  let value = initial;
  const buttons = MED_COLORS.map((color) => {
    const btn = h('button', {
      class: `swatch cat--${color}`,
      type: 'button',
      'aria-label': COLOR_NAMES[color],
      'aria-pressed': String(color === value),
    });
    btn.onclick = () => {
      value = color;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
    };
    return btn;
  });
  return { el: h('div', { class: 'swatches' }, buttons), read: () => value };
}

function toggle(label, checked) {
  const box = h('input', { type: 'checkbox', class: 'switch__input' });
  box.checked = checked;
  return {
    box,
    el: h(
      'label',
      { class: 'switch' },
      box,
      h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
      label,
    ),
  };
}

const ADVANCE = { 0: "À l'heure", 5: '5 min avant', 10: '10 min avant', 30: '30 min avant' };
const REPEAT = {
  0: 'Pas de répétition',
  5: 'Toutes les 5 min',
  10: 'Toutes les 10 min',
  30: 'Toutes les 30 min',
};
const REPEAT_COUNT = { 1: '1 fois', 2: '2 fois', 3: '3 fois', 5: '5 fois' };
const SNOOZE = { 5: '5 min', 10: '10 min', 15: '15 min', 30: '30 min', 60: '1 h' };
const VISIBLE = {
  daily: ['times'],
  weekdays: ['weekdays', 'times'],
  everyNDays: ['interval', 'times'],
  everyNHours: ['interval', 'times'],
  cycle: ['cycle', 'times'],
  monthly: ['monthDay', 'times'],
  asNeeded: ['amount'],
};

/** Réglages du stock (7.2). Pour un traitement existant : restant calculé + actions. */
function stockCard(med, data) {
  const status = med && data ? stockStatus(med, data.logs, data.refills, dayKey()) : null;
  const initial = input('', { inputmode: 'decimal', placeholder: 'ex. 30' });
  const refillAt = input(med?.refillAt != null ? decimal(med.refillAt) : '', {
    inputmode: 'decimal',
    placeholder: 'ex. 7',
  });
  const packSize = input(med?.packSize != null ? decimal(med.packSize) : '', {
    inputmode: 'decimal',
    placeholder: 'ex. 30',
  });
  const pharmacy = input(med?.pharmacy, { maxlength: 60 });
  const price = input(med?.price ?? '', { inputmode: 'numeric', placeholder: 'FCFA' });

  const current = med
    ? tracksStock(med)
      ? h(
          'div',
          { class: 'notice' },
          stockBadge(med, status),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                onclick: () => openStockSheet(med, status?.remaining),
              },
              'Compter',
            ),
            h(
              'button',
              {
                class: 'btn btn--primary btn--sm',
                type: 'button',
                onclick: () => openRefillSheet(med, data.refills),
              },
              "J'ai racheté",
            ),
          ),
        )
      : h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: () => openStockSheet(med, null),
          },
          'Suivre le stock : saisir la quantité restante',
        )
    : field('Quantité actuelle (facultatif)', initial, 'Pour suivre le stock et être prévenu.');

  /** Champs du stock au format API, ou un message d'erreur. */
  function read() {
    const qty = (el) => {
      const raw = el.value.trim().replace(',', '.');
      if (!raw) return null;
      return /^\d{1,6}(\.\d{1,2})?$/.test(raw) && Number(raw) <= 100000 ? Number(raw) : undefined;
    };
    const values = { refillAt: qty(refillAt), packSize: qty(packSize) };
    if (Object.values(values).includes(undefined)) return 'Stock : quantité invalide.';
    if (values.packSize === 0) return 'Taille de boîte invalide.';
    const xof = price.value.trim() ? parseXOF(price.value) : null;
    if (price.value.trim() && !xof) return 'Prix invalide (FCFA, nombre entier).';
    const result = { ...values, pharmacy: pharmacy.value.trim() || null, price: xof };
    if (!med) {
      const start = qty(initial);
      if (start === undefined) return 'Quantité actuelle invalide.';
      if (start != null) Object.assign(result, { stockQty: start, stockAt: nowStamp() });
    }
    return result;
  }

  return {
    el: card({
      title: 'Stock (facultatif)',
      body: [
        current,
        h(
          'div',
          { class: 'form-grid' },
          field("Seuil d'alerte", refillAt),
          field('Taille de boîte', packSize),
        ),
        h(
          'div',
          { class: 'form-grid' },
          field('Pharmacie habituelle', pharmacy),
          field('Prix de la boîte', price),
        ),
      ],
    }),
    read,
  };
}

function buildForm(med, onDone, data = null) {
  const isNew = !med;
  const s = med?.schedule ?? { type: 'daily', times: [{ time: '08:00', amount: 1 }] };
  const r = { ...DEFAULT_REMINDER, ...med?.reminder };

  // ---------- Médicament ----------
  const name = input(med?.name, { maxlength: 60, required: true, placeholder: 'ex. Paracétamol' });
  const strength = input(med?.strength, { maxlength: 30, placeholder: 'ex. 500 mg' });
  const formLabels = Object.fromEntries(
    Object.entries(MED_FORMS).map(([key, f]) => [key, `${f.emoji} ${f.label}`]),
  );
  const form = select(formLabels, med?.form ?? 'tablet');
  const unit = input(med?.unit ?? MED_FORMS[form.value].unit, { maxlength: 20, required: true });
  let unitTouched = !isNew;
  unit.addEventListener('input', () => {
    unitTouched = true;
  });
  form.addEventListener('change', () => {
    if (!unitTouched) unit.value = MED_FORMS[form.value].unit;
  });
  const instructions = select({ '': 'Aucune', ...INSTRUCTIONS }, med?.instructions ?? '');
  const color = colorPicker(med?.color ?? 'blue');

  // ---------- Planning ----------
  const type = select(SCHEDULE_TYPES, s.type);
  const times = timesEditor(s.times ?? []);
  const weekdays = weekdayPicker(s.weekdays ?? []);
  const interval = input(s.interval ?? '', { inputmode: 'numeric', maxlength: 3 });
  const cycleOn = input(s.cycle?.on ?? 21, { inputmode: 'numeric', maxlength: 3 });
  const cycleOff = input(s.cycle?.off ?? 7, { inputmode: 'numeric', maxlength: 3 });
  const monthDay = input(s.monthDay ?? new Date().getDate(), {
    inputmode: 'numeric',
    maxlength: 2,
  });
  const asNeededAmount = input(decimal(s.amount ?? 1), { inputmode: 'decimal' });
  const maxPer24h = input(s.maxPer24h ?? '', { inputmode: 'numeric', maxlength: 2 });
  const minGapHours = input(s.minGapMin != null ? decimal(s.minGapMin / 60) : '', {
    inputmode: 'decimal',
    maxlength: 4,
  });
  const startDate = input(med?.startDate ?? dayKey(), { type: 'date', required: true });
  const endDate = input(med?.endDate ?? '', { type: 'date' });
  const stock = stockCard(med, data);

  const intervalLabel = h('span', { class: 'field__label' });
  const parts = {
    times: field('Horaires et quantité par prise', times.el),
    weekdays: field('Jours', weekdays.el),
    interval: h('label', { class: 'field' }, intervalLabel, interval),
    cycle: h(
      'div',
      { class: 'form-grid' },
      field('Jours de prise', cycleOn),
      field('Jours de pause', cycleOff),
    ),
    monthDay: field('Jour du mois', monthDay, 'Le 31 devient le dernier jour des mois courts.'),
    amount: field('Quantité par prise', asNeededAmount),
  };
  function updateType() {
    for (const [key, el] of Object.entries(parts)) el.hidden = !VISIBLE[type.value].includes(key);
    intervalLabel.textContent =
      type.value === 'everyNHours' ? 'Toutes les … heures' : 'Tous les … jours';
    times.setSingle(type.value === 'everyNHours');
  }
  type.addEventListener('change', updateType);
  updateType();

  // ---------- Rappels et notes ----------
  const reminderOn = toggle('Me rappeler les prises', r.enabled);
  const discreet = toggle('Mode discret (sans nom de médicament)', r.discreet);
  const advance = select(ADVANCE, String(r.advanceMin));
  const repeat = select(REPEAT, String(r.repeatEveryMin));
  const repeatCount = select(REPEAT_COUNT, String(r.repeatCount || 2));
  const snooze = select(SNOOZE, String(r.snoozeMin));
  const notes = h('textarea', {
    class: 'input textarea',
    rows: 3,
    maxlength: 500,
    placeholder: "Ce que ton médecin t'a dit, effets ressentis…",
  });
  notes.value = med?.notes ?? '';

  /** Planning au format de l'API, ou un message d'erreur. */
  function readSchedule() {
    const t = type.value;
    const schedule = { type: t };
    if (t === 'asNeeded') {
      schedule.amount = parseAmount(asNeededAmount.value);
      if (schedule.amount == null) return 'Quantité par prise invalide (ex. 1 ou 0,5).';
    } else {
      const slots = times.read();
      if (typeof slots === 'string') return slots;
      schedule.times = slots;
    }
    if (t === 'weekdays') {
      schedule.weekdays = weekdays.read();
      if (!schedule.weekdays.length) return 'Choisis au moins un jour.';
    }
    if (t === 'everyNDays' || t === 'everyNHours') {
      const [min, max] = t === 'everyNDays' ? [2, 365] : [1, 24];
      schedule.interval = intOrNull(interval.value, min, max);
      if (schedule.interval == null) return `Intervalle : un nombre entre ${min} et ${max}.`;
    }
    if (t === 'cycle') {
      const on = intOrNull(cycleOn.value, 1, 365);
      const off = intOrNull(cycleOff.value, 1, 365);
      if (on == null || off == null) return 'Cure : jours de prise et de pause entre 1 et 365.';
      schedule.cycle = { on, off };
    }
    if (t === 'monthly') {
      schedule.monthDay = intOrNull(monthDay.value, 1, 31);
      if (schedule.monthDay == null) return 'Jour du mois entre 1 et 31.';
    }
    if (maxPer24h.value.trim()) {
      schedule.maxPer24h = intOrNull(maxPer24h.value, 1, 48);
      if (schedule.maxPer24h == null) return 'Maximum par 24 h : entre 1 et 48.';
    }
    if (minGapHours.value.trim()) {
      const hours = Number(minGapHours.value.trim().replace(',', '.'));
      if (!(hours >= 0 && hours <= 48)) return 'Écart minimal : entre 0 et 48 heures.';
      schedule.minGapMin = Math.round(hours * 60);
    }
    return schedule;
  }

  async function submit(e) {
    e.preventDefault();
    const schedule = readSchedule();
    const stockFields = stock.read();
    const error =
      typeof schedule === 'string'
        ? schedule
        : typeof stockFields === 'string'
          ? stockFields
          : !name.value.trim() || !unit.value.trim()
            ? 'Nom et unité sont obligatoires.'
            : endDate.value && endDate.value < startDate.value
              ? 'La date de fin est avant la date de début.'
              : null;
    if (error) {
      showToast(error, { tone: 'danger' });
      return;
    }
    const repeatEvery = Number(repeat.value);
    try {
      await saveMed(med?.id, {
        name: name.value.trim(),
        strength: strength.value.trim() || null,
        form: form.value,
        unit: unit.value.trim(),
        instructions: instructions.value || null,
        color: color.read(),
        startDate: startDate.value,
        endDate: endDate.value || null,
        active: med?.active ?? true,
        ...stockFields,
        notes: notes.value.trim() || null,
        schedule,
        reminder: {
          enabled: reminderOn.box.checked,
          advanceMin: Number(advance.value),
          repeatEveryMin: repeatEvery,
          repeatCount: repeatEvery ? Number(repeatCount.value) : 0,
          snoozeMin: Number(snooze.value),
          discreet: discreet.box.checked,
        },
      });
      showToast(isNew ? 'Traitement ajouté.' : 'Traitement enregistré.');
      onDone();
    } catch (err) {
      reportError(err);
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Supprimer ${med.name} ?`,
      message: "L'historique des prises est conservé. Pour simplement arrêter, archive-le.",
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await deleteMed(med.id);
    showToast('Traitement supprimé.');
    onDone();
  }

  const toggleActive = () =>
    saveMed(med.id, { active: !med.active })
      .then(() => {
        showToast(med.active ? 'Traitement archivé.' : 'Traitement réactivé.');
        onDone();
      })
      .catch(reportError);

  return h(
    'form',
    { class: 'stack med-form', onsubmit: submit },
    card({
      title: 'Médicament',
      body: [
        field('Nom', name),
        h('div', { class: 'form-grid' }, field('Dosage', strength), field('Forme', form)),
        h('div', { class: 'form-grid' }, field('Unité', unit), field('Consigne', instructions)),
        field('Couleur', color.el),
      ],
    }),
    card({
      title: 'Planning',
      body: [
        field('Fréquence', type),
        ...Object.values(parts),
        h(
          'div',
          { class: 'form-grid' },
          field('Début', startDate),
          field('Fin', endDate, 'Vide : en continu.'),
        ),
      ],
    }),
    card({
      title: 'Limites (facultatif)',
      body: [
        h(
          'p',
          { class: 'muted' },
          "Seulement celles indiquées par ton médecin ou sur la notice : l'app te préviendra avant une prise de trop.",
        ),
        h(
          'div',
          { class: 'form-grid' },
          field('Max par 24 h', maxPer24h),
          field('Écart minimal (h)', minGapHours),
        ),
      ],
    }),
    card({
      title: 'Rappels',
      body: [
        reminderOn.el,
        h(
          'div',
          { class: 'form-grid' },
          field('Quand', advance),
          field('Report par défaut', snooze),
        ),
        h(
          'div',
          { class: 'form-grid' },
          field('Répéter', repeat),
          field('Combien de fois', repeatCount),
        ),
        discreet.el,
        h(
          'p',
          { class: 'field__hint' },
          "Les rappels s'affichent quand l'app est ouverte. Des rappels garantis app fermée arriveront plus tard.",
        ),
      ],
    }),
    stock.el,
    card({ title: 'Notes', body: notes }),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
      isNew
        ? null
        : h(
            'button',
            { class: 'btn btn--ghost', type: 'button', onclick: toggleActive },
            med.active ? 'Archiver (arrêter le traitement)' : 'Réactiver',
          ),
      isNew
        ? null
        : h(
            'button',
            {
              class: 'btn btn--danger',
              type: 'button',
              onclick: () => remove().catch(reportError),
            },
            'Supprimer',
          ),
    ),
  );
}

export function renderMedForm(outlet, id) {
  const isNew = id === 'new';
  const header = pageHeader(isNew ? 'Nouveau traitement' : 'Traitement', 'Santé');
  const done = () => {
    location.hash = '#/health';
  };
  if (isNew) {
    mount(outlet, header, buildForm(null, done));
    return undefined;
  }
  let mounted = false;
  return watchMedsAndLogs(({ meds, logs, refills }) => {
    if (mounted) return; // pas de reconstruction pendant la saisie
    mounted = true;
    const med = meds.find((m) => m.id === id);
    if (!med) {
      mount(
        outlet,
        header,
        card({
          title: 'Introuvable',
          body: h('p', { class: 'muted' }, 'Ce traitement a été supprimé.'),
        }),
      );
      return;
    }
    header.querySelector('.page-title').textContent = med.name;
    mount(outlet, header, buildForm(med, done, { logs, refills }));
  }, reportError);
}
