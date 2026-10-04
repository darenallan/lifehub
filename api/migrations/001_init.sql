-- Version globale : chaque écriture prend nextval, les clients tirent « version > curseur ».
CREATE SEQUENCE change_seq;

CREATE TABLE profiles (
  user_id      text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 128),
  display_name text CHECK (char_length(display_name) <= 60),
  currency     text NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
  theme        text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  version      bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX profiles_user_version ON profiles (user_id, version);

-- Idempotence : une mutation rejouée (réseau coupé avant la réponse) n'est appliquée qu'une fois.
CREATE TABLE applied_mutations (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
