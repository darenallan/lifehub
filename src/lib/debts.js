// Dettes et prêts : soldes en entiers FCFA. lent = on me doit ; borrowed = je dois.

const personKey = (name) => name.trim().toLocaleLowerCase('fr');

export const openDebts = (debts) => debts.filter((d) => !d.settled);

/** Totaux des dettes non réglées. */
export function debtTotals(debts) {
  let owedToMe = 0;
  let iOwe = 0;
  for (const d of openDebts(debts)) {
    if (d.direction === 'lent') owedToMe += d.amount;
    else iOwe += d.amount;
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe };
}

/**
 * Solde par personne (non réglé) : net > 0 → elle me doit, net < 0 → je lui dois.
 * Les noms sont regroupés sans tenir compte de la casse ni des espaces autour.
 */
export function balancesByPerson(debts) {
  const people = new Map();
  for (const d of openDebts(debts)) {
    const key = personKey(d.person);
    if (!people.has(key)) people.set(key, { person: d.person.trim(), lent: 0, borrowed: 0 });
    people.get(key)[d.direction] += d.amount;
  }
  return [...people.values()]
    .map((p) => ({ ...p, net: p.lent - p.borrowed }))
    .filter((p) => p.net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.person.localeCompare(b.person, 'fr'));
}

/** Noms déjà utilisés (pour l'autocomplétion), sans doublons de casse. */
export function knownPeople(debts) {
  const seen = new Map();
  for (const d of debts) seen.set(personKey(d.person), d.person.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}
