-- Phase 7.1 : médicaments et prises (admin uniquement).
-- Les prises « à venir / manquées » sont calculées à partir du planning ;
-- une ligne dose_logs n'existe que lorsque l'utilisateur a agi (pris, ignoré, reporté).

CREATE TABLE meds (
  id           uuid PRIMARY KEY,
  user_id      text NOT NULL,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  form         text NOT NULL CHECK (form IN ('tablet', 'capsule', 'syrup', 'injection', 'drops',
                                            'cream', 'inhaler', 'patch', 'suppository', 'other')),
  strength     text CHECK (char_length(strength) <= 30),
  unit         text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 20),
  instructions text CHECK (instructions IN ('before_meal', 'with_meal', 'after_meal', 'fasting',
                                            'bedtime')),
  color        text NOT NULL CHECK (color IN ('orange', 'blue', 'green', 'red', 'purple', 'yellow',
                                              'teal', 'pink', 'gray')),
  start_date   text NOT NULL CHECK (start_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  end_date     text CHECK (end_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  active       boolean NOT NULL DEFAULT true,
  notes        text CHECK (char_length(notes) <= 500),
  -- Structure vérifiée par l'API (api/src/health.js) ; ici, type et taille seulement.
  schedule     jsonb NOT NULL CHECK (jsonb_typeof(schedule) = 'object'
                                     AND octet_length(schedule::text) <= 4000),
  reminder     jsonb NOT NULL CHECK (jsonb_typeof(reminder) = 'object'
                                     AND octet_length(reminder::text) <= 1000),
  version      bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  -- Comparaison de chaînes YYYY-MM-DD : équivaut à l'ordre des dates.
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX meds_user_version ON meds (user_id, version);

-- Id déterministe côté client (médicament + jour + horaire) : jamais deux lignes pour une prise.
CREATE TABLE dose_logs (
  id            uuid PRIMARY KEY,
  user_id       text NOT NULL,
  med_id        uuid NOT NULL,
  date          text NOT NULL CHECK (date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  time          text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  amount        double precision NOT NULL CHECK (amount > 0 AND amount <= 1000),
  status        text NOT NULL CHECK (status IN ('taken', 'skipped', 'snoozed')),
  -- Heure réelle de prise et fin du report, à l'heure murale de l'appareil.
  taken_at      text CHECK (taken_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  snooze_until  text CHECK (snooze_until ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  note          text CHECK (char_length(note) <= 200),
  -- false : prise « à la demande », hors planning.
  scheduled     boolean NOT NULL,
  version       bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CHECK (status <> 'taken' OR taken_at IS NOT NULL),
  CHECK (status <> 'snoozed' OR snooze_until IS NOT NULL)
);
CREATE INDEX dose_logs_user_version ON dose_logs (user_id, version);
