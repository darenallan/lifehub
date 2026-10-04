import { describe, expect, it } from 'vitest';
import { BACKUP_COLLECTIONS, buildBackup, parseBackup } from '../../src/lib/backup.js';
import { balancesByPerson, debtTotals, knownPeople } from '../../src/lib/debts.js';

const debt = (person, direction, amount, settled = false) => ({
  person,
  direction,
  amount,
  settled,
});

describe('dettes et prêts', () => {
  const debts = [
    debt('Koffi', 'lent', 15000),
    debt('koffi ', 'borrowed', 5000),
    debt('Awa', 'borrowed', 3000),
    debt('Awa', 'lent', 3000),
    debt('Yao', 'lent', 2000, true),
  ];

  it('totaux des dettes non réglées', () => {
    expect(debtTotals(debts)).toEqual({ owedToMe: 18000, iOwe: 8000, net: 10000 });
  });

  it('solde par personne, casse ignorée, soldes nuls masqués', () => {
    expect(balancesByPerson(debts)).toEqual([
      { person: 'Koffi', lent: 15000, borrowed: 5000, net: 10000 },
    ]);
  });

  it('noms connus sans doublons', () => {
    expect(knownPeople(debts)).toEqual(['Awa', 'koffi', 'Yao']);
  });
});

describe('export / import', () => {
  const uuid = '8b0f3c1e-2a4d-4c6e-9f10-112233445566';

  it('aller-retour', () => {
    const backup = buildBackup(
      {
        profile: [{ id: 'me', displayName: 'Daren', theme: 'dark' }],
        expense: [{ id: uuid, amount: 2500, categoryId: uuid, date: '2026-10-04' }],
      },
      new Date('2026-10-04T10:00:00Z'),
    );
    expect(Object.keys(backup.collections)).toEqual(BACKUP_COLLECTIONS);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.counts).toEqual({ profile: 1, expense: 1 });
    expect(parsed.docs[0]).toEqual({
      collection: 'profile',
      id: 'me',
      data: { displayName: 'Daren', theme: 'dark' },
    });
  });

  it("respecte l'ordre des dépendances (catégories avant dépenses)", () => {
    const file = {
      app: 'lifehub',
      version: 1,
      collections: {
        expense: [{ id: uuid, amount: 1 }],
        category: [{ id: uuid, name: 'X' }],
      },
    };
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.docs.map((d) => d.collection)).toEqual(['category', 'expense']);
  });

  it.each([
    ['pas du json', /JSON valide/],
    [JSON.stringify({ app: 'autre' }), /export LifeHub/],
    [JSON.stringify({ app: 'lifehub', version: 2, collections: {} }), /Version/],
    [JSON.stringify({ app: 'lifehub', version: 1 }), /collections manquantes/],
    [JSON.stringify({ app: 'lifehub', version: 1, collections: { houses: [] } }), /inconnues/],
    [JSON.stringify({ app: 'lifehub', version: 1, collections: { task: {} } }), /liste/],
    [
      JSON.stringify({ app: 'lifehub', version: 1, collections: { task: [{ id: '1' }] } }),
      /invalide/,
    ],
    [
      JSON.stringify({ app: 'lifehub', version: 1, collections: { profile: [{ id: 'x' }] } }),
      /invalide/,
    ],
  ])('refuse %s', (text, message) => {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(message);
  });
});
