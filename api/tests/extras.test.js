import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter.js';
import { setup, sync, TOKENS } from './helpers.js';

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
const send = (token, ...mutations) =>
  sync(app, { cursor: '0', mutations }, token).then((r) => r.json());

const debt = (data = {}) => ({
  person: 'Koffi',
  direction: 'lent',
  amount: 15000,
  note: 'Taxi aéroport',
  date: '2026-10-04',
  settled: false,
  settledOn: null,
  ...data,
});
const note = (data = {}) => ({
  text: 'Code wifi : 1234',
  pinned: false,
  createdAt: '2026-10-04T09:30',
  ...data,
});

describe('dettes et prêts', () => {
  it('crée, règle, puis rouvre', async () => {
    const id = randomUUID();
    expect((await send(TOKENS.admin, patch('debt', id, debt()))).rejected).toEqual([]);
    await send(TOKENS.admin, patch('debt', id, { settled: true, settledOn: '2026-10-10' }));
    await send(TOKENS.admin, patch('debt', id, { settled: false, settledOn: null }));
    const [row] = await db.query('SELECT settled, settled_on FROM debts');
    expect(row).toEqual({ settled: false, settled_on: null });
  });

  it.each([
    [{ amount: 0 }],
    [{ amount: 12.5 }],
    [{ direction: 'gift' }],
    [{ person: '' }],
    [{ settled: false, settledOn: '2026-10-10' }],
  ])('refuse %j', async (override) => {
    const m = patch('debt', randomUUID(), debt(override));
    expect((await send(TOKENS.admin, m)).rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('notes rapides', () => {
  it('crée et épingle', async () => {
    const id = randomUUID();
    await send(TOKENS.admin, patch('quickNote', id, note()));
    const res = await send(TOKENS.admin, patch('quickNote', id, { pinned: true }));
    expect(res.changes.find((c) => c.docId === id).data).toEqual(note({ pinned: true }));
  });

  it.each([[{ text: '' }], [{ text: 'x'.repeat(2001) }], [{ createdAt: 'hier' }]])(
    'refuse %j',
    async (override) => {
      const m = patch('quickNote', randomUUID(), note(override));
      expect((await send(TOKENS.admin, m)).rejected).toMatchObject([{ reason: 'invalid' }]);
    },
  );
});

describe('limite par utilisateur', () => {
  it('fenêtre fixe par clé', () => {
    let t = 0;
    const allow = createLimiter({ max: 2, windowMs: 1000, now: () => t });
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    t = 1000;
    expect(allow('a')).toBe(true);
  });

  it('la sync renvoie 429 au-delà de la limite', async () => {
    const statuses = [];
    for (let i = 0; i < 65; i++) {
      const res = await sync(app, { cursor: '0', mutations: [] });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
