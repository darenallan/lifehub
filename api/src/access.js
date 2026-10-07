// Accès à LifeHub : liste des e-mails autorisés, gérée par le propriétaire (ADMIN_EMAIL) seul.
// Opérations rares, en ligne uniquement (pas de sync hors ligne pour la gestion des accès).
import { AuthError } from './auth.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// « Quelques personnes » : borne aussi l'usage de la base gratuite.
export const MAX_USERS = 20;

const emailBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
};
const emailParams = {
  type: 'object',
  required: ['email'],
  properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
};

const normalize = (email) => email.trim().toLowerCase();

function assertOwner(request) {
  if (!request.user.owner) throw new AuthError(403, 'not_owner');
}

export function registerAccessRoutes(app, { db, authenticate }) {
  app.get('/api/access', { preHandler: authenticate }, async (request) => {
    assertOwner(request);
    const rows = await db.query(
      `SELECT email, to_char(added_at, 'YYYY-MM-DD') AS added_on
       FROM app_users WHERE revoked_at IS NULL ORDER BY email`,
    );
    return { users: rows.map((r) => ({ email: r.email, addedOn: r.added_on })), max: MAX_USERS };
  });

  // Ajout (ou réactivation d'un accès retiré) : la personne a son espace dès sa prochaine connexion.
  app.post(
    '/api/access',
    { preHandler: authenticate, schema: { body: emailBody } },
    async (request, reply) => {
      assertOwner(request);
      const email = normalize(request.body.email);
      if (!EMAIL.test(email)) return reply.code(400).send({ error: 'invalid_email' });
      if (email === request.user.email) return reply.code(400).send({ error: 'owner_email' });

      const [{ count }] = await db.query(
        'SELECT count(*)::int AS count FROM app_users WHERE revoked_at IS NULL AND email <> $1',
        [email],
      );
      if (count >= MAX_USERS) return reply.code(409).send({ error: 'too_many_users' });

      await db.query(
        `INSERT INTO app_users (email) VALUES ($1)
         ON CONFLICT (email) DO UPDATE
         SET revoked_at = NULL,
             added_at = CASE WHEN app_users.revoked_at IS NULL THEN app_users.added_at ELSE now() END`,
        [email],
      );
      return reply.code(201).send({ email });
    },
  );

  // Retrait : effet immédiat (le rôle est recalculé à chaque requête). Les données restent en base.
  app.delete(
    '/api/access/:email',
    { preHandler: authenticate, schema: { params: emailParams } },
    async (request, reply) => {
      assertOwner(request);
      await db.query(
        'UPDATE app_users SET revoked_at = now() WHERE email = $1 AND revoked_at IS NULL',
        [normalize(request.params.email)],
      );
      return reply.code(204).send();
    },
  );
}
