-- Phase 2 : dépenses. Montants en FCFA, entiers strictement positifs, jamais de flottants.

-- Les catégories par défaut ne sont créées qu'une fois par utilisateur (voir defaults.js).
ALTER TABLE profiles ADD COLUMN categories_seeded boolean NOT NULL DEFAULT false;

CREATE TABLE categories (
  id             uuid PRIMARY KEY,
  user_id        text NOT NULL,
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  emoji          text CHECK (char_length(emoji) <= 16),
  color          text NOT NULL DEFAULT 'gray'
                 CHECK (color IN ('orange', 'blue', 'green', 'red', 'purple', 'yellow', 'teal', 'pink', 'gray')),
  monthly_budget integer NOT NULL DEFAULT 0 CHECK (monthly_budget BETWEEN 0 AND 999999999),
  sort_order     integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  active         boolean NOT NULL DEFAULT true,
  version        bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (id, user_id)
);
CREATE INDEX categories_user_version ON categories (user_id, version);

CREATE TABLE recurring_expenses (
  id           uuid PRIMARY KEY,
  user_id      text NOT NULL,
  amount       integer NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
  category_id  uuid NOT NULL,
  note         text CHECK (char_length(note) <= 200),
  day_of_month smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  start_month  text NOT NULL CHECK (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Dernier mois déjà généré : évite de recréer une occurrence supprimée.
  last_month   text CHECK (last_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  active       boolean NOT NULL DEFAULT true,
  version      bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
  UNIQUE (id, user_id)
);
CREATE INDEX recurring_expenses_user_version ON recurring_expenses (user_id, version);

CREATE TABLE expenses (
  id           uuid PRIMARY KEY,
  user_id      text NOT NULL,
  amount       integer NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
  category_id  uuid NOT NULL,
  note         text CHECK (char_length(note) <= 200),
  date         text NOT NULL CHECK (date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  recurring_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  version      bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
  FOREIGN KEY (recurring_id, user_id) REFERENCES recurring_expenses (id, user_id)
);
CREATE INDEX expenses_user_version ON expenses (user_id, version);
CREATE INDEX expenses_user_date ON expenses (user_id, date);
