-- Phase 3 : objectifs du jour et tâches.

-- Un objectif = une ligne. Position 0..4 + unicité (jour, position) : 5 objectifs maximum par jour,
-- garanti par la base. L'id est déterministe côté client (utilisateur + jour + position).
CREATE TABLE daily_goals (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL,
  day        text NOT NULL CHECK (day ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  position   smallint NOT NULL CHECK (position BETWEEN 0 AND 4),
  text       text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  done       boolean NOT NULL DEFAULT false,
  version    bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, day, position)
);
CREATE INDEX daily_goals_user_version ON daily_goals (user_id, version);

CREATE TABLE tasks (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  done       boolean NOT NULL DEFAULT false,
  priority   smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  due_date   text CHECK (due_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  due_time   text CHECK (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  recurrence text CHECK (recurrence IN ('daily', 'weekly', 'monthly')),
  done_on    text CHECK (done_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  version    bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Une récurrence a besoin d'une échéance pour calculer la suivante.
  CHECK (recurrence IS NULL OR due_date IS NOT NULL),
  CHECK (due_time IS NULL OR due_date IS NOT NULL)
);
CREATE INDEX tasks_user_version ON tasks (user_id, version);
