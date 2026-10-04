// Registre des collections synchronisées. Chaque phase y ajoute ses tables.
// singleton : un seul document par utilisateur (docId 'me', clé = user_id).
// Sinon : docId = uuid généré par le client, colonne id + colonne propriétaire user_id.

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADMIN = ['admin'];
const day = { column: 'day', schema: { type: 'string', pattern: DAY } };

export const COLLECTIONS = {
  profile: {
    table: 'profiles',
    singleton: true,
    roles: ADMIN,
    fields: {
      displayName: { column: 'display_name', schema: { type: 'string', maxLength: 60 } },
      currency: { column: 'currency', schema: { const: 'XOF' } },
      theme: { column: 'theme', schema: { enum: ['dark', 'light'] } },
    },
  },

  habit: {
    table: 'habits',
    roles: ADMIN,
    fields: {
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      emoji: { column: 'emoji', schema: { type: 'string', maxLength: 16, nullable: true } },
      order: { column: 'sort_order', schema: { type: 'integer', minimum: 0, maximum: 100000 } },
      active: { column: 'active', schema: { type: 'boolean' } },
    },
  },

  // Id déterministe côté client (utilisateur + habitude + jour) : une case = une ligne.
  habitCheck: {
    table: 'habit_checks',
    roles: ADMIN,
    fields: {
      habitId: { column: 'habit_id', schema: { type: 'string', pattern: UUID } },
      day,
      done: { column: 'done', schema: { type: 'boolean' } },
    },
  },

  habitDay: {
    table: 'habit_days',
    roles: ADMIN,
    fields: {
      day,
      mood: { column: 'mood', schema: { type: 'integer', minimum: 1, maximum: 5, nullable: true } },
      sleepMinutes: {
        column: 'sleep_minutes',
        schema: { type: 'integer', minimum: 0, maximum: 1440, nullable: true },
      },
    },
  },
};
