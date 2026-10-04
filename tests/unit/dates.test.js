import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  daysInMonth,
  isoWeekKey,
  monthKey,
  parseDayKey,
} from '../../src/lib/dates.js';

describe('dayKey / monthKey', () => {
  it('formate en heure locale avec zéros', () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(dayKey(d)).toBe('2026-01-05');
    expect(monthKey(d)).toBe('2026-01');
  });
});

describe('isoWeekKey', () => {
  it.each([
    [new Date(2026, 9, 4), '2026-W40'], // dimanche 4 oct. 2026
    [new Date(2026, 9, 5), '2026-W41'], // lundi
    [new Date(2021, 0, 3), '2020-W53'], // dimanche rattaché à 2020
    [new Date(2024, 11, 30), '2025-W01'], // lundi rattaché à 2025
    [new Date(2026, 0, 1), '2026-W01'],
  ])('%s → %s', (date, expected) => {
    expect(isoWeekKey(date)).toBe(expected);
  });
});

describe('parseDayKey', () => {
  it('parse une clé valide', () => {
    expect(dayKey(parseDayKey('2026-02-28'))).toBe('2026-02-28');
  });

  it.each(['2026-02-30', '2026-13-01', '26-01-01', '', null, '2026-1-1'])('refuse %s', (key) => {
    expect(parseDayKey(key)).toBeNull();
  });
});

describe('daysInMonth', () => {
  it('gère les années bissextiles', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-10')).toBe(31);
  });

  it('rejette un mois invalide', () => {
    expect(() => daysInMonth('2026-1')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('traverse les fins de mois sans muter', () => {
    const d = new Date(2026, 9, 31);
    expect(dayKey(addDays(d, 1))).toBe('2026-11-01');
    expect(dayKey(d)).toBe('2026-10-31');
  });
});
