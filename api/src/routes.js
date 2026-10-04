import { AuthError } from './auth.js';
import { seedDefaultCategories } from './defaults.js';
import { acceptInvites, memberHouses, registerHouseRoutes } from './house.js';
import { applyMutation, pullChanges } from './sync.js';

const syncBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cursor', 'mutations'],
  properties: {
    cursor: { type: 'string', pattern: '^[0-9]{1,19}$' },
    mutations: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'collection', 'docId', 'op'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          collection: { type: 'string', maxLength: 40 },
          docId: { type: 'string', minLength: 1, maxLength: 128 },
          op: { enum: ['patch', 'delete'] },
          data: { type: 'object' },
        },
      },
    },
  },
};

function requireRole(request) {
  if (!request.user.role) throw new AuthError(403, 'not_authorized');
}

const firstName = (name) => (name.trim().split(/\s+/)[0] ?? '').slice(0, 60);

export function registerRoutes(app, { db, collections, authenticate }) {
  // Pas d'accès base : la sonde de Render ne doit pas réveiller Neon.
  app.get('/healthz', async () => ({ ok: true }));

  app.get('/api/me', { preHandler: authenticate }, async (request) => {
    // Coloc invité : il rejoint sa maison à la première connexion (e-mail vérifié).
    if (!request.user.role && (await acceptInvites(db, request.user)) > 0) {
      request.user.role = 'member';
    }
    requireRole(request);
    const { uid, email, name, role } = request.user;
    if (role === 'admin') {
      // Profil créé au premier passage, avec le prénom Google, puis les catégories par défaut.
      await db.query(
        'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [uid, firstName(name)],
      );
      await seedDefaultCategories(db, uid);
    }
    return { uid, email, role, houses: await memberHouses(db, uid) };
  });

  registerHouseRoutes(app, { db, authenticate });

  app.post(
    '/api/sync',
    { preHandler: authenticate, schema: { body: syncBodySchema } },
    async (request) => {
      requireRole(request);
      const ctx = { user: request.user, role: request.user.role, collections };
      const result = { applied: [], rejected: [] };

      for (const mutation of request.body.mutations) {
        const outcome = await applyMutation(db, ctx, mutation);
        if (outcome.status === 'applied') result.applied.push(mutation.id);
        else {
          result.rejected.push({
            id: mutation.id,
            reason: outcome.reason,
            details: outcome.details,
          });
        }
      }
      if (result.rejected.length)
        request.log.warn({ rejected: result.rejected }, 'mutations refusées');

      // Tirage après application : le client reçoit ses propres écritures avec leur version serveur.
      const pull = await pullChanges(db, ctx, request.body.cursor);
      return { ...result, ...pull };
    },
  );
}
