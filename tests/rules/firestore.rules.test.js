import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const ADMIN = { uid: 'admin-uid', email: 'tienddaren4@gmail.com', email_verified: true };
const ADMIN_UNVERIFIED = { ...ADMIN, email_verified: false };
const COLOC = { uid: 'coloc-uid', email: 'coloc@example.com', email_verified: true };
const STRANGER = { uid: 'stranger-uid', email: 'stranger@example.com', email_verified: true };
const HOUSE = 'house1';

let env;

function db(user) {
  if (!user) return env.unauthenticatedContext().firestore();
  const { uid, ...token } = user;
  return env.authenticatedContext(uid, token).firestore();
}

function seed(path, data) {
  return env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
}

const now = () => Timestamp.now();
const validExpense = () => ({
  amount: 2500,
  categoryId: 'food',
  note: 'Garba',
  date: '2026-10-04',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
const validBill = () => ({
  label: 'CIE électricité',
  amount: 18000,
  dueDate: '2026-10-15',
  recurrence: 'monthly',
  paid: false,
  paidAt: null,
  paidBy: null,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lifehub',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

describe('espace perso', () => {
  const profile = `users/${ADMIN.uid}/settings/profile`;

  it("refuse l'anonyme", async () => {
    await assertFails(getDoc(doc(db(null), profile)));
  });

  it("autorise l'admin sur ses propres données", async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), profile), { displayName: 'Daren', currency: 'XOF', theme: 'dark' }),
    );
    await assertSucceeds(getDoc(doc(db(ADMIN), profile)));
  });

  it('refuse un e-mail admin non vérifié', async () => {
    await assertFails(getDoc(doc(db(ADMIN_UNVERIFIED), profile)));
  });

  it('refuse un compte inconnu, même sur son propre uid', async () => {
    await assertFails(getDoc(doc(db(STRANGER), profile)));
    await assertFails(
      setDoc(doc(db(STRANGER), `users/${STRANGER.uid}/settings/profile`), { theme: 'dark' }),
    );
  });

  it("refuse à l'admin l'espace d'un autre uid", async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), `users/${STRANGER.uid}/settings/profile`), { theme: 'dark' }),
    );
  });

  it('valide le profil', async () => {
    await assertFails(setDoc(doc(db(ADMIN), profile), { currency: 'EUR' }));
    await assertFails(setDoc(doc(db(ADMIN), profile), { theme: 'dark', role: 'admin' }));
    await assertFails(
      setDoc(doc(db(ADMIN), `users/${ADMIN.uid}/settings/other`), { theme: 'dark' }),
    );
  });

  it('valide les dépenses (entiers FCFA, schéma strict)', async () => {
    const ref = (id) => doc(db(ADMIN), `users/${ADMIN.uid}/expenses/${id}`);
    await assertSucceeds(setDoc(ref('ok'), validExpense()));
    await assertFails(setDoc(ref('float'), { ...validExpense(), amount: 2500.5 }));
    await assertFails(setDoc(ref('zero'), { ...validExpense(), amount: 0 }));
    await assertFails(setDoc(ref('neg'), { ...validExpense(), amount: -10 }));
    await assertFails(setDoc(ref('huge'), { ...validExpense(), amount: 1000000000 }));
    await assertFails(setDoc(ref('str'), { ...validExpense(), amount: '2500' }));
    await assertFails(setDoc(ref('date'), { ...validExpense(), date: '04/10/2026' }));
    await assertFails(setDoc(ref('extra'), { ...validExpense(), hacked: true }));
    await assertFails(setDoc(ref('note'), { ...validExpense(), note: 'x'.repeat(201) }));
  });

  it('borne les objectifs du jour à 5', async () => {
    const ref = doc(db(ADMIN), `users/${ADMIN.uid}/dailyGoals/2026-10-04`);
    const items = (n) => Array.from({ length: n }, (_, i) => ({ text: `but ${i}`, done: false }));
    await assertSucceeds(setDoc(ref, { items: items(5) }));
    await assertFails(setDoc(ref, { items: items(6) }));
    await assertFails(
      setDoc(doc(db(ADMIN), `users/${ADMIN.uid}/dailyGoals/demain`), { items: [] }),
    );
  });

  it('valide les tâches', async () => {
    const ref = doc(db(ADMIN), `users/${ADMIN.uid}/tasks/t1`);
    const task = {
      title: 'Payer le loyer',
      done: false,
      priority: 1,
      dueDate: '2026-10-05',
      recurrence: 'monthly',
      createdAt: serverTimestamp(),
      doneAt: null,
    };
    await assertSucceeds(setDoc(ref, task));
    await assertFails(setDoc(ref, { ...task, priority: 4 }));
    await assertFails(setDoc(ref, { ...task, recurrence: 'hourly' }));
  });
});

describe('maison', () => {
  const house = { name: 'Coloc Cocody', adminUid: ADMIN.uid, createdAt: now() };

  async function seedHouseWithColoc() {
    await seed(`houses/${HOUSE}`, house);
    await seed(`houses/${HOUSE}/members/${ADMIN.uid}`, {
      role: 'admin',
      email: ADMIN.email,
      joinedAt: now(),
    });
    await seed(`houses/${HOUSE}/members/${COLOC.uid}`, {
      role: 'member',
      email: COLOC.email,
      joinedAt: now(),
    });
  }

  it("seul l'admin crée une maison, à son nom", async () => {
    const data = { ...house, createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(db(STRANGER), 'houses/h2'), { ...data, adminUid: STRANGER.uid }));
    await assertFails(setDoc(doc(db(ADMIN), 'houses/h3'), { ...data, adminUid: 'someone-else' }));
    await assertSucceeds(setDoc(doc(db(ADMIN), `houses/${HOUSE}`), data));
    // Deuxième écriture : son propre doc membre.
    await assertSucceeds(
      setDoc(doc(db(ADMIN), `houses/${HOUSE}/members/${ADMIN.uid}`), {
        role: 'admin',
        email: ADMIN.email,
        joinedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(db(ADMIN), `houses/${HOUSE}`)));
  });

  it("flux d'invitation complet", async () => {
    await seed(`houses/${HOUSE}`, house);
    await assertSucceeds(
      setDoc(doc(db(ADMIN), `invites/${COLOC.email}`), {
        houseId: HOUSE,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(db(STRANGER), `invites/${COLOC.email}`)));
    await assertSucceeds(getDoc(doc(db(COLOC), `invites/${COLOC.email}`)));

    const memberRef = doc(db(COLOC), `houses/${HOUSE}/members/${COLOC.uid}`);
    const member = {
      role: 'member',
      email: COLOC.email,
      displayName: 'Coloc',
      joinedAt: serverTimestamp(),
    };
    await assertFails(setDoc(memberRef, { ...member, role: 'admin' }));
    await assertFails(setDoc(memberRef, { ...member, email: 'autre@example.com' }));
    await assertSucceeds(setDoc(memberRef, member));
    await assertSucceeds(deleteDoc(doc(db(COLOC), `invites/${COLOC.email}`)));
    await assertSucceeds(getDoc(doc(db(COLOC), `houses/${HOUSE}`)));
  });

  it("refuse l'adhésion sans invitation", async () => {
    await seed(`houses/${HOUSE}`, house);
    await assertFails(
      setDoc(doc(db(STRANGER), `houses/${HOUSE}/members/${STRANGER.uid}`), {
        role: 'member',
        email: STRANGER.email,
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it("refuse une invitation dont l'id n'est pas en minuscules", async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'invites/Coloc@Example.com'), {
        houseId: HOUSE,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('droits du coloc : stock oui, factures en lecture + « payé » seulement', async () => {
    await seedHouseWithColoc();
    await seed(`houses/${HOUSE}/bills/b1`, validBill());
    const c = db(COLOC);

    await assertSucceeds(
      setDoc(doc(c, `houses/${HOUSE}/stock/riz`), {
        name: 'Riz',
        qty: 2,
        unit: 'kg',
        minQty: 1,
        location: 'Placard',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(c, `houses/${HOUSE}/bills/b1`)));
    await assertFails(setDoc(doc(c, `houses/${HOUSE}/bills/b2`), validBill()));
    await assertFails(updateDoc(doc(c, `houses/${HOUSE}/bills/b1`), { amount: 1 }));
    await assertFails(
      updateDoc(doc(c, `houses/${HOUSE}/bills/b1`), { paid: true, paidBy: ADMIN.uid }),
    );
    await assertSucceeds(
      updateDoc(doc(c, `houses/${HOUSE}/bills/b1`), {
        paid: true,
        paidAt: serverTimestamp(),
        paidBy: COLOC.uid,
      }),
    );
    await assertFails(deleteDoc(doc(c, `houses/${HOUSE}/bills/b1`)));
    await assertFails(
      setDoc(doc(c, `houses/${HOUSE}/members/${STRANGER.uid}`), {
        role: 'member',
        email: STRANGER.email,
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it("le coloc n'a aucun accès aux données perso", async () => {
    await seedHouseWithColoc();
    await seed(`users/${ADMIN.uid}/expenses/e1`, {
      ...validExpense(),
      createdAt: now(),
      updatedAt: now(),
    });
    await assertFails(getDoc(doc(db(COLOC), `users/${ADMIN.uid}/expenses/e1`)));
  });

  it('un inconnu ne voit rien de la maison', async () => {
    await seedHouseWithColoc();
    await assertFails(getDoc(doc(db(STRANGER), `houses/${HOUSE}`)));
    await assertFails(getDoc(doc(db(STRANGER), `houses/${HOUSE}/stock/riz`)));
  });

  it("la révocation coupe l'accès immédiatement", async () => {
    await seedHouseWithColoc();
    await assertSucceeds(getDoc(doc(db(COLOC), `houses/${HOUSE}/stock/riz`)));
    await assertSucceeds(deleteDoc(doc(db(ADMIN), `houses/${HOUSE}/members/${COLOC.uid}`)));
    await assertFails(getDoc(doc(db(COLOC), `houses/${HOUSE}/stock/riz`)));
  });

  it('valide le menu hebdo', async () => {
    await seedHouseWithColoc();
    const c = db(COLOC);
    await assertSucceeds(
      setDoc(doc(c, `houses/${HOUSE}/menu/2026-W40`), {
        days: { mon: { lunch: 'Attiéké', dinner: 'Soupe' } },
      }),
    );
    await assertFails(setDoc(doc(c, `houses/${HOUSE}/menu/2026-W40`), { days: { funday: {} } }));
    await assertFails(setDoc(doc(c, `houses/${HOUSE}/menu/semaine`), { days: {} }));
  });
});

describe('par défaut', () => {
  it("refuse tout chemin non prévu, même pour l'admin", async () => {
    await assertFails(getDoc(doc(db(ADMIN), 'secrets/x')));
    await assertFails(setDoc(doc(db(ADMIN), 'secrets/x'), { a: 1 }));
  });
});
