import { describe, expect, it } from 'vitest';
import {
  billDueLabel,
  billState,
  billsDueSoon,
  daysUntil,
  formatQty,
  groupStock,
  isLowStock,
  isWeekKey,
  missingStockItems,
  parseQty,
  restockQty,
  shiftWeek,
  sortBills,
  sortShopping,
  stepQty,
  weekDays,
} from '../../src/lib/house.js';

const TODAY = '2026-10-04';

describe('semaines ISO', () => {
  it('jours de la semaine, du lundi au dimanche', () => {
    const days = weekDays('2026-W40');
    expect(days[0]).toEqual({ key: 'mon', label: 'Lundi', date: '2026-09-28' });
    expect(days[6].date).toBe('2026-10-04');
  });

  it("semaine 1 à cheval sur l'année", () => {
    expect(weekDays('2025-W01')[0].date).toBe('2024-12-30');
    expect(weekDays('2026-W53')[0].date).toBe('2026-12-28');
  });

  it('navigation', () => {
    expect(shiftWeek('2026-W40', 1)).toBe('2026-W41');
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
  });

  it.each([
    ['2026-W40', true],
    ['2026-W54', false],
    ['2026-40', false],
  ])('isWeekKey(%s)', (k, ok) => expect(isWeekKey(k)).toBe(ok));
});

describe('stock', () => {
  it('sous le seuil, strictement', () => {
    expect(isLowStock({ qty: 0, minQty: 1 })).toBe(true);
    expect(isLowStock({ qty: 1, minQty: 1 })).toBe(false);
    expect(isLowStock({ qty: 0, minQty: null })).toBe(false);
  });

  it('réapprovisionnement et pas de quantité', () => {
    expect(restockQty({ qty: 0.5, minQty: 2 })).toBe(2);
    expect(restockQty({ qty: 5, minQty: 2 })).toBe(5);
    expect(stepQty(0.1, 0.2)).toBe(0.3);
    expect(stepQty(0.5, -1)).toBe(0);
  });

  it.each([
    ['1,5', 1.5],
    ['2', 2],
    ['0', 0],
    ['1.255', null],
    ['-1', null],
    ['abc', null],
  ])('parseQty(%j) → %j', (input, expected) => expect(parseQty(input)).toBe(expected));

  it('formatage', () => {
    expect(formatQty(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQty(3)).toBe('3');
  });

  it('groupé par emplacement, sans emplacement en dernier', () => {
    const groups = groupStock([
      { name: 'Sel', location: '' },
      { name: 'Riz', location: 'Placard' },
      { name: 'Lait', location: 'Frigo' },
      { name: 'Huile', location: 'Placard' },
    ]);
    expect(groups.map((g) => g.location)).toEqual(['Frigo', 'Placard', 'Sans emplacement']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['Huile', 'Riz']);
  });
});

describe('courses', () => {
  it('à acheter en premier', () => {
    const sorted = sortShopping([
      { name: 'B', checked: true },
      { name: 'C', checked: false },
      { name: 'A', checked: false },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(['A', 'C', 'B']);
  });

  it('stock bas pas encore sur la liste', () => {
    const stock = [
      { id: 's1', qty: 0, minQty: 1 },
      { id: 's2', qty: 0, minQty: 2 },
      { id: 's3', qty: 5, minQty: 1 },
    ];
    const shopping = [{ stockId: 's1', checked: false }];
    expect(missingStockItems(stock, shopping).map((s) => s.id)).toEqual(['s2']);
  });
});

describe('factures', () => {
  const bill = (dueDate, paid = false) => ({ dueDate, paid });

  it('états et libellés', () => {
    expect(daysUntil('2026-10-11', TODAY)).toBe(7);
    expect(billState(bill('2026-10-01'), TODAY)).toBe('overdue');
    expect(billState(bill('2026-10-11'), TODAY)).toBe('soon');
    expect(billState(bill('2026-10-12'), TODAY)).toBe('later');
    expect(billState(bill('2026-10-01', true), TODAY)).toBe('paid');
    expect(billDueLabel(bill('2026-10-01'), TODAY)).toBe('En retard de 3 j');
    expect(billDueLabel(bill(TODAY), TODAY)).toBe("Aujourd'hui");
    expect(billDueLabel(bill('2026-10-05'), TODAY)).toBe('Demain');
    expect(billDueLabel(bill('2026-10-20'), TODAY)).toBe('Dans 16 j');
  });

  it('factures proches : non payées, en retard ou sous 7 jours, triées', () => {
    const bills = [
      bill('2026-10-10'),
      bill('2026-09-30'),
      bill('2026-10-20'),
      bill('2026-10-05', true),
    ];
    expect(billsDueSoon(bills, TODAY).map((b) => b.dueDate)).toEqual(['2026-09-30', '2026-10-10']);
  });

  it('tri non payées / payées', () => {
    const { unpaid, paid } = sortBills([
      bill('2026-10-10'),
      bill('2026-10-01', true),
      bill('2026-10-05'),
      bill('2026-09-01', true),
    ]);
    expect(unpaid.map((b) => b.dueDate)).toEqual(['2026-10-05', '2026-10-10']);
    expect(paid.map((b) => b.dueDate)).toEqual(['2026-10-01', '2026-09-01']);
  });
});
