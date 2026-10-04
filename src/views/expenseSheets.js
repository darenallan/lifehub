// Fenêtres de saisie : ajout rapide (montant → catégorie), modification, dépense récurrente.
import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError, showToast } from '../components/toast.js';
import { dayKey } from '../lib/dates.js';
import { h } from '../lib/dom.js';
import { activeCategories, firstRecurringMonth, occurrenceDate } from '../lib/expenses.js';
import { formatXOF, parseAmount } from '../lib/money.js';
import {
  addExpense,
  deleteExpense,
  deleteRecurring,
  generateRecurring,
  saveRecurring,
  updateExpense,
} from '../repos/expenses.js';

export const categoryLabel = (category) =>
  category ? `${category.emoji ? `${category.emoji} ` : ''}${category.name}` : 'Sans catégorie';

/** Champ montant avec aperçu formaté (« 12 500 FCFA »). */
function amountField(initial) {
  const input = h('input', {
    class: 'input amount-input',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: '0',
    'aria-label': 'Montant en FCFA',
    value: initial ? String(initial) : '',
  });
  const preview = h('p', { class: 'amount-preview', 'aria-live': 'polite' });
  const update = () => {
    const value = parseAmount(input.value);
    const typed = Boolean(input.value.trim());
    preview.textContent = value ? formatXOF(value) : typed ? 'Montant invalide' : 'FCFA';
    preview.classList.toggle('error', !value && typed);
  };
  input.addEventListener('input', update);
  update();
  return { input, preview, value: () => parseAmount(input.value) };
}

/** Grille de catégories ; onPick(category, button, buttons). */
function categoryPicker(categories, selectedId, onPick) {
  const buttons = activeCategories(categories).map((c) =>
    h(
      'button',
      {
        type: 'button',
        class: `cat-btn cat--${c.color ?? 'gray'}`,
        'aria-pressed': String(c.id === selectedId),
        onclick: (e) => onPick(c, e.currentTarget, buttons),
      },
      h('span', { class: 'cat-btn__emoji', 'aria-hidden': 'true' }, c.emoji || '•'),
      h('span', { class: 'cat-btn__name' }, c.name),
    ),
  );
  return h('div', { class: 'cat-grid', role: 'group', 'aria-label': 'Catégorie' }, buttons);
}

const dateInput = (value) =>
  h('input', { class: 'input', type: 'date', value, required: true, 'aria-label': 'Date' });
const noteInput = (value, placeholder = 'Note (facultatif)') =>
  h('input', {
    class: 'input',
    maxlength: 200,
    value: value ?? '',
    placeholder,
    'aria-label': placeholder,
  });

/**
 * Ajout rapide : on tape le montant, puis un tap sur la catégorie enregistre.
 * « Annuler » dans le toast supprime la dépense créée.
 */
export function openQuickAdd(categories) {
  const amount = amountField();
  const date = dateInput(dayKey());
  const note = noteInput();
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const picker = categoryPicker(categories, null, async (category) => {
    const value = amount.value();
    if (!value) {
      error.textContent = "Saisis d'abord un montant.";
      amount.input.focus();
      return;
    }
    dialog.close();
    try {
      const id = await addExpense({
        amount: value,
        categoryId: category.id,
        note: note.value.trim(),
        date: date.value || dayKey(),
      });
      showToast(`${formatXOF(value)} · ${category.name}`, {
        actionLabel: 'Annuler',
        onAction: () => deleteExpense(id).catch(reportError),
        duration: 6000,
      });
    } catch (err) {
      reportError(err);
    }
  });

  const hasCategories = activeCategories(categories).length > 0;
  const content = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'amount-box' }, amount.input, amount.preview),
    error,
    hasCategories
      ? [h('p', { class: 'muted' }, 'Choisis la catégorie pour enregistrer :'), picker]
      : h('p', { class: 'empty' }, 'Aucune catégorie active : crée-en une dans « Catégories ».'),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, 'Date et note'),
      h('div', { class: 'stack' }, date, note),
    ),
  );
  dialog = openDialog({ title: 'Nouvelle dépense', content });
  amount.input.focus();
}

/** Modification / suppression d'une dépense existante. */
export function openExpenseEditor(expense, categories) {
  const amount = amountField(expense.amount);
  let categoryId = expense.categoryId;
  const date = dateInput(expense.date);
  const note = noteInput(expense.note);
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const picker = categoryPicker(categories, categoryId, (category, button, buttons) => {
    categoryId = category.id;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  });

  const save = () => {
    const value = amount.value();
    if (!value) return (error.textContent = 'Montant invalide.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return (error.textContent = 'Date invalide.');
    updateExpense(expense.id, {
      amount: value,
      categoryId,
      date: date.value,
      note: note.value.trim() || null,
    }).catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette dépense ?',
      message: `${formatXOF(expense.amount)} le ${expense.date}`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteExpense(expense.id).catch(reportError);
    dialog.close();
  };

  const content = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'amount-box' }, amount.input, amount.preview),
    picker,
    date,
    note,
    expense.recurringId ? h('p', { class: 'muted' }, '↻ Créée par une dépense récurrente.') : null,
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({ title: 'Modifier la dépense', content });
}

/** Création / modification d'une dépense récurrente (template absent = création). */
export function openRecurringEditor(categories, template = null) {
  const today = dayKey();
  const amount = amountField(template?.amount);
  const category = h(
    'select',
    { class: 'input', 'aria-label': 'Catégorie' },
    activeCategories(categories).map((c) =>
      h('option', { value: c.id, selected: c.id === template?.categoryId }, categoryLabel(c)),
    ),
  );
  const note = noteInput(template?.note, 'Libellé (ex. Loyer, Internet)');
  const day = h('input', {
    class: 'input input--narrow',
    type: 'number',
    min: 1,
    max: 31,
    value: template?.dayOfMonth ?? Number(today.slice(8)),
    'aria-label': 'Jour du mois',
  });
  const hint = h('p', { class: 'muted' });
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const dayValue = () => {
    const n = Number(day.value);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  };
  const updateHint = () => {
    const n = dayValue();
    if (!n) {
      hint.textContent = '';
      return;
    }
    hint.textContent = template
      ? 'Chaque mois à ce jour (le 31 = dernier jour du mois).'
      : `Première dépense le ${occurrenceDate(firstRecurringMonth(n, today), n)}, puis chaque mois.`;
  };
  day.addEventListener('input', updateHint);
  updateHint();

  const save = () => {
    const value = amount.value();
    const n = dayValue();
    if (!value || !n || !category.value) {
      error.textContent = 'Montant, catégorie et jour (1 à 31) sont obligatoires.';
      return;
    }
    const data = {
      amount: value,
      categoryId: category.value,
      note: note.value.trim() || null,
      dayOfMonth: n,
    };
    const full = template
      ? data
      : { ...data, startMonth: firstRecurringMonth(n, today), lastMonth: null, active: true };
    saveRecurring(template?.id, full)
      .then(() => generateRecurring())
      .catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette dépense récurrente ?',
      message: 'Les dépenses déjà créées sont conservées.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteRecurring(template.id).catch(reportError);
    dialog.close();
  };

  const togglePause = () => {
    saveRecurring(template.id, { active: !template.active }).catch(reportError);
    dialog.close();
  };

  const content = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'amount-box' }, amount.input, amount.preview),
    note,
    category,
    h('label', { class: 'row' }, h('span', { class: 'muted' }, 'Chaque mois, le'), day),
    hint,
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      template
        ? [
            h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer'),
            h(
              'button',
              { class: 'btn btn--ghost', type: 'button', onclick: togglePause },
              template.active ? 'Mettre en pause' : 'Reprendre',
            ),
          ]
        : null,
      h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({
    title: template ? 'Dépense récurrente' : 'Nouvelle dépense récurrente',
    content,
  });
}
