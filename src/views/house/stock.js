import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError } from '../../components/toast.js';
import { h } from '../../lib/dom.js';
import { formatQty, groupStock, isLowStock, parseQty } from '../../lib/house.js';
import { adjustStock, deleteStockItem, saveStockItem } from '../../repos/house.js';
import { card } from '../common.js';
import { withMeta } from './common.js';

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
}

function openStockEditor(houseId, item, locations) {
  const input = (attrs) => h('input', { class: 'input', ...attrs });
  const name = input({ maxlength: 60, required: true, value: item?.name ?? '' });
  const qty = input({ inputmode: 'decimal', value: item ? String(item.qty) : '0' });
  const unit = input({ maxlength: 16, value: item?.unit ?? '', placeholder: 'kg, L, paquet…' });
  const minQty = input({
    inputmode: 'decimal',
    value: item?.minQty != null ? String(item.minQty) : '',
    placeholder: "Vide = pas d'alerte",
  });
  const location = input({
    maxlength: 40,
    value: item?.location ?? '',
    list: 'stock-locations',
    placeholder: 'Placard, frigo…',
  });
  const datalist = h(
    'datalist',
    { id: 'stock-locations' },
    locations.map((l) => h('option', { value: l })),
  );
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const save = (e) => {
    e.preventDefault();
    const quantity = parseQty(qty.value);
    const hasThreshold = minQty.value.trim() !== '';
    const threshold = hasThreshold ? parseQty(minQty.value) : null;
    if (!name.value.trim()) {
      error.textContent = 'Le nom est obligatoire.';
      return;
    }
    if (quantity === null) {
      error.textContent = 'Quantité invalide (ex. 2 ou 1,5).';
      return;
    }
    if (hasThreshold && threshold === null) {
      error.textContent = 'Seuil invalide (ex. 1 ou 0,5).';
      return;
    }
    saveStockItem(houseId, item?.id, {
      name: name.value.trim(),
      qty: quantity,
      unit: unit.value.trim() || null,
      minQty: threshold,
      location: location.value.trim() || null,
    }).catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer « ${item.name} » du stock ?`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteStockItem(item.id).catch(reportError);
    dialog.close();
  };

  const content = h(
    'form',
    { class: 'stack', onsubmit: save },
    field('Article', name),
    h(
      'div',
      { class: 'form-grid' },
      field('Quantité', qty),
      field('Unité', unit),
      field("Seuil d'alerte", minQty),
      field('Emplacement', location),
    ),
    datalist,
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      item
        ? h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer')
        : null,
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({ title: item ? item.name : 'Nouvel article', content });
  name.focus();
}

export function stockPanel({ house, stock }) {
  const locations = [...new Set(stock.map((s) => s.location).filter(Boolean))].sort();
  const low = stock.filter(isLowStock).length;

  const row = (item) =>
    h(
      'li',
      { class: `stock-item${isLowStock(item) ? ' is-low' : ''}` },
      h(
        'button',
        {
          class: 'stock-item__body',
          type: 'button',
          onclick: () => openStockEditor(house.id, item, locations),
        },
        h(
          'span',
          { class: 'stock-item__name' },
          item.name,
          isLowStock(item) ? h('span', { class: 'badge badge--warn' }, 'à racheter') : null,
        ),
        item.minQty != null
          ? h(
              'span',
              { class: 'muted stock-item__meta' },
              `Seuil : ${formatQty(item.minQty, item.unit)}`,
            )
          : null,
      ),
      h(
        'div',
        { class: 'stepper' },
        h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            'aria-label': `Retirer 1 ${item.name}`,
            disabled: item.qty <= 0,
            onclick: () => adjustStock(item, -1).catch(reportError),
          },
          '−',
        ),
        h('output', { class: 'stepper__value' }, formatQty(item.qty, item.unit)),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            'aria-label': `Ajouter 1 ${item.name}`,
            onclick: () => adjustStock(item, 1).catch(reportError),
          },
          '+',
        ),
      ),
    );

  return withMeta(
    card({
      title: 'Stock',
      iconName: 'house',
      body: [
        h(
          'button',
          {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            onclick: () => openStockEditor(house.id, null, locations),
          },
          '+ Article',
        ),
        stock.length
          ? groupStock(stock).map((g) =>
              h(
                'section',
                {},
                h('h3', { class: 'section-title' }, g.location),
                h('ul', { class: 'stock-list' }, g.items.map(row)),
              ),
            )
          : h(
              'p',
              { class: 'empty' },
              "Aucun article. Ajoute ce que vous gardez à la maison (riz, huile, savon…) avec un seuil d'alerte.",
            ),
      ],
    }),
    low ? `${low} à racheter` : '',
  );
}
