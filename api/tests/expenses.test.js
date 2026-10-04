import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/defaults.js';
import { call, setup, sync, TOKENS } from './helpers.js';

let app;
let db;

beforeEach(async () => {
  ({ app, db } = await setup());
});
afterEach(async () => {
  await app.close();
  await db.close();
});

const patch = (collection, docId, data) => ({
  id: randomUUID(),
  collection,
  docId,
  op: 'patch',
  data,
});
const send = (...mutations) => sync(app, { cursor: '0', mutations }).then((r) => r.json());
const me = () => call(app, { url: '/api/me', token: TOKENS.admin });

const category = (data = {}) => ({
  name: 'Alimentation',
  emoji: '🍽️',
  color: 'orange',
  monthlyBudget: 100000,
  order: 0,
  active: true,
  ...data,
});
const expense = (categoryId, data = {}) => ({
  amount: 2500,
  categoryId,
  note: 'Garba',
  date: '2026-10-04',
  recurringId: null,
  ...data,
});

async function createCategory() {
  const id = randomUUID();
  await send(patch('category', id, category()));
  return id;
}

describe('catégories par défaut', () => {
  it('sont créées une seule fois, au premier /api/me', async () => {
    await me();
    await me();
    const rows = await db.query('SELECT name FROM categories ORDER BY sort_order');
    expect(rows.map((r) => r.name)).toEqual(DEFAULT_CATEGORIES.map(([name]) => name));
  });

  it('ne réapparaissent pas si on les a toutes supprimées', async () => {
    await me();
    await db.query('UPDATE categories SET deleted_at = now()');
    await me();
    expect(await db.query('SELECT 1 FROM categories WHERE deleted_at IS NULL')).toEqual([]);
  });

  it('arrivent par la sync', async () => {
    await me();
    const res = await send();
    expect(res.changes.filter((c) => c.collection === 'category')).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });
});

describe('dépenses', () => {
  it('crée une dépense en entier FCFA', async () => {
    const categoryId = await createCategory();
    const id = randomUUID();
    const res = await send(patch('expense', id, expense(categoryId)));
    expect(res.rejected).toEqual([]);
    expect(res.changes.find((c) => c.docId === id).data).toEqual(expense(categoryId));
  });

  it.each([
    [{ amount: 2500.5 }],
    [{ amount: 0 }],
    [{ amount: -100 }],
    [{ amount: 1000000000 }],
    [{ amount: '2500' }],
    [{ date: '2026-10-4' }],
    [{ note: 'x'.repeat(201) }],
  ])('refuse %j', async (override) => {
    const categoryId = await createCategory();
    const m = patch('expense', randomUUID(), expense(categoryId, override));
    expect((await send(m)).rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
  });

  it("refuse une catégorie inexistante ou appartenant à quelqu'un d'autre", async () => {
    const foreign = randomUUID();
    await db.query("INSERT INTO categories (id, user_id, name) VALUES ($1, 'someone-else', 'X')", [
      foreign,
    ]);
    const m1 = patch('expense', randomUUID(), expense(foreign));
    const m2 = patch('expense', randomUUID(), expense(randomUUID()));
    const res = await send(m1, m2);
    expect(res.rejected.map((r) => r.reason)).toEqual(['invalid', 'invalid']);
  });

  it('modifie puis supprime (logiquement)', async () => {
    const categoryId = await createCategory();
    const id = randomUUID();
    await send(patch('expense', id, expense(categoryId)));
    await send(patch('expense', id, { amount: 3000 }));
    await send({ id: randomUUID(), collection: 'expense', docId: id, op: 'delete' });
    const [row] = await db.query('SELECT amount, deleted_at IS NOT NULL AS deleted FROM expenses');
    expect(row).toEqual({ amount: 3000, deleted: true });
  });

  it('budget de catégorie : entier positif ou nul, couleur de la palette', async () => {
    const m = patch('category', randomUUID(), category({ monthlyBudget: -1 }));
    const c = patch('category', randomUUID(), category({ color: 'fuchsia' }));
    expect((await send(m, c)).rejected.map((r) => r.reason)).toEqual(['invalid', 'invalid']);
  });
});

describe('dépenses récurrentes', () => {
  const recurring = (categoryId, data = {}) => ({
    amount: 15000,
    categoryId,
    note: 'Internet',
    dayOfMonth: 5,
    startMonth: '2026-10',
    lastMonth: null,
    active: true,
    ...data,
  });

  it('modèle valide, puis occurrence liée', async () => {
    const categoryId = await createCategory();
    const recurringId = randomUUID();
    const occurrence = randomUUID();
    const res = await send(
      patch('recurringExpense', recurringId, recurring(categoryId)),
      patch('expense', occurrence, expense(categoryId, { recurringId, date: '2026-10-05' })),
      patch('recurringExpense', recurringId, { lastMonth: '2026-10' }),
    );
    expect(res.rejected).toEqual([]);
  });

  it.each([
    [{ dayOfMonth: 0 }],
    [{ dayOfMonth: 32 }],
    [{ startMonth: '2026-13' }],
    [{ amount: 0 }],
  ])('refuse %j', async (override) => {
    const categoryId = await createCategory();
    const m = patch('recurringExpense', randomUUID(), recurring(categoryId, override));
    expect((await send(m)).rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
  });
});
