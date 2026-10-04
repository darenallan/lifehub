// Maison partagée : données synchronisées (stock, menu, factures, courses) + actions en ligne
// (création, invitations, membres) via les routes dédiées de l'API.
import { api } from '../api.js';
import { dayKey } from '../lib/dates.js';
import { isLowStock, missingStockItems, restockQty, stepQty } from '../lib/house.js';
import { deterministicId } from '../lib/ids.js';
import { getEngine, getUid } from '../session.js';

const COLLECTIONS = [
  'house',
  'houseMember',
  'houseInvite',
  'stockItem',
  'menuEntry',
  'bill',
  'shoppingItem',
];

/** Données de la maison de l'utilisateur (la première s'il en a plusieurs). */
export function watchHouse(onData, onError) {
  const engine = getEngine();
  let active = true;
  const load = async () => {
    const [houses, members, invites, stock, menu, bills, shopping] = await Promise.all(
      COLLECTIONS.map((c) => engine.getAll(c)),
    );
    const house = houses.sort((a, b) => a.name.localeCompare(b.name, 'fr'))[0] ?? null;
    const own = (rows) => (house ? rows.filter((r) => r.houseId === house.id) : []);
    return {
      house,
      members: own(members),
      invites: own(invites),
      stock: own(stock),
      menu: own(menu),
      bills: own(bills),
      shopping: own(shopping),
    };
  };
  const reload = () =>
    load()
      .then((data) => active && onData(data))
      .catch(onError);
  const unsubscribers = COLLECTIONS.map((c) => engine.subscribe(c, reload));
  reload();
  return () => {
    active = false;
    unsubscribers.forEach((u) => u());
  };
}

// ---------- Actions en ligne (routes dédiées) ----------

async function online(path, options) {
  const result = await api(path, options);
  getEngine().syncNow(); // récupère tout de suite la maison / les membres modifiés
  return result;
}

export const createHouse = (name) => online('/api/houses', { method: 'POST', body: { name } });

export const renameHouse = (houseId, name) =>
  online(`/api/houses/${houseId}`, { method: 'PATCH', body: { name } });

export const inviteMember = (houseId, email) =>
  online(`/api/houses/${houseId}/invites`, { method: 'POST', body: { email } });

export const cancelInvite = (houseId, inviteId) =>
  online(`/api/houses/${houseId}/invites/${inviteId}`, { method: 'DELETE' });

/** Révocation par l'admin, ou départ volontaire (userId = soi-même). */
export const removeMember = (houseId, userId) =>
  online(`/api/houses/${houseId}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

// ---------- Stock ----------

export function saveStockItem(houseId, id, data) {
  return getEngine().patch('stockItem', id ?? crypto.randomUUID(), { houseId, ...data });
}

export function adjustStock(item, delta) {
  return getEngine().patch('stockItem', item.id, {
    houseId: item.houseId,
    qty: stepQty(item.qty, delta),
  });
}

export function deleteStockItem(id) {
  return getEngine().remove('stockItem', id);
}

// ---------- Courses ----------

export function addShoppingItem(houseId, { name, qty }) {
  return getEngine().patch('shoppingItem', crypto.randomUUID(), {
    houseId,
    name,
    qty: qty || null,
    checked: false,
    source: 'manual',
    stockId: null,
  });
}

/** Cocher un article venu du stock = acheté : le stock remonte au seuil. */
export async function setShoppingChecked(item, checked, stock) {
  const engine = getEngine();
  await engine.patch('shoppingItem', item.id, { houseId: item.houseId, checked });
  if (!checked || !item.stockId) return;
  const source = stock.find((s) => s.id === item.stockId);
  if (source && isLowStock(source)) {
    await engine.patch('stockItem', source.id, {
      houseId: source.houseId,
      qty: restockQty(source),
    });
  }
}

export function deleteShoppingItem(id) {
  return getEngine().remove('shoppingItem', id);
}

export async function clearCheckedShopping(items) {
  for (const item of items.filter((i) => i.checked)) await deleteShoppingItem(item.id);
}

let syncingStock = null;

/**
 * Ajoute à la liste de courses les articles du stock passés sous le seuil.
 * Id déterministe (maison + article) : deux appareils n'ajoutent jamais deux lignes,
 * et un article retiré revient s'il repasse sous le seuil.
 */
export function syncLowStock(houseId, stock, shopping) {
  syncingStock ??= (async () => {
    const engine = getEngine();
    for (const item of missingStockItems(stock, shopping)) {
      const id = await deterministicId(`shopping-stock:${houseId}:${item.id}`);
      await engine.patch('shoppingItem', id, {
        houseId,
        name: item.name,
        qty: null,
        checked: false,
        source: 'stock',
        stockId: item.id,
      });
    }
  })().finally(() => {
    syncingStock = null;
  });
  return syncingStock;
}

// ---------- Menu ----------

/** Une ligne par (semaine, jour, repas) : id déterministe, plat vide = case effacée. */
export async function setMenuDish(houseId, week, day, meal, dish) {
  const id = await deterministicId(`menu:${houseId}:${week}:${day}:${meal}`);
  return getEngine().patch('menuEntry', id, { houseId, week, day, meal, dish: dish || null });
}

// ---------- Factures ----------

export function saveBill(houseId, id, data) {
  return getEngine().patch('bill', id ?? crypto.randomUUID(), { houseId, ...data });
}

export function deleteBill(id) {
  return getEngine().remove('bill', id);
}

/** Payée au nom de l'utilisateur connecté (seule option permise à un coloc). */
export function setBillPaid(bill, paid) {
  return getEngine().patch('bill', bill.id, {
    houseId: bill.houseId,
    paid,
    paidOn: paid ? dayKey() : null,
    paidBy: paid ? getUid() : null,
  });
}
