// Stock (phase 7.2) : badge « il reste X jours », « J'ai racheté » (+ dépense FCFA), saisie du stock.
import { openDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { h } from '../../lib/dom.js';
import { formatAmount, medTitle, parseAmount } from '../../lib/health/meds.js';
import { suggestedRefill } from '../../lib/health/stock.js';
import { formatXOF, parseAmount as parseXOF } from '../../lib/money.js';
import { recordRefill, setStock } from '../../repos/meds.js';

const shortDate = (date) => `${date.slice(8)}/${date.slice(5, 7)}`;
const decimal = (n) => String(n).replace('.', ',');

/** « 12 comprimés · ~6 j » ; ton selon le niveau (ok / low / out). */
export function stockBadge(med, status) {
  if (!status) return null;
  const text =
    status.level === 'out'
      ? 'Stock épuisé'
      : [formatAmount(status.remaining, med.unit), status.days != null ? `~${status.days} j` : null]
          .filter(Boolean)
          .join(' · ');
  return h('span', { class: `stock-badge stock-badge--${status.level}` }, text);
}

/** Ligne d'alerte de l'accueil : « Plus que 3 j (jusqu'au 10/10) ». */
export function stockAlertText(status) {
  if (status.level === 'out') return 'Stock épuisé';
  if (status.days != null) {
    return `Plus que ${status.days} j (jusqu'au ${shortDate(status.runsOutOn)})`;
  }
  return "Sous ton seuil d'alerte";
}

function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
  );
}

/** « J'ai racheté » : quantité ajoutée, prix FCFA, et dépense dans la catégorie Santé. */
export function openRefillSheet(med, refills) {
  const suggested = suggestedRefill(med, refills);
  const qty = h('input', {
    class: 'input',
    inputmode: 'decimal',
    required: true,
    'aria-label': 'Quantité achetée',
  });
  qty.value = suggested != null ? decimal(suggested) : '';
  const price = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'ex. 2 500' });
  price.value = med.price ? String(med.price) : '';
  const expense = h('input', { type: 'checkbox', class: 'switch__input' });
  expense.checked = true;

  let dialog;
  const submit = async (e) => {
    e.preventDefault();
    const amount = parseAmount(qty.value);
    if (amount == null) {
      showToast('Quantité invalide.', { tone: 'danger' });
      return;
    }
    const hasPrice = Boolean(price.value.trim());
    const xof = hasPrice ? parseXOF(price.value) : null;
    if (hasPrice && !xof) {
      showToast('Prix invalide (FCFA, nombre entier).', { tone: 'danger' });
      return;
    }
    try {
      await recordRefill(med, { qty: amount, price: xof, createExpense: expense.checked });
      dialog.close();
      showToast(
        expense.checked && xof
          ? `Stock mis à jour, dépense de ${formatXOF(xof)} ajoutée.`
          : 'Stock mis à jour.',
      );
    } catch (err) {
      reportError(err);
    }
  };

  dialog = openDialog({
    title: `J'ai racheté · ${medTitle(med)}`,
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      h(
        'div',
        { class: 'form-grid' },
        field(`Quantité (${med.unit})`, qty),
        field('Prix payé (FCFA)', price),
      ),
      h(
        'label',
        { class: 'switch' },
        expense,
        h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
        'Ajouter la dépense (catégorie Santé)',
      ),
      med.pharmacy
        ? h('p', { class: 'field__hint' }, `Pharmacie habituelle : ${med.pharmacy}`)
        : null,
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
    ),
  });
  qty.focus();
}

/** Saisie du stock actuel (après un comptage) : devient le nouveau point de départ. */
export function openStockSheet(med, remaining) {
  const qty = h('input', {
    class: 'input',
    inputmode: 'decimal',
    required: true,
    'aria-label': 'Quantité restante',
  });
  qty.value = remaining != null ? decimal(remaining) : '';
  let dialog;
  const submit = async (e) => {
    e.preventDefault();
    const raw = qty.value.trim().replace(',', '.');
    const value = /^\d{1,6}(\.\d{1,2})?$/.test(raw) ? Number(raw) : null;
    if (value == null || value > 100000) {
      showToast('Quantité invalide.', { tone: 'danger' });
      return;
    }
    try {
      await setStock(med.id, value);
      dialog.close();
      showToast('Stock enregistré.');
    } catch (err) {
      reportError(err);
    }
  };
  dialog = openDialog({
    title: `Stock · ${medTitle(med)}`,
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      field(
        `Il me reste (${med.unit})`,
        qty,
        'Les prochaines prises seront déduites automatiquement.',
      ),
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Enregistrer'),
    ),
  });
  qty.focus();
}
