-- Phases 7.2 et 7.3 : stock des médicaments, mesures, journal santé (admin, données perso).

-- Stock calculé : stock_qty au moment stock_at, + rachats après, − prises après.
-- Aucun compteur décrémenté en base : pas de conflit entre deux appareils hors ligne.
ALTER TABLE meds ADD COLUMN stock_qty double precision CHECK (stock_qty >= 0 AND stock_qty <= 100000);
ALTER TABLE meds ADD COLUMN stock_at text CHECK (stock_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$');
ALTER TABLE meds ADD COLUMN refill_at double precision CHECK (refill_at >= 0 AND refill_at <= 100000);
ALTER TABLE meds ADD COLUMN pharmacy text CHECK (char_length(pharmacy) <= 60);
-- Prix d'une boîte, en FCFA (entier).
ALTER TABLE meds ADD COLUMN price integer CHECK (price BETWEEN 1 AND 999999999);
ALTER TABLE meds ADD COLUMN pack_size double precision CHECK (pack_size > 0 AND pack_size <= 100000);

CREATE TABLE med_refills (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  med_id      uuid NOT NULL,
  qty         double precision NOT NULL CHECK (qty > 0 AND qty <= 100000),
  at          text NOT NULL CHECK (at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  price       integer CHECK (price BETWEEN 1 AND 999999999),
  -- Dépense créée dans le module Dépenses (catégorie Santé), si l'utilisateur l'a demandé.
  expense_id  uuid,
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX med_refills_user_version ON med_refills (user_id, version);

-- Types de mesure : réglages (cibles perso) des types intégrés, et types personnalisés.
-- Id déterministe côté client (utilisateur + clé du type).
CREATE TABLE measure_types (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,29}$'),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  unit        text CHECK (char_length(unit) <= 12),
  custom      boolean NOT NULL,
  -- Plages cibles saisies par l'utilisateur (jamais de norme médicale pré-remplie).
  targets     jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(targets) = 'object'
                                                 AND octet_length(targets::text) <= 1000),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX measure_types_user_version ON measure_types (user_id, version);

CREATE TABLE measures (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  type_key    text NOT NULL CHECK (type_key ~ '^[a-z][a-z0-9_]{0,29}$'),
  -- « values » est un mot réservé SQL : la colonne s'appelle readings (champ API : values).
  readings    jsonb NOT NULL CHECK (jsonb_typeof(readings) = 'object'
                                    AND octet_length(readings::text) <= 500),
  at          text NOT NULL CHECK (at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  date        text NOT NULL CHECK (date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  context     text CHECK (context IN ('fasting', 'after_meal', 'before_exercise',
                                      'after_exercise', 'rest')),
  unit        text CHECK (char_length(unit) <= 12),
  note        text CHECK (char_length(note) <= 200),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX measures_user_version ON measures (user_id, version);

-- Une ligne par jour (id déterministe). Humeur et sommeil restent dans habit_days.
CREATE TABLE health_journal (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  date        text NOT NULL CHECK (date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  energy      integer CHECK (energy BETWEEN 1 AND 5),
  pain_level  integer CHECK (pain_level BETWEEN 0 AND 10),
  pain_zone   text CHECK (char_length(pain_zone) <= 40),
  symptoms    jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(symptoms) = 'array'
                                                 AND octet_length(symptoms::text) <= 4000),
  tags        jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tags) = 'array'
                                                 AND octet_length(tags::text) <= 1000),
  note        text CHECK (char_length(note) <= 1000),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX health_journal_user_version ON health_journal (user_id, version);
