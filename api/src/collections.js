// Registre des collections synchronisées. Chaque phase y ajoute ses tables.
import { checkReminder, checkSchedule, isDoseAmount } from './health.js';

// singleton : un seul document par utilisateur (docId 'me', clé = user_id).
// Sinon : docId = uuid généré par le client, colonne id + colonne propriétaire user_id.

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EVERYONE = ['admin', 'member'];
const quantity = { type: 'number', minimum: 0, maximum: 999999 };

const PAYMENT_FIELDS = new Set(['paid', 'paidOn', 'paidBy']);

/**
 * Factures : l'admin de la maison fait tout. Un coloc ne peut que marquer une facture
 * existante payée (à son nom) ou non payée ; ni création, ni suppression, ni autre champ.
 */
function billAccess({ op, data, existing, houseRole, uid }) {
  if (houseRole === 'admin') return true;
  if (op !== 'patch' || !existing) return false;
  if (!Object.keys(data).every((k) => PAYMENT_FIELDS.has(k))) return false;
  const paid = data.paid ?? existing.paid;
  const paidBy = 'paidBy' in data ? data.paidBy : existing.paidBy;
  return paid ? paidBy === uid : paidBy == null;
}

/** Facture récurrente payée → occurrence suivante créée une seule fois (previous_id unique). */
function createNextBill(q, id) {
  return q(
    `INSERT INTO bills (id, house_id, label, amount, due_date, recurrence, paid, previous_id)
     SELECT gen_random_uuid(), house_id, label, amount,
            to_char(due_date::date + CASE recurrence WHEN 'monthly' THEN interval '1 month'
                                                     ELSE interval '1 year' END, 'YYYY-MM-DD'),
            recurrence, false, id
     FROM bills
     WHERE id = $1 AND paid AND recurrence IS NOT NULL AND deleted_at IS NULL
     ON CONFLICT (previous_id) DO NOTHING`,
    [id],
  );
}

const ADMIN = ['admin'];
const day = { column: 'day', schema: { type: 'string', pattern: DAY } };
const uuid = { type: 'string', pattern: UUID };
// FCFA : entier strictement positif, jamais de flottant.
const money = { type: 'integer', minimum: 1, maximum: 999999999 };
const note = { column: 'note', schema: { type: 'string', maxLength: 200, nullable: true } };
const optionalText = (maxLength) => ({ type: 'string', maxLength, nullable: true });
// Même motif que la contrainte CHECK de 008_health_phone.sql (numéros courts acceptés : 15, 112…).
const phone = { type: 'string', pattern: /^\+?\(?[0-9][0-9 .()-]{1,22}$/ };
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MED_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'drops',
  'cream',
  'inhaler',
  'patch',
  'suppository',
  'other',
];

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

  // ---------- Phase 4 : maison partagée ----------
  // scope 'house' : visibles et modifiables par les membres actifs de la maison (voir sync.js).
  // readOnly : modifiés uniquement par les routes dédiées (house.js).
  house: {
    table: 'houses',
    scope: 'house',
    houseColumn: 'id',
    roles: EVERYONE,
    readOnly: true,
    fields: {
      name: { column: 'name', schema: { type: 'string' } },
      adminUid: { column: 'admin_uid', schema: { type: 'string' } },
    },
  },

  houseMember: {
    table: 'house_members',
    scope: 'house',
    roles: EVERYONE,
    readOnly: true,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      userId: { column: 'user_id', schema: { type: 'string' } },
      role: { column: 'role', schema: { type: 'string' } },
      email: { column: 'email', schema: { type: 'string' } },
      displayName: { column: 'display_name', schema: { type: 'string', nullable: true } },
    },
  },

  // Invitations en attente : visibles par l'admin de la maison seulement.
  houseInvite: {
    table: 'house_invites',
    scope: 'house',
    houseRoles: ['admin'],
    roles: ['admin'],
    readOnly: true,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      email: { column: 'email', schema: { type: 'string' } },
    },
  },

  stockItem: {
    table: 'stock_items',
    scope: 'house',
    roles: EVERYONE,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      qty: { column: 'qty', schema: quantity },
      unit: { column: 'unit', schema: { type: 'string', maxLength: 16, nullable: true } },
      minQty: { column: 'min_qty', schema: { ...quantity, nullable: true } },
      location: { column: 'location', schema: { type: 'string', maxLength: 40, nullable: true } },
    },
  },

  // Id déterministe côté client (maison + semaine + jour + repas).
  menuEntry: {
    table: 'menu_entries',
    scope: 'house',
    roles: EVERYONE,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      week: { column: 'week', schema: { type: 'string', pattern: WEEK } },
      day: { column: 'day', schema: { enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } },
      meal: { column: 'meal', schema: { enum: ['lunch', 'dinner'] } },
      dish: { column: 'dish', schema: { type: 'string', maxLength: 80, nullable: true } },
    },
  },

  bill: {
    table: 'bills',
    scope: 'house',
    roles: EVERYONE,
    access: billAccess,
    afterWrite: createNextBill,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      label: { column: 'label', schema: { type: 'string', minLength: 1, maxLength: 80 } },
      amount: { column: 'amount', schema: money },
      dueDate: { column: 'due_date', schema: { type: 'string', pattern: DAY } },
      recurrence: { column: 'recurrence', schema: { enum: ['monthly', 'yearly'], nullable: true } },
      paid: { column: 'paid', schema: { type: 'boolean' } },
      paidOn: { column: 'paid_on', schema: { type: 'string', pattern: DAY, nullable: true } },
      paidBy: { column: 'paid_by', schema: { type: 'string', maxLength: 128, nullable: true } },
    },
  },

  shoppingItem: {
    table: 'shopping_items',
    scope: 'house',
    roles: EVERYONE,
    fields: {
      houseId: { column: 'house_id', schema: uuid },
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      qty: { column: 'qty', schema: { type: 'string', maxLength: 20, nullable: true } },
      checked: { column: 'checked', schema: { type: 'boolean' } },
      source: { column: 'source', schema: { enum: ['manual', 'stock', 'menu'] } },
      stockId: { column: 'stock_id', schema: { ...uuid, nullable: true } },
    },
  },

  // ---------- Phase 6 : extras perso ----------
  debt: {
    table: 'debts',
    roles: ADMIN,
    fields: {
      person: { column: 'person', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      direction: { column: 'direction', schema: { enum: ['lent', 'borrowed'] } },
      amount: { column: 'amount', schema: money },
      note,
      date: { column: 'date', schema: { type: 'string', pattern: DAY } },
      settled: { column: 'settled', schema: { type: 'boolean' } },
      settledOn: { column: 'settled_on', schema: { type: 'string', pattern: DAY, nullable: true } },
    },
  },

  quickNote: {
    table: 'quick_notes',
    roles: ADMIN,
    fields: {
      text: { column: 'text', schema: { type: 'string', minLength: 1, maxLength: 2000 } },
      pinned: { column: 'pinned', schema: { type: 'boolean' } },
      createdAt: { column: 'created_at', schema: { type: 'string', pattern: MINUTE } },
    },
  },

  // ---------- Phase 7 : santé (données sensibles, admin uniquement) ----------
  healthProfile: {
    table: 'health_profiles',
    singleton: true,
    roles: ADMIN,
    fields: {
      bloodGroup: { column: 'blood_group', schema: { enum: BLOOD_GROUPS, nullable: true } },
      allergies: { column: 'allergies', schema: optionalText(500) },
      conditions: { column: 'conditions', schema: optionalText(500) },
      emergencyNotes: { column: 'emergency_notes', schema: optionalText(300) },
      heightCm: {
        column: 'height_cm',
        schema: { type: 'integer', minimum: 50, maximum: 250, nullable: true },
      },
      doctorName: { column: 'doctor_name', schema: optionalText(60) },
      doctorPhone: { column: 'doctor_phone', schema: { ...phone, nullable: true } },
      disclaimerSeenOn: {
        column: 'disclaimer_seen_on',
        schema: { type: 'string', pattern: DAY, nullable: true },
      },
    },
  },

  med: {
    table: 'meds',
    roles: ADMIN,
    fields: {
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      form: { column: 'form', schema: { enum: MED_FORMS } },
      strength: { column: 'strength', schema: optionalText(30) },
      unit: { column: 'unit', schema: { type: 'string', minLength: 1, maxLength: 20 } },
      instructions: {
        column: 'instructions',
        schema: {
          enum: ['before_meal', 'with_meal', 'after_meal', 'fasting', 'bedtime'],
          nullable: true,
        },
      },
      color: { column: 'color', schema: { enum: CATEGORY_COLORS } },
      startDate: { column: 'start_date', schema: { type: 'string', pattern: DAY } },
      endDate: { column: 'end_date', schema: { type: 'string', pattern: DAY, nullable: true } },
      active: { column: 'active', schema: { type: 'boolean' } },
      notes: { column: 'notes', schema: optionalText(500) },
      schedule: { column: 'schedule', schema: { type: 'json', check: checkSchedule } },
      reminder: {
        column: 'reminder',
        schema: { type: 'json', maxBytes: 1000, check: checkReminder },
      },
    },
  },

  // Id déterministe côté client (médicament + jour + horaire) pour les prises planifiées.
  doseLog: {
    table: 'dose_logs',
    roles: ADMIN,
    fields: {
      medId: { column: 'med_id', schema: uuid },
      date: { column: 'date', schema: { type: 'string', pattern: DAY } },
      time: { column: 'time', schema: { type: 'string', pattern: TIME } },
      amount: {
        column: 'amount',
        schema: {
          type: 'number',
          check: (v) => (isDoseAmount(v) ? null : 'quantité invalide'),
        },
      },
      status: { column: 'status', schema: { enum: ['taken', 'skipped', 'snoozed'] } },
      takenAt: { column: 'taken_at', schema: { type: 'string', pattern: MINUTE, nullable: true } },
      snoozeUntil: {
        column: 'snooze_until',
        schema: { type: 'string', pattern: MINUTE, nullable: true },
      },
      note,
      scheduled: { column: 'scheduled', schema: { type: 'boolean' } },
    },
  },

  emergencyContact: {
    table: 'emergency_contacts',
    roles: ADMIN,
    fields: {
      name: { column: 'name', schema: { type: 'string', minLength: 1, maxLength: 60 } },
      phone: { column: 'phone', schema: phone },
      relation: { column: 'relation', schema: optionalText(40) },
      order: { column: 'sort_order', schema: { type: 'integer', minimum: 0, maximum: 100000 } },
    },
  },
};
