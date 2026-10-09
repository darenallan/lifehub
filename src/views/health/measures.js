// Mesures (phase 7.3) : #/health/measures (types + dernières valeurs) et #/health/measures/<clé>
// (courbe 7/30/90 j, moyenne/min/max/tendance, plage cible perso, historique).
// Chiffres descriptifs uniquement : aucune interprétation médicale.
import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { lineChart } from '../../lib/charts.js';
import { dayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import {
  CONTEXTS,
  FIELD_LABELS,
  allTypes,
  bmi,
  customKey,
  formatNumber,
  formatReading,
  latestByType,
  outOfTarget,
  parseReading,
  series,
  stats,
} from '../../lib/health/measures.js';
import { dayFromIndex, dayIndex, nowStamp, parseStamp } from '../../lib/health/schedule.js';
import {
  deleteMeasure,
  saveMeasure,
  saveMeasureType,
  watchHealthProfile,
  watchMeasures,
} from '../../repos/health.js';
import { card, emptyState, pageHeader } from '../common.js';

const PERIODS = [7, 30, 90];
const TREND = { up: '↗ en hausse', down: '↘ en baisse', flat: '→ stable' };

const shortStamp = (at) => `${at.slice(8, 10)}/${at.slice(5, 7)} ${at.slice(11)}`;

function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
  );
}

function numberInput(value, label) {
  const el = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': label });
  el.value = value != null ? String(value).replace('.', ',') : '';
  return el;
}

/** Ajout d'une mesure. Sans type imposé, on le choisit d'abord (puces). */
export function openMeasureSheet(types, typeKey = null) {
  let type = types.find((t) => t.key === typeKey) ?? null;
  const body = h('div', { class: 'stack' });
  let dialog;

  function renderForm() {
    const inputs = Object.fromEntries(
      type.fields.map((f) => [f, numberInput(null, FIELD_LABELS[f])]),
    );
    const unit = h(
      'select',
      { class: 'input' },
      type.units.map((u) => h('option', { value: u }, u || '—')),
    );
    const context = h(
      'select',
      { class: 'input' },
      h('option', { value: '' }, 'Aucun'),
      Object.entries(CONTEXTS).map(([k, label]) => h('option', { value: k }, label)),
    );
    const now = nowStamp();
    const date = h('input', { class: 'input', type: 'date', value: now.slice(0, 10) });
    const time = h('input', { class: 'input', type: 'time', value: now.slice(11) });
    const note = h('input', {
      class: 'input',
      maxlength: 200,
      placeholder: 'Note (facultatif)',
      'aria-label': 'Note',
    });

    const submit = async (e) => {
      e.preventDefault();
      const values = {};
      for (const [f, el] of Object.entries(inputs)) {
        if (!el.value.trim()) continue;
        const v = parseReading(el.value);
        if (v == null) {
          showToast(`${FIELD_LABELS[f]} : nombre invalide.`, { tone: 'danger' });
          return;
        }
        values[f] = v;
      }
      const required = type.required ?? type.fields;
      if (!required.every((f) => values[f] != null)) {
        showToast('Renseigne les valeurs principales.', { tone: 'danger' });
        return;
      }
      if (!date.value || !time.value) return;
      try {
        await saveMeasure(null, {
          typeKey: type.key,
          values,
          at: `${date.value}T${time.value}`,
          date: date.value,
          context: context.value || null,
          unit: type.units.length > 1 ? unit.value : null,
          note: note.value.trim() || null,
        });
        dialog.close();
        showToast('Mesure enregistrée.');
      } catch (err) {
        reportError(err);
      }
    };

    mount(
      body,
      h(
        'form',
        { class: 'stack', onsubmit: submit },
        h(
          'div',
          { class: 'form-grid' },
          Object.entries(inputs).map(([f, el]) => field(FIELD_LABELS[f], el)),
          type.units.length > 1 ? field('Unité', unit) : null,
        ),
        h('div', { class: 'form-grid' }, field('Jour', date), field('Heure', time)),
        field('Contexte', context),
        note,
        h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
      ),
    );
    Object.values(inputs)[0]?.focus();
  }

  function renderPicker() {
    const pick = (t) => () => {
      type = t;
      renderForm();
    };
    mount(
      body,
      h(
        'div',
        { class: 'chips' },
        types.map((t) => h('button', { class: 'chip', type: 'button', onclick: pick(t) }, t.label)),
      ),
    );
  }

  dialog = openDialog({
    title: type ? `Mesure · ${type.label}` : 'Nouvelle mesure',
    content: body,
  });
  if (type) renderForm();
  else renderPicker();
}

/** Type personnalisé : libellé + unité (une seule valeur). */
function openCustomTypeSheet() {
  const label = h('input', {
    class: 'input',
    maxlength: 40,
    required: true,
    placeholder: 'ex. Hydratation',
  });
  const unit = h('input', { class: 'input', maxlength: 12, placeholder: 'ex. L' });
  let dialog;
  const submit = async (e) => {
    e.preventDefault();
    const name = label.value.trim();
    if (!name) return;
    try {
      await saveMeasureType(customKey(name, crypto.randomUUID().slice(0, 4)), {
        label: name,
        unit: unit.value.trim() || null,
        custom: true,
        targets: {},
      });
      dialog.close();
      showToast('Type de mesure ajouté.');
    } catch (err) {
      reportError(err);
    }
  };
  dialog = openDialog({
    title: 'Type de mesure personnalisé',
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      field('Nom', label),
      field('Unité', unit),
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Ajouter'),
    ),
  });
  label.focus();
}

/** Plage cible : saisie par l'utilisateur (ex. donnée par son médecin), jamais pré-remplie. */
function openTargetSheet(type) {
  const fields = type.key === 'bp' ? ['sys', 'dia'] : ['value'];
  const inputs = fields.map((f) => ({
    f,
    min: numberInput(type.targets?.[f]?.min, `${FIELD_LABELS[f]} minimum`),
    max: numberInput(type.targets?.[f]?.max, `${FIELD_LABELS[f]} maximum`),
  }));
  let dialog;
  const submit = async (e) => {
    e.preventDefault();
    const targets = {};
    for (const { f, min, max } of inputs) {
      const lo = min.value.trim() ? parseReading(min.value) : null;
      const hi = max.value.trim() ? parseReading(max.value) : null;
      if ((min.value.trim() && lo == null) || (max.value.trim() && hi == null)) {
        showToast('Nombre invalide.', { tone: 'danger' });
        return;
      }
      if (lo != null && hi != null && lo > hi) {
        showToast('Le minimum dépasse le maximum.', { tone: 'danger' });
        return;
      }
      if (lo != null || hi != null) targets[f] = { min: lo, max: hi };
    }
    try {
      await saveMeasureType(type.key, {
        label: type.label,
        unit: type.units[0] || null,
        custom: type.custom,
        targets,
      });
      dialog.close();
      showToast('Plage cible enregistrée.');
    } catch (err) {
      reportError(err);
    }
  };
  dialog = openDialog({
    title: `Plage cible · ${type.label}`,
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      h(
        'p',
        { class: 'muted' },
        'Indique la plage donnée par ton médecin. Laisse vide pour ne pas en avoir.',
      ),
      inputs.map(({ f, min, max }) =>
        h(
          'div',
          { class: 'form-grid' },
          field(`${FIELD_LABELS[f]} min`, min),
          field(`${FIELD_LABELS[f]} max`, max),
        ),
      ),
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
    ),
  });
}

function typeTile(type, last, heightCm) {
  const off = last ? outOfTarget(type, last.values) : [];
  const extra =
    type.key === 'weight' && last && heightCm
      ? `IMC ${formatNumber(bmi(last.values.value, heightCm))}`
      : null;
  return h(
    'li',
    {},
    h(
      'a',
      {
        class: `measure-tile${off.length ? ' measure-tile--off' : ''}`,
        href: `#/health/measures/${type.key}`,
      },
      h('span', { class: 'measure-tile__label' }, type.label),
      h(
        'strong',
        { class: 'measure-tile__value' },
        last ? formatReading(type, last.values, last.unit) : '—',
      ),
      h(
        'span',
        { class: 'measure-tile__meta' },
        [last ? shortStamp(last.at) : 'Pas encore de mesure', extra].filter(Boolean).join(' · '),
      ),
    ),
  );
}

function renderList(outlet, types, measures, profile) {
  const latest = latestByType(measures);
  const used = types
    .filter((t) => latest.has(t.key))
    .sort((a, b) => latest.get(b.key).at.localeCompare(latest.get(a.key).at));
  const unused = types.filter((t) => !latest.has(t.key));
  mount(
    outlet,
    pageHeader('Mesures', 'Santé'),
    h(
      'div',
      { class: 'stack' },
      h(
        'button',
        {
          class: 'btn btn--primary btn--lg',
          type: 'button',
          onclick: () => openMeasureSheet(types),
        },
        '+ Ajouter une mesure',
      ),
      used.length
        ? h(
            'ul',
            { class: 'measure-grid' },
            used.map((t) => typeTile(t, latest.get(t.key), profile?.heightCm)),
          )
        : emptyState('Aucune mesure pour le moment.'),
      card({
        title: used.length ? 'Autres types' : 'Types disponibles',
        body: [
          h(
            'div',
            { class: 'chips' },
            unused.map((t) =>
              h('a', { class: 'chip', href: `#/health/measures/${t.key}` }, t.label),
            ),
          ),
          h(
            'button',
            { class: 'btn btn--ghost btn--sm', type: 'button', onclick: openCustomTypeSheet },
            '+ Type personnalisé',
          ),
        ],
      }),
    ),
  );
}

function statsBlock(points, unit) {
  const s = stats(points);
  if (!s.count) return h('p', { class: 'muted' }, 'Aucune mesure sur la période.');
  const fmt = (v) => `${formatNumber(v)}${unit ? ` ${unit}` : ''}`;
  return h(
    'dl',
    { class: 'stats' },
    [
      ['Moyenne', fmt(s.avg)],
      ['Min / max', `${formatNumber(s.min)} / ${formatNumber(s.max)}`],
      ['Mesures', String(s.count)],
      ['Tendance', s.trend ? TREND[s.trend] : '—'],
    ].map(([dt, dd]) => h('div', { class: 'stat' }, h('dt', {}, dt), h('dd', {}, dd))),
  );
}

function targetText(type) {
  const entries = Object.entries(type.targets ?? {});
  if (!entries.length) return 'Aucune plage définie.';
  const bound = (v) => (v != null ? formatNumber(v) : '…');
  return entries
    .map(([f, r]) => `${FIELD_LABELS[f]} : ${bound(r.min)} – ${bound(r.max)}`)
    .join(' · ');
}

function historyRow(type, m) {
  const off = outOfTarget(type, m.values).length > 0;
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette mesure ?',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) await deleteMeasure(m.id);
  };
  return h(
    'li',
    { class: `measure-row${off ? ' measure-row--off' : ''}` },
    h(
      'div',
      { class: 'measure-row__text' },
      h('strong', {}, formatReading(type, m.values, m.unit)),
      h(
        'span',
        { class: 'muted' },
        [shortStamp(m.at), CONTEXTS[m.context], m.note].filter(Boolean).join(' · '),
      ),
    ),
    h(
      'button',
      {
        class: 'icon-btn icon-btn--quiet',
        type: 'button',
        'aria-label': `Supprimer la mesure du ${shortStamp(m.at)}`,
        onclick: () => remove().catch(reportError),
      },
      '×',
    ),
  );
}

function renderDetail(outlet, types, measures, key, period, setPeriod) {
  const type = types.find((t) => t.key === key);
  if (!type) {
    mount(outlet, pageHeader('Mesures', 'Santé'), emptyState('Type de mesure introuvable.'));
    return;
  }
  const today = dayKey();
  const from = dayFromIndex(dayIndex(today) - period + 1);
  const entries = measures
    .filter((m) => m.typeKey === key)
    .sort((a, b) => b.at.localeCompare(a.at));
  const unit = entries[0]?.unit ?? type.units[0];
  const mainFields = type.key === 'bp' ? ['sys', 'dia'] : ['value'];
  const lines = mainFields.map((f) => ({
    field: f,
    points: series(measures, key, f, from),
    className: `line__series line__series--${f}`,
  }));
  const band = type.key === 'bp' ? type.targets?.sys : type.targets?.value;

  const segmented = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Période' },
    PERIODS.map((n) =>
      h(
        'button',
        {
          class: 'segmented__btn',
          type: 'button',
          'aria-pressed': String(n === period),
          onclick: () => setPeriod(n),
        },
        `${n} j`,
      ),
    ),
  );

  mount(
    outlet,
    pageHeader(type.label, 'Mesures'),
    h(
      'div',
      { class: 'stack' },
      h(
        'button',
        {
          class: 'btn btn--primary btn--lg',
          type: 'button',
          onclick: () => openMeasureSheet(types, key),
        },
        '+ Ajouter',
      ),
      card({
        title: 'Évolution',
        body: [
          segmented,
          lines.some((l) => l.points.length)
            ? lineChart(lines, {
                from: parseStamp(`${from}T00:00`),
                to: parseStamp(`${today}T23:59`),
                band,
                label: `${type.label} sur ${period} jours`,
              })
            : emptyState('Aucune mesure sur la période.'),
          type.key === 'bp'
            ? h(
                'p',
                { class: 'field__hint' },
                'Trait plein : systolique · trait clair : diastolique.',
              )
            : null,
          lines.map((l) =>
            h(
              'div',
              { class: 'stack stack--tight' },
              lines.length > 1
                ? h('h3', { class: 'dose-group__title' }, FIELD_LABELS[l.field])
                : null,
              statsBlock(l.points, unit),
            ),
          ),
        ],
      }),
      card({
        title: 'Plage cible',
        body: [
          h('p', { class: 'muted' }, targetText(type)),
          h(
            'button',
            {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () => openTargetSheet(type),
            },
            'Définir la plage',
          ),
        ],
      }),
      card({
        title: 'Historique',
        body: entries.length
          ? h(
              'ul',
              { class: 'measure-list' },
              entries.slice(0, 100).map((m) => historyRow(type, m)),
            )
          : emptyState('Aucune mesure.'),
      }),
    ),
  );
}

export function renderMeasures(outlet, key = null) {
  const state = { data: null, profile: null, period: 30 };
  function render() {
    if (!state.data) return;
    const types = allTypes(state.data.types);
    if (!key) {
      renderList(outlet, types, state.data.measures, state.profile);
      return;
    }
    renderDetail(outlet, types, state.data.measures, key, state.period, (n) => {
      state.period = n;
      render();
    });
  }
  const stops = [
    watchMeasures((data) => {
      state.data = data;
      render();
    }, reportError),
    watchHealthProfile((profile) => {
      state.profile = profile;
      render();
    }, reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
