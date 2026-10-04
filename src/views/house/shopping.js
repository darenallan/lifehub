import { reportError } from '../../components/toast.js';
import { h } from '../../lib/dom.js';
import { sortShopping } from '../../lib/house.js';
import {
  addShoppingItem,
  clearCheckedShopping,
  deleteShoppingItem,
  setShoppingChecked,
} from '../../repos/house.js';
import { card } from '../common.js';
import { withMeta } from './common.js';

export function shoppingPanel({ house, shopping, stock }) {
  const name = h('input', {
    class: 'input',
    maxlength: 60,
    required: true,
    placeholder: 'Article',
    'aria-label': 'Article à acheter',
  });
  const qty = h('input', {
    class: 'input input--qty',
    maxlength: 20,
    placeholder: 'Qté',
    'aria-label': 'Quantité (facultatif)',
  });
  const form = h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const value = name.value.trim();
        if (!value) return;
        addShoppingItem(house.id, { name: value, qty: qty.value.trim() }).catch(reportError);
        e.target.reset();
        name.focus();
      },
    },
    name,
    qty,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
  );

  const items = sortShopping(shopping);
  const checked = items.filter((i) => i.checked).length;

  const list = items.length
    ? h(
        'ul',
        { class: 'shop-list' },
        items.map((item) =>
          h(
            'li',
            { class: `shop-item${item.checked ? ' is-done' : ''}` },
            h('button', {
              class: 'check',
              type: 'button',
              'aria-pressed': String(item.checked),
              'aria-label': `${item.checked ? 'Remettre' : 'Cocher'} « ${item.name} »`,
              onclick: () => setShoppingChecked(item, !item.checked, stock).catch(reportError),
            }),
            h(
              'span',
              { class: 'shop-item__name' },
              item.name,
              item.qty ? h('span', { class: 'muted' }, ` · ${item.qty}`) : null,
            ),
            item.source === 'stock'
              ? h(
                  'span',
                  { class: 'badge badge--text', title: 'Ajouté car le stock est sous le seuil' },
                  'stock bas',
                )
              : null,
            h(
              'button',
              {
                class: 'icon-btn icon-btn--sm icon-btn--quiet',
                type: 'button',
                'aria-label': `Retirer « ${item.name} »`,
                onclick: () => deleteShoppingItem(item.id).catch(reportError),
              },
              '×',
            ),
          ),
        ),
      )
    : h(
        'p',
        { class: 'empty' },
        "Liste vide. Les articles du stock sous le seuil s'ajoutent tout seuls.",
      );

  return withMeta(
    card({
      title: 'Liste de courses',
      iconName: 'house',
      body: [
        form,
        list,
        checked
          ? h(
              'button',
              {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                onclick: () => clearCheckedShopping(items).catch(reportError),
              },
              `Retirer les articles cochés (${checked})`,
            )
          : null,
      ],
    }),
    items.length ? `${items.length - checked} à acheter` : '',
  );
}
