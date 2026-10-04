import { describe, expect, it } from 'vitest';
import { formatXOF, MAX_AMOUNT, parseAmount } from '../../src/lib/money.js';

// fr-FR groupe avec une espace fine insécable (U+202F).
const normalize = (s) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('formatXOF', () => {
  it('formate en entiers groupés', () => {
    expect(normalize(formatXOF(12500))).toBe('12 500 FCFA');
    expect(normalize(formatXOF(0))).toBe('0 FCFA');
    expect(normalize(formatXOF(1000000))).toBe('1 000 000 FCFA');
  });

  it('refuse les flottants', () => {
    expect(() => formatXOF(12.5)).toThrow(TypeError);
    expect(() => formatXOF(NaN)).toThrow(TypeError);
  });
});

describe('parseAmount', () => {
  it.each([
    ['12500', 12500],
    ['12 500', 12500],
    ['12\u202f500', 12500],
    ['12.500', 12500],
    ['1.000.000', 1000000],
    [' 300 ', 300],
    [750, 750],
  ])('%j → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    '',
    '0',
    '-500',
    '12,5',
    '12.5',
    '1.00',
    'abc',
    '1e3',
    String(MAX_AMOUNT + 1),
    12.5,
    null,
  ])('refuse %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
