import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError } from '../components/toast.js';
import { dayKey, formatLongDate, parseDayKey } from '../lib/dates.js';
import { balancesByPerson, debtTotals, knownPeople } from '../lib/debts.js';
import { h, mount } from '../lib/dom.js';
import { formatXOF, parseAmount } from '../lib/money.js';
import { deleteDebt, saveDebt, setDebtSettled, watchDebts } from '../repos/extras.js';
import { card, pageHeader } from './common.js';

const DIRECTIONS = [
  ['lent', 'On me doit'],
  ['borrowed', 'Je dois'],
];
const dateLabel = (key) => formatLongDate(parseDayKey(key));
const signed = (amount) => `${amount >= 0 ? '+' : '−'}${formatXOF(Math.abs(amount))}`;

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));
}

function openDebtEditor(debt, people) {
  const person = h('input', {
    class: 'input',
    maxlength: 60,
    required: true,
    list: 'debt-people',
    value: debt?.person ?? '',
    placeholder: 'Nom',
  });
  const direction = h(
    'select',
    { class: 'input' },
    DIRECTIONS.map(([value, label]) =>
      h('option', { value, selected: value === (debt?.direction ?? 'lent') }, label),
    ),
  );
  const amount = h('input', {
    class: 'input',
    inputmode: 'numeric',
    value: debt ? String(debt.amount) : '',
    placeholder: 'Montant en FCFA',
  });
  const date = h('input', { class: 'input', type: 'date', value: debt?.date ?? dayKey() });
  const note = h('input', {
    class: 'input',
    maxlength: 200,
    value: debt?.note ?? '',
    placeholder: 'Pour quoi ? (facultatif)',
  });
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const save = (e) => {
    e.preventDefault();
    const value = parseAmount(amount.value);
    if (!person.value.trim()) {
      error.textContent = 'Le nom est obligatoire.';
      return;
    }
    if (!value) {
      error.textContent = 'Montant invalide (entier en FCFA).';
      return;
    }
    saveDebt(debt?.id, {
      person: person.value.trim(),
      direction: direction.value,
      amount: value,
      date: date.value || dayKey(),
      note: note.value.trim() || null,
      ...(debt ? {} : { settled: false, settledOn: null }),
    }).catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette ligne ?',
      message: `${debt.person} · ${formatXOF(debt.amount)}`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteDebt(debt.id).catch(reportError);
    dialog.close();
  };

  const content = h(
    'form',
    { class: 'stack', onsubmit: save },
    h(
      'div',
      { class: 'form-grid' },
      field('Personne', person),
      field('Sens', direction),
      field('Montant', amount),
      field('Date', date),
    ),
    h(
      'datalist',
      { id: 'debt-people' },
      people.map((p) => h('option', { value: p })),
    ),
    note,
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      debt
        ? h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer')
        : null,
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({ title: debt ? 'Modifier' : 'Nouvelle dette ou prêt', content });
  person.focus();
}

function debtRow(debt, people) {
  const label = debt.direction === 'lent' ? 'me doit' : 'je dois';
  const meta = [
    dateLabel(debt.date),
    debt.note,
    debt.settled && debt.settledOn ? `réglé le ${dateLabel(debt.settledOn)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    { class: `debt${debt.settled ? ' is-done' : ''}` },
    h(
      'button',
      { class: 'debt__body', type: 'button', onclick: () => openDebtEditor(debt, people) },
      h('span', { class: 'debt__title' }, `${debt.person} · ${label}`),
      h('span', { class: 'debt__meta' }, meta),
    ),
    h(
      'span',
      { class: `debt__amount debt__amount--${debt.direction}` },
      signed(debt.direction === 'lent' ? debt.amount : -debt.amount),
    ),
    h(
      'button',
      {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onclick: () => setDebtSettled(debt, !debt.settled).catch(reportError),
      },
      debt.settled ? 'Rouvrir' : 'Réglé',
    ),
  );
}

export function renderDebts(outlet) {
  const body = h('div', { class: 'stack' });
  let people = [];
  const add = h(
    'button',
    {
      class: 'btn btn--primary btn--sm',
      type: 'button',
      onclick: () => openDebtEditor(null, people),
    },
    '+ Ajouter',
  );
  mount(outlet, pageHeader('Dettes et prêts'), h('div', { class: 'stack' }, add, body));

  return watchDebts((debts) => {
    people = knownPeople(debts);
    const totals = debtTotals(debts);
    const open = debts.filter((d) => !d.settled).sort((a, b) => b.date.localeCompare(a.date));
    const settled = debts
      .filter((d) => d.settled)
      .sort((a, b) => (b.settledOn ?? '').localeCompare(a.settledOn ?? ''))
      .slice(0, 20);
    const balances = balancesByPerson(debts);

    mount(
      body,
      card({
        title: 'Solde',
        body: h(
          'dl',
          { class: 'stats' },
          stat('On me doit', formatXOF(totals.owedToMe)),
          stat('Je dois', formatXOF(totals.iOwe)),
          stat('Net', signed(totals.net)),
        ),
      }),
      balances.length
        ? card({
            title: 'Par personne',
            body: h(
              'ul',
              { class: 'review-list' },
              balances.map((b) =>
                h(
                  'li',
                  {},
                  h('span', {}, b.person),
                  h(
                    'strong',
                    {},
                    b.net > 0 ? `te doit ${formatXOF(b.net)}` : `tu lui dois ${formatXOF(-b.net)}`,
                  ),
                ),
              ),
            ),
          })
        : null,
      card({
        title: 'En cours',
        body: open.length
          ? h(
              'ul',
              { class: 'debt-list' },
              open.map((d) => debtRow(d, people)),
            )
          : h('p', { class: 'empty' }, 'Rien en cours. Note ici ce que tu prêtes ou empruntes.'),
      }),
      settled.length
        ? card({
            title: 'Réglés récemment',
            body: h(
              'ul',
              { class: 'debt-list' },
              settled.map((d) => debtRow(d, people)),
            ),
          })
        : null,
    );
  }, reportError);
}
