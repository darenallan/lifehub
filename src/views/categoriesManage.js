import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { activeCategories, CATEGORY_COLORS, parseBudget } from '../lib/expenses.js';
import { addCategory, deleteCategory, updateCategory, watchCategories } from '../repos/expenses.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

function colorSelect(value, label) {
  return h(
    'select',
    { class: 'input input--color', 'aria-label': label },
    CATEGORY_COLORS.map(([key, name]) =>
      h('option', { value: key, selected: key === value }, name),
    ),
  );
}

function budgetInput(value, label) {
  return h('input', {
    class: 'input input--budget',
    inputmode: 'numeric',
    placeholder: 'Budget / mois',
    value: value ? String(value) : '',
    'aria-label': label,
  });
}

function addForm(getExisting) {
  const emoji = h('input', {
    class: 'input input--emoji',
    maxlength: 16,
    placeholder: '🏷️',
    'aria-label': 'Emoji (facultatif)',
  });
  const name = h('input', {
    class: 'input',
    maxlength: 40,
    required: true,
    placeholder: 'Nouvelle catégorie',
    'aria-label': 'Nom de la catégorie',
  });
  const color = colorSelect('gray', 'Couleur');
  const budget = budgetInput(0, 'Budget mensuel en FCFA (facultatif)');
  const error = h('p', { class: 'error', role: 'alert' });

  return h(
    'form',
    {
      class: 'stack',
      onsubmit: (e) => {
        e.preventDefault();
        const value = name.value.trim();
        const monthlyBudget = parseBudget(budget.value);
        if (!value) return;
        if (monthlyBudget === null) {
          error.textContent = 'Budget invalide (entier en FCFA).';
          return;
        }
        error.textContent = '';
        addCategory(
          { name: value, emoji: emoji.value.trim(), color: color.value, monthlyBudget },
          getExisting(),
        ).catch(reportError);
        e.target.reset();
        name.focus();
      },
    },
    h('div', { class: 'row' }, emoji, name),
    h(
      'div',
      { class: 'row' },
      color,
      budget,
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
    ),
    error,
  );
}

function reorder(siblings, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= siblings.length) return;
  const next = [...siblings];
  [next[index], next[target]] = [next[target], next[index]];
  next.forEach((c, i) => {
    if (c.order !== i) updateCategory(c.id, { order: i }).catch(reportError);
  });
}

function categoryRow(category, index, siblings) {
  const update = (patch) => updateCategory(category.id, patch).catch(reportError);

  const name = h('input', {
    class: 'input',
    maxlength: 40,
    value: category.name,
    'aria-label': `Nom de ${category.name}`,
    onchange: (e) => {
      const value = e.target.value.trim();
      if (!value) e.target.value = category.name;
      else if (value !== category.name) update({ name: value });
    },
  });
  const emoji = h('input', {
    class: 'input input--emoji',
    maxlength: 16,
    value: category.emoji ?? '',
    'aria-label': `Emoji de ${category.name}`,
    onchange: (e) => update({ emoji: e.target.value.trim() || null }),
  });
  const color = colorSelect(category.color, `Couleur de ${category.name}`);
  color.addEventListener('change', () => update({ color: color.value }));
  const budget = budgetInput(category.monthlyBudget, `Budget mensuel de ${category.name}`);
  budget.addEventListener('change', () => {
    const value = parseBudget(budget.value);
    if (value === null) budget.value = category.monthlyBudget ? String(category.monthlyBudget) : '';
    else if (value !== category.monthlyBudget) update({ monthlyBudget: value });
  });

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer « ${category.name} » ?`,
      message:
        'Les dépenses déjà saisies restent, sous « Sans catégorie ». « Archiver » la masque sans rien perdre.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) deleteCategory(category.id).catch(reportError);
  };

  const arrow = (label, delta, disabled, text) =>
    h(
      'button',
      {
        class: 'icon-btn icon-btn--sm',
        type: 'button',
        'aria-label': `${label} ${category.name}`,
        disabled,
        onclick: () => reorder(siblings, index, delta),
      },
      text,
    );

  return h(
    'li',
    { class: `manage-item cat--${category.color ?? 'gray'}` },
    h('div', { class: 'row' }, h('span', { class: 'cat-dot', 'aria-hidden': 'true' }), emoji, name),
    h('div', { class: 'row' }, color, budget),
    h(
      'div',
      { class: 'row manage-item__actions' },
      index >= 0
        ? [
            arrow('Monter', -1, index === 0, '↑'),
            arrow('Descendre', 1, index === siblings.length - 1, '↓'),
          ]
        : null,
      h(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          onclick: () => update({ active: !category.active }),
        },
        category.active ? 'Archiver' : 'Réactiver',
      ),
      h(
        'button',
        { class: 'btn btn--danger btn--sm', type: 'button', onclick: remove },
        'Supprimer',
      ),
    ),
  );
}

/** Fenêtre « Catégories et budgets ». */
export function openCategoryManager() {
  let categories = [];
  let renderLater = false;
  const list = h('div', { class: 'stack' });

  function render() {
    // Ne pas reconstruire pendant une saisie : on attend la sortie du champ.
    const focused = document.activeElement;
    if (list.contains(focused) && ['INPUT', 'SELECT'].includes(focused.tagName)) {
      renderLater = true;
      return;
    }
    renderLater = false;
    const active = activeCategories(categories);
    const archived = categories.filter((c) => !c.active).sort(byName);
    mount(
      list,
      active.length
        ? h(
            'ul',
            { class: 'manage-items' },
            active.map((c, i) => categoryRow(c, i, active)),
          )
        : h('p', { class: 'empty' }, 'Aucune catégorie active.'),
      archived.length
        ? [
            h('h3', { class: 'manage-subtitle' }, 'Archivées'),
            h(
              'ul',
              { class: 'manage-items' },
              archived.map((c) => categoryRow(c, -1, [])),
            ),
          ]
        : null,
    );
  }
  list.addEventListener('focusout', () => setTimeout(() => renderLater && render(), 0));

  const content = h(
    'div',
    { class: 'stack' },
    h(
      'p',
      { class: 'muted' },
      'Budget mensuel en FCFA ; laisse vide pour ne pas suivre de budget.',
    ),
    addForm(() => categories),
    list,
  );
  let unsubscribe = null;
  openDialog({ title: 'Catégories et budgets', content, onClose: () => unsubscribe?.() });
  unsubscribe = watchCategories((all) => {
    categories = all;
    render();
  }, reportError);
}
