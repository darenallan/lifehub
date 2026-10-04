-- Phase 6 : dettes et prêts, notes rapides (données perso de l'admin).

CREATE TABLE debts (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  person      text NOT NULL CHECK (char_length(person) BETWEEN 1 AND 60),
  -- lent = on me doit ; borrowed = je dois
  direction   text NOT NULL CHECK (direction IN ('lent', 'borrowed')),
  amount      integer NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
  note        text CHECK (char_length(note) <= 200),
  date        text NOT NULL CHECK (date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  settled     boolean NOT NULL DEFAULT false,
  settled_on  text CHECK (settled_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (settled OR settled_on IS NULL)
);
CREATE INDEX debts_user_version ON debts (user_id, version);

CREATE TABLE quick_notes (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  text        text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  pinned      boolean NOT NULL DEFAULT false,
  created_at  text NOT NULL CHECK (created_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX quick_notes_user_version ON quick_notes (user_id, version);

-- Purge du journal d'idempotence (voir server.js) : index sur la date.
CREATE INDEX applied_mutations_applied_at ON applied_mutations (applied_at);
