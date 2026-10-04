import { reportError, showToast } from '../../components/toast.js';
import { h, mount } from '../../lib/dom.js';
import { ROLE } from '../../lib/roles.js';
import { createHouse, syncLowStock, watchHouse } from '../../repos/house.js';
import { card } from '../common.js';
import { billsPanel } from './bills.js';
import { apiErrorMessage } from './common.js';
import { membersPanel } from './members.js';
import { menuPanel } from './menu.js';
import { shoppingPanel } from './shopping.js';
import { stockPanel } from './stock.js';

const TABS = [
  ['shopping', 'Courses', shoppingPanel],
  ['stock', 'Stock', stockPanel],
  ['menu', 'Menu', menuPanel],
  ['bills', 'Factures', billsPanel],
  ['members', 'Membres', membersPanel],
];

function noHouse({ isAdmin }) {
  if (!isAdmin) {
    return card({
      title: 'Maison',
      body: h('p', { class: 'empty' }, 'Synchronisation de la maison en cours…'),
    });
  }
  const name = h('input', {
    class: 'input',
    maxlength: 60,
    required: true,
    placeholder: 'Ex. Coloc Cocody',
    'aria-label': 'Nom de la maison',
  });
  return card({
    title: 'Créer la maison',
    body: [
      h(
        'p',
        { class: 'muted' },
        'Stock, menu, factures et courses partagés avec tes colocs. Tu restes le seul à gérer les membres et les factures.',
      ),
      h(
        'form',
        {
          class: 'row',
          onsubmit: (e) => {
            e.preventDefault();
            const value = name.value.trim();
            if (!value) return;
            createHouse(value)
              .then(() => showToast('Maison créée.'))
              .catch((err) => showToast(apiErrorMessage(err), { tone: 'danger' }));
          },
        },
        name,
        h('button', { class: 'btn btn--primary', type: 'submit' }, 'Créer'),
      ),
    ],
  });
}

export function renderHouse(outlet, { params, role, user }) {
  const [tab, , panelFn] = TABS.find(([key]) => key === params[0]) ?? TABS[0];
  const ctx = { role, uid: user.uid, isAdmin: role === ROLE.ADMIN, params: params.slice(1) };

  const title = h('h1', { class: 'page-title' }, 'Maison');
  const tabs = h(
    'nav',
    { class: 'tabs tabs--scroll', 'aria-label': 'Sections de la maison' },
    TABS.map(([key, label]) =>
      h(
        'a',
        { class: 'tabs__tab', href: `#/house/${key}`, 'aria-current': key === tab ? 'page' : null },
        label,
      ),
    ),
  );
  const panel = h('div');

  mount(
    outlet,
    h('header', { class: 'page-header' }, h('p', { class: 'eyebrow' }, 'Maison partagée'), title),
    h('div', { class: 'stack' }, tabs, panel),
  );

  let data = null;
  let renderLater = false;

  function render() {
    if (!data) return;
    // Pas de reconstruction pendant une saisie (menu, formulaires) : on attend la sortie du champ.
    const focused = document.activeElement;
    if (panel.contains(focused) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) {
      renderLater = true;
      return;
    }
    renderLater = false;
    tabs.hidden = !data.house;
    title.textContent = data.house?.name ?? 'Maison';
    mount(panel, data.house ? panelFn({ ...ctx, ...data }) : noHouse(ctx));
  }
  panel.addEventListener('focusout', () => setTimeout(() => renderLater && render(), 0));

  return watchHouse((next) => {
    data = next;
    render();
    if (next.house) syncLowStock(next.house.id, next.stock, next.shopping).catch(reportError);
  }, reportError);
}
