-- Phase 1 : habitudes. Une ligne par case cochée et par jour de journal,
-- pour que deux appareils ne s'écrasent jamais (pas de map JSON partagée).

CREATE TABLE habits (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  emoji       text CHECK (char_length(emoji) <= 16),
  sort_order  integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (id, user_id)
);
CREATE INDEX habits_user_version ON habits (user_id, version);

CREATE TABLE habit_checks (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  habit_id    uuid NOT NULL,
  day         text NOT NULL CHECK (day ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  done        boolean NOT NULL DEFAULT true,
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  -- Clé composite : impossible de cocher l'habitude d'un autre utilisateur.
  FOREIGN KEY (habit_id, user_id) REFERENCES habits (id, user_id),
  UNIQUE (user_id, habit_id, day)
);
CREATE INDEX habit_checks_user_version ON habit_checks (user_id, version);

CREATE TABLE habit_days (
  id            uuid PRIMARY KEY,
  user_id       text NOT NULL,
  day           text NOT NULL CHECK (day ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  mood          smallint CHECK (mood BETWEEN 1 AND 5),
  sleep_minutes smallint CHECK (sleep_minutes BETWEEN 0 AND 1440),
  version       bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (user_id, day)
);
CREATE INDEX habit_days_user_version ON habit_days (user_id, version);
