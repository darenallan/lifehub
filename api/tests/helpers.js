import { buildApp } from '../src/app.js';
import { COLLECTIONS } from '../src/collections.js';
import { createPgliteDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

export const ADMIN_EMAIL = 'admin@example.com';

// Jetons factices au format JWT ; le vérificateur de test les traduit en claims.
export const TOKENS = {
  admin: 'h.admin.s',
  adminUnverified: 'h.adminUnverified.s',
  stranger: 'h.stranger.s',
  coloc: 'h.coloc.s',
  colocUnverified: 'h.colocUnverified.s',
  broken: 'h.broken.s',
};

const CLAIMS = {
  admin: { sub: 'admin-uid', email: 'Admin@Example.com', email_verified: true, name: 'Daren Tien' },
  adminUnverified: { sub: 'admin-uid', email: ADMIN_EMAIL, email_verified: false },
  stranger: { sub: 'stranger-uid', email: 'x@example.com', email_verified: true },
  coloc: { sub: 'coloc-uid', email: 'Coloc@Example.com', email_verified: true, name: 'Awa Koné' },
  colocUnverified: { sub: 'coloc-uid', email: 'coloc@example.com', email_verified: false },
};

async function fakeVerify(token) {
  const claims = CLAIMS[token.split('.')[1]];
  if (!claims) throw new Error('bad token');
  return claims;
}

// Collection de test non-singleton, pour couvrir la propriété des documents.
export const TEST_COLLECTIONS = {
  ...COLLECTIONS,
  note: {
    table: 'notes',
    roles: ['admin'],
    fields: { title: { column: 'title', schema: { type: 'string', minLength: 1, maxLength: 50 } } },
  },
};

/** extra : surcharge de configuration ; pushSender : faux envoyeur Web Push. */
export async function setup({ extra = {}, pushSender = null } = {}) {
  const db = await createPgliteDb();
  await migrate(db);
  await db.exec(`CREATE TABLE notes (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL CHECK (char_length(title) <= 50),
    version bigint NOT NULL DEFAULT nextval('change_seq'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  )`);
  const config = {
    isHosted: false,
    adminEmail: ADMIN_EMAIL,
    allowedOrigins: ['http://127.0.0.1:7070'],
    ...extra,
  };
  const app = await buildApp({
    db,
    verifyToken: fakeVerify,
    config,
    collections: TEST_COLLECTIONS,
    pushSender,
  });
  return { app, db };
}

export function call(app, { method = 'GET', url, token, body, headers = {} }) {
  return app.inject({
    method,
    url,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...headers },
    ...(body !== undefined && { payload: body }),
  });
}

export const sync = (app, body, token = TOKENS.admin) =>
  call(app, { method: 'POST', url: '/api/sync', token, body });
