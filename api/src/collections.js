// Registre des collections synchronisées. Chaque phase y ajoute ses tables.
// singleton : un seul document par utilisateur (docId 'me', clé = user_id).
// Sinon : docId = uuid généré par le client, colonne id + colonne propriétaire user_id.

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const ADMIN = ['admin'];
const day = { column: 'day', schema: { type: 'string', pattern: DAY } };
const uuid = { type: 'string', pattern: UUID };
// FCFA : entier strictement positif, jamais de flottant.
const money = { type: 'integer', minimum: 1, maximum: 999999999 };
const note = { column: 'note', schema: { type: 'string', maxLength: 200, nullable: true } };

export const CATEGORY_COLORS = [
  'orange',
  'blue',
  'green',
  'red',
  'purple',
  'yellow',
  'teal',
  'pink',
  'gray',
];

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

  // ---------- Phase 2 : dépenses ----------
  category: {
    table: 'categories',
    roles: ADMIN,
    fields: {
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 40 } },
      emoji: { column: 'emoji', schema: { type: 'string', maxLength: 16, nullable: true } },
      color: { column: 'color', schema: { enum: CATEGORY_COLORS } },
      monthlyBudget: { column: 'monthly_budget', schema: { ...money, minimum: 0 } },
      order: { column: 'sort_order', schema: { type: 'integer', minimum: 0, maximum: 100000 } },
      active: { column: 'active', schema: { type: 'boolean' } },
    },
  },

  expense: {
    table: 'expenses',
    roles: ADMIN,
    fields: {
      amount: { column: 'amount', schema: money },
      categoryId: { column: 'category_id', schema: uuid },
      note,
      date: { column: 'date', schema: { type: 'string', pattern: DAY } },
      recurringId: { column: 'recurring_id', schema: { ...uuid, nullable: true } },
    },
  },

  // Modèle : les occurrences sont créées côté client avec un id déterministe (modèle + mois).
  recurringExpense: {
    table: 'recurring_expenses',
    roles: ADMIN,
    fields: {
      amount: { column: 'amount', schema: money },
      categoryId: { column: 'category_id', schema: uuid },
      note,
      dayOfMonth: { column: 'day_of_month', schema: { type: 'integer', minimum: 1, maximum: 31 } },
      startMonth: { column: 'start_month', schema: { type: 'string', pattern: MONTH } },
      lastMonth: {
        column: 'last_month',
        schema: { type: 'string', pattern: MONTH, nullable: true },
      },
      active: { column: 'active', schema: { type: 'boolean' } },
    },
  },

  // ---------- Phase 3 : objectifs du jour et tâches ----------
  // Id déterministe (utilisateur + jour + position) ; 5 objectifs max garantis par la base.
  dailyGoal: {
    table: 'daily_goals',
    roles: ADMIN,
    fields: {
      day,
      position: { column: 'position', schema: { type: 'integer', minimum: 0, maximum: 4 } },
      text: { column: 'text', schema: { type: 'string', minLength: 1, maxLength: 120 } },
      done: { column: 'done', schema: { type: 'boolean' } },
    },
  },

  task: {
    table: 'tasks',
    roles: ADMIN,
    fields: {
      title: { column: 'title', schema: { type: 'string', minLength: 1, maxLength: 200 } },
      done: { column: 'done', schema: { type: 'boolean' } },
      priority: { column: 'priority', schema: { type: 'integer', minimum: 1, maximum: 3 } },
      dueDate: { column: 'due_date', schema: { type: 'string', pattern: DAY, nullable: true } },
      dueTime: { column: 'due_time', schema: { type: 'string', pattern: TIME, nullable: true } },
      recurrence: {
        column: 'recurrence',
        schema: { enum: ['daily', 'weekly', 'monthly'], nullable: true },
      },
      doneOn: { column: 'done_on', schema: { type: 'string', pattern: DAY, nullable: true } },
    },
  },
};
