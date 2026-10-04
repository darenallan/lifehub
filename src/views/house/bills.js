import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError } from '../../components/toast.js';
import { dayKey, formatLongDate, parseDayKey } from '../../lib/dates.js';
import { h } from '../../lib/dom.js';
import { billDueLabel, billState, sortBills } from '../../lib/house.js';
import { formatXOF, parseAmount } from '../../lib/money.js';
import { deleteBill, saveBill, setBillPaid } from '../../repos/house.js';
import { card } from '../common.js';
import { memberName, withMeta } from './common.js';

const RECURRENCES = [
  ['', 'Une fois'],
  ['monthly', 'Chaque mois'],
  ['yearly', 'Chaque année'],
];
const recurrenceLabel = (value) => (value ? RECURRENCES.find(([v]) => v === value)?.[1] : null);

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
}

/** Création / modification d'une facture : réservé à l'admin (l'API le vérifie aussi). */
function openBillEditor(houseId, bill = null) {
  const label = h('input', {
    class: 'input',
    maxlength: 80,
    required: true,
    value: bill?.label ?? '',
    placeholder: 'Loyer, CIE, SODECI, internet…',
  });
  const amount = h('input', {
    class: 'input',
    inputmode: 'numeric',
    value: bill ? String(bill.amount) : '',
    placeholder: 'Montant en FCFA',
  });
  const dueDate = h('input', {
    class: 'input',
    type: 'date',
    required: true,
    value: bill?.dueDate ?? dayKey(),
  });
  const recurrence = h(
    'select',
    { class: 'input' },
    RECURRENCES.map(([value, text]) =>
      h('option', { value, selected: value === (bill?.recurrence ?? '') }, text),
    ),
  );
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const save = (e) => {
    e.preventDefault();
    const value = parseAmount(amount.value);
    if (!label.value.trim()) {
      error.textContent = 'Le libellé est obligatoire.';
      return;
    }
    if (!value) {
      error.textContent = 'Montant invalide (entier en FCFA).';
      return;
    }
    if (!dueDate.value) {
      error.textContent = "La date d'échéance est obligatoire.";
      return;
    }
    saveBill(houseId, bill?.id, {
      label: label.value.trim(),
      amount: value,
      dueDate: dueDate.value,
      recurrence: recurrence.value || null,
      ...(bill ? {} : { paid: false, paidOn: null, paidBy: null }),
    }).catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer « ${bill.label} » ?`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteBill(bill.id).catch(reportError);
    dialog.close();
  };

  const content = h(
    'form',
    { class: 'stack', onsubmit: save },
    field('Libellé', label),
    h(
      'div',
      { class: 'form-grid' },
      field('Montant', amount),
      field('Échéance', dueDate),
      field('Répéter', recurrence),
    ),
    h('p', { class: 'muted' }, 'Une facture répétée payée crée automatiquement la suivante.'),
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      bill
        ? h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer')
        : null,
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({ title: bill ? 'Modifier la facture' : 'Nouvelle facture', content });
  label.focus();
}

/** Ligne de facture non payée (réutilisée par « Aujourd'hui »). */
export function unpaidBillRow(bill, { isAdmin, today = dayKey() }) {
  const meta = [formatXOF(bill.amount), billDueLabel(bill, today), recurrenceLabel(bill.recurrence)]
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    { class: `bill bill--${billState(bill, today)}` },
    h(
      'button',
      {
        class: 'bill__body',
        type: 'button',
        disabled: !isAdmin,
        onclick: () => openBillEditor(bill.houseId, bill),
      },
      h('span', { class: 'bill__label' }, bill.label),
      h('span', { class: 'bill__meta' }, meta),
    ),
    h(
      'button',
      {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onclick: () => setBillPaid(bill, true).catch(reportError),
      },
      'Payée',
    ),
  );
}

export function billsPanel({ house, bills, members, isAdmin, uid }) {
  const today = dayKey();
  const { unpaid, paid } = sortBills(bills);
  const due = unpaid.reduce((sum, b) => sum + b.amount, 0);

  const paidMeta = (bill) =>
    [
      formatXOF(bill.amount),
      bill.paidOn ? `payée le ${formatLongDate(parseDayKey(bill.paidOn))}` : 'payée',
      bill.paidBy ? `par ${memberName(members, bill.paidBy)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const paidRow = (bill) =>
    h(
      'li',
      { class: 'bill bill--paid' },
      h(
        'div',
        { class: 'bill__body' },
        h('span', { class: 'bill__label' }, bill.label),
        h('span', { class: 'bill__meta' }, paidMeta(bill)),
      ),
      isAdmin || bill.paidBy === uid
        ? h(
            'button',
            {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () => setBillPaid(bill, false).catch(reportError),
            },
            'Annuler',
          )
        : null,
    );

  return withMeta(
    card({
      title: 'Factures',
      iconName: 'house',
      body: [
        isAdmin
          ? h(
              'button',
              {
                class: 'btn btn--primary btn--sm',
                type: 'button',
                onclick: () => openBillEditor(house.id),
              },
              '+ Facture',
            )
          : h(
              'p',
              { class: 'muted' },
              "Seul l'admin ajoute les factures ; tu peux les marquer payées.",
            ),
        unpaid.length
          ? h(
              'ul',
              { class: 'bill-list' },
              unpaid.map((b) => unpaidBillRow(b, { isAdmin, today })),
            )
          : h('p', { class: 'empty' }, 'Aucune facture à payer.'),
        paid.length
          ? [
              h('h3', { class: 'section-title' }, 'Payées'),
              h('ul', { class: 'bill-list' }, paid.slice(0, 10).map(paidRow)),
            ]
          : null,
      ],
    }),
    due ? `Reste ${formatXOF(due)}` : '',
  );
}
