// Logique de la maison (stock, menu, factures, courses) : fonctions pures, testées avec Vitest.
import { addDays, dayKey, isoWeekKey } from './dates.js';

export const DAYS = [
  ['mon', 'Lundi'],
  ['tue', 'Mardi'],
  ['wed', 'Mercredi'],
  ['thu', 'Jeudi'],
  ['fri', 'Vendredi'],
  ['sat', 'Samedi'],
  ['sun', 'Dimanche'],
];

export const MEALS = [
  ['lunch', 'Midi'],
  ['dinner', 'Soir'],
];

const WEEK_KEY = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/;

export const isWeekKey = (key) => WEEK_KEY.test(key ?? '');

/** Lundi (date locale) de la semaine ISO 'YYYY-Www'. */
export function weekMonday(weekKey) {
  const m = WEEK_KEY.exec(weekKey ?? '');
  if (!m) throw new RangeError(`Semaine invalide : ${weekKey}`);
  const jan4 = new Date(Number(m[1]), 0, 4); // le 4 janvier est toujours en semaine 1
  const offset = (jan4.getDay() || 7) - 1;
  return addDays(jan4, -offset + (Number(m[2]) - 1) * 7);
}

/** Les 7 jours de la semaine : [{ key: 'mon', label: 'Lundi', date: 'YYYY-MM-DD' }]. */
export function weekDays(weekKey) {
  const monday = weekMonday(weekKey);
  return DAYS.map(([key, label], i) => ({ key, label, date: dayKey(addDays(monday, i)) }));
}

export function shiftWeek(weekKey, delta) {
  return isoWeekKey(addDays(weekMonday(weekKey), delta * 7));
}

// ---------- Stock ----------

/** Sous le seuil = à racheter (seuil absent = pas de suivi). */
export function isLowStock(item) {
  return item.minQty != null && item.qty < item.minQty;
}

/** Après achat : on remonte au moins au seuil. */
export function restockQty(item) {
  return Math.max(item.qty, item.minQty ?? item.qty);
}

/** +1 / −1 sans passer sous 0, arrondi au centième (évite 0.30000000000000004). */
export function stepQty(qty, delta) {
  return Math.max(0, Math.round((qty + delta) * 100) / 100);
}

const qtyFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function formatQty(qty, unit) {
  return unit ? `${qtyFormat.format(qty)} ${unit}` : qtyFormat.format(qty);
}

/** Saisie « 1,5 » ou « 1.5 » → nombre ≥ 0, ou null. */
export function parseQty(input) {
  const raw = String(input ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return value < 1000000 ? value : null;
}

const NO_LOCATION = 'Sans emplacement';

/** Stock groupé par emplacement (alphabétique, « Sans emplacement » en dernier). */
export function groupStock(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.location?.trim() || NO_LOCATION;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b, 'fr')))
    .map(([location, list]) => ({
      location,
      items: list.sort((x, y) => x.name.localeCompare(y.name, 'fr')),
    }));
}

// ---------- Courses ----------

/** À acheter d'abord, puis cochés ; alphabétique dans chaque groupe. */
export function sortShopping(items) {
  return [...items].sort(
    (a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name, 'fr'),
  );
}

/** Articles de stock sous le seuil qui n'ont pas encore de ligne de courses active. */
export function missingStockItems(stock, shopping) {
  const listed = new Set(shopping.filter((s) => s.stockId).map((s) => s.stockId));
  return stock.filter((item) => isLowStock(item) && !listed.has(item.id));
}

// ---------- Factures ----------

const toUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Jours entre aujourd'hui et l'échéance (négatif = en retard). */
export function daysUntil(due, today) {
  return Math.round((toUtc(due) - toUtc(today)) / 86_400_000);
}

/** paid | overdue | soon (≤ 7 jours) | later */
export function billState(bill, today) {
  if (bill.paid) return 'paid';
  const days = daysUntil(bill.dueDate, today);
  if (days < 0) return 'overdue';
  return days <= 7 ? 'soon' : 'later';
}

export function billDueLabel(bill, today) {
  const days = daysUntil(bill.dueDate, today);
  if (days < 0) return `En retard de ${-days} j`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `Dans ${days} j`;
}

/** Factures non payées en retard ou dues sous `within` jours, de la plus urgente à la moins. */
export function billsDueSoon(bills, today, within = 7) {
  return bills
    .filter((b) => !b.paid && daysUntil(b.dueDate, today) <= within)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Non payées par échéance, puis payées (plus récentes d'abord). */
export function sortBills(bills) {
  const unpaid = bills.filter((b) => !b.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = bills.filter((b) => b.paid).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return { unpaid, paid };
}
