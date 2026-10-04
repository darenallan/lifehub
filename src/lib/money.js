// Montants en FCFA (XOF) : toujours des entiers, jamais de flottants.

export const MAX_AMOUNT = 999_999_999;

const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 12500 → « 12 500 FCFA » */
export function formatXOF(amount) {
  if (!Number.isSafeInteger(amount)) throw new TypeError(`Montant non entier : ${amount}`);
  return `${formatter.format(amount)} FCFA`;
}

const GROUPED_WITH_DOTS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Saisie utilisateur → entier strictement positif, ou null.
 * Accepte « 12500 », « 12 500 », « 12.500 ». Refuse décimales et négatifs.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return isValidAmount(input) ? input : null;
  if (typeof input !== 'string') return null;
  let cleaned = input.replace(/[\s\u00a0\u202f]/g, '');
  if (GROUPED_WITH_DOTS.test(cleaned)) cleaned = cleaned.replaceAll('.', '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return isValidAmount(value) ? value : null;
}

export function isValidAmount(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_AMOUNT;
}
