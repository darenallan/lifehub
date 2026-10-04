-- Phase 4 : maison partagée avec des colocs.
-- Les données de maison sont rattachées à house_id ; l'accès passe par house_members.

CREATE TABLE houses (
  id          uuid PRIMARY KEY,
  admin_uid   text NOT NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at  timestamptz NOT NULL DEFAULT now(),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX houses_version ON houses (version);

CREATE TABLE house_members (
  id           uuid PRIMARY KEY,
  house_id     uuid NOT NULL REFERENCES houses (id),
  user_id      text NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 128),
  role         text NOT NULL CHECK (role IN ('admin', 'member')),
  email        text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  display_name text CHECK (char_length(display_name) <= 80),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  version      bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (house_id, user_id)
);
CREATE INDEX house_members_user ON house_members (user_id);
CREATE INDEX house_members_house_version ON house_members (house_id, version);

-- Invitation = e-mail en minuscules ; consommée (suppression logique) quand le coloc rejoint.
CREATE TABLE house_invites (
  id          uuid PRIMARY KEY,
  house_id    uuid NOT NULL REFERENCES houses (id),
  email       text NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  created_at  timestamptz NOT NULL DEFAULT now(),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (house_id, email)
);
CREATE INDEX house_invites_email ON house_invites (email);
CREATE INDEX house_invites_house_version ON house_invites (house_id, version);

CREATE TABLE stock_items (
  id          uuid PRIMARY KEY,
  house_id    uuid NOT NULL REFERENCES houses (id),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  qty         double precision NOT NULL DEFAULT 0 CHECK (qty >= 0 AND qty < 1000000),
  unit        text CHECK (char_length(unit) <= 16),
  min_qty     double precision CHECK (min_qty >= 0 AND min_qty < 1000000),
  location    text CHECK (char_length(location) <= 40),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX stock_items_house_version ON stock_items (house_id, version);

-- Une ligne par repas : deux colocs qui remplissent des cases différentes ne s'écrasent pas.
CREATE TABLE menu_entries (
  id          uuid PRIMARY KEY,
  house_id    uuid NOT NULL REFERENCES houses (id),
  week        text NOT NULL CHECK (week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  day         text NOT NULL CHECK (day IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  meal        text NOT NULL CHECK (meal IN ('lunch', 'dinner')),
  dish        text CHECK (char_length(dish) <= 80),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (house_id, week, day, meal)
);
CREATE INDEX menu_entries_house_version ON menu_entries (house_id, version);

CREATE TABLE bills (
  id          uuid PRIMARY KEY,
  house_id    uuid NOT NULL REFERENCES houses (id),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  amount      integer NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
  due_date    text NOT NULL CHECK (due_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  recurrence  text CHECK (recurrence IN ('monthly', 'yearly')),
  paid        boolean NOT NULL DEFAULT false,
  paid_on     text CHECK (paid_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  paid_by     text CHECK (char_length(paid_by) <= 128),
  -- Facture récurrente : l'occurrence suivante pointe vers la précédente (une seule suivante).
  previous_id uuid UNIQUE,
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (paid OR (paid_on IS NULL AND paid_by IS NULL))
);
CREATE INDEX bills_house_version ON bills (house_id, version);

CREATE TABLE shopping_items (
  id          uuid PRIMARY KEY,
  house_id    uuid NOT NULL REFERENCES houses (id),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  qty         text CHECK (char_length(qty) <= 20),
  checked     boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'stock', 'menu')),
  stock_id    uuid,
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX shopping_items_house_version ON shopping_items (house_id, version);
