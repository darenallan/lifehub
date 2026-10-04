// Gestion de la maison : création, invitations, membres. Opérations rares, en ligne uniquement.
import { AuthError } from './auth.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidParam = { type: 'string', format: 'uuid' };

const houseParams = {
  type: 'object',
  required: ['houseId'],
  properties: { houseId: uuidParam },
};

const nameBody = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 60 } },
};

const displayName = (name) => (name ?? '').trim().slice(0, 80) || null;

/** Admin de la maison = admin global ET membre « admin » de cette maison. */
async function assertHouseAdmin(db, request, houseId) {
  if (request.user.role !== 'admin') throw new AuthError(403, 'not_authorized');
  const rows = await db.query(
    `SELECT 1 FROM house_members
     WHERE house_id = $1 AND user_id = $2 AND role = 'admin' AND deleted_at IS NULL`,
    [houseId, request.user.uid],
  );
  if (!rows.length) throw new AuthError(403, 'not_house_admin');
}

/**
 * Le coloc invité rejoint la maison à sa première connexion (e-mail vérifié par l'auth).
 * L'invitation est consommée dans la même transaction. Retourne le nombre de maisons rejointes.
 */
export function acceptInvites(db, user) {
  return db.tx(async (q) => {
    const invites = await q(
      `UPDATE house_invites i
       SET deleted_at = now(), version = nextval('change_seq'), updated_at = now()
       FROM houses h
       WHERE i.email = $1 AND i.deleted_at IS NULL AND h.id = i.house_id AND h.deleted_at IS NULL
       RETURNING i.house_id`,
      [user.email],
    );
    for (const { house_id: houseId } of invites) {
      await q(
        `INSERT INTO house_members (id, house_id, user_id, role, email, display_name)
         VALUES (gen_random_uuid(), $1, $2, 'member', $3, $4)
         ON CONFLICT (house_id, user_id) DO UPDATE
         SET deleted_at = NULL, role = 'member', version = nextval('change_seq'), updated_at = now()`,
        [houseId, user.uid, user.email, displayName(user.name)],
      );
    }
    return invites.length;
  });
}

export async function memberHouses(db, uid) {
  const rows = await db.query(
    `SELECT house_id::text AS id FROM house_members
     WHERE user_id = $1 AND deleted_at IS NULL ORDER BY house_id`,
    [uid],
  );
  return rows.map((r) => r.id);
}

export function registerHouseRoutes(app, { db, authenticate }) {
  // Création : admin global uniquement, une seule maison (maison + membre admin en une transaction).
  app.post(
    '/api/houses',
    { preHandler: authenticate, schema: { body: nameBody } },
    async (request, reply) => {
      if (request.user.role !== 'admin') throw new AuthError(403, 'not_authorized');
      const { uid, email, name } = request.user;
      const existing = await db.query(
        'SELECT 1 FROM houses WHERE admin_uid = $1 AND deleted_at IS NULL',
        [uid],
      );
      if (existing.length) return reply.code(409).send({ error: 'house_exists' });

      const id = await db.tx(async (q) => {
        const [house] = await q(
          `INSERT INTO houses (id, admin_uid, name) VALUES (gen_random_uuid(), $1, $2)
           RETURNING id::text AS id`,
          [uid, request.body.name.trim()],
        );
        await q(
          `INSERT INTO house_members (id, house_id, user_id, role, email, display_name)
           VALUES (gen_random_uuid(), $1, $2, 'admin', $3, $4)`,
          [house.id, uid, email, displayName(name)],
        );
        return house.id;
      });
      return reply.code(201).send({ id });
    },
  );

  app.patch(
    '/api/houses/:houseId',
    { preHandler: authenticate, schema: { params: houseParams, body: nameBody } },
    async (request) => {
      await assertHouseAdmin(db, request, request.params.houseId);
      await db.query(
        `UPDATE houses SET name = $2, version = nextval('change_seq'), updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL`,
        [request.params.houseId, request.body.name.trim()],
      );
      return { ok: true };
    },
  );

  app.post(
    '/api/houses/:houseId/invites',
    {
      preHandler: authenticate,
      schema: {
        params: houseParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
        },
      },
    },
    async (request, reply) => {
      const { houseId } = request.params;
      await assertHouseAdmin(db, request, houseId);
      const email = request.body.email.trim().toLowerCase();
      if (!EMAIL.test(email)) return reply.code(400).send({ error: 'invalid_email' });
      if (email === request.user.email) return reply.code(400).send({ error: 'self_invite' });

      const member = await db.query(
        'SELECT 1 FROM house_members WHERE house_id = $1 AND email = $2 AND deleted_at IS NULL',
        [houseId, email],
      );
      if (member.length) return reply.code(409).send({ error: 'already_member' });

      const [invite] = await db.query(
        `INSERT INTO house_invites (id, house_id, email) VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (house_id, email) DO UPDATE
         SET deleted_at = NULL, version = nextval('change_seq'), updated_at = now()
         RETURNING id::text AS id`,
        [houseId, email],
      );
      return reply.code(201).send({ id: invite.id });
    },
  );

  app.delete(
    '/api/houses/:houseId/invites/:inviteId',
    {
      preHandler: authenticate,
      schema: {
        params: {
          type: 'object',
          required: ['houseId', 'inviteId'],
          properties: { houseId: uuidParam, inviteId: uuidParam },
        },
      },
    },
    async (request) => {
      const { houseId, inviteId } = request.params;
      await assertHouseAdmin(db, request, houseId);
      await db.query(
        `UPDATE house_invites
         SET deleted_at = now(), version = nextval('change_seq'), updated_at = now()
         WHERE id = $1 AND house_id = $2 AND deleted_at IS NULL`,
        [inviteId, houseId],
      );
      return { ok: true };
    },
  );

  // Révocation (admin) ou départ volontaire (le coloc lui-même). L'admin ne peut pas être retiré.
  app.delete(
    '/api/houses/:houseId/members/:userId',
    {
      preHandler: authenticate,
      schema: {
        params: {
          type: 'object',
          required: ['houseId', 'userId'],
          properties: {
            houseId: uuidParam,
            userId: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { houseId, userId } = request.params;
      if (userId !== request.user.uid) await assertHouseAdmin(db, request, houseId);
      const removed = await db.query(
        `UPDATE house_members
         SET deleted_at = now(), version = nextval('change_seq'), updated_at = now()
         WHERE house_id = $1 AND user_id = $2 AND role = 'member' AND deleted_at IS NULL
         RETURNING 1`,
        [houseId, userId],
      );
      if (!removed.length) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    },
  );
}
