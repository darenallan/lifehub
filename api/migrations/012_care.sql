-- Phase 7.4 : contacts médicaux et rendez-vous (admin, données perso).

CREATE TABLE doctors (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  kind        text NOT NULL CHECK (kind IN ('doctor', 'pharmacy', 'lab', 'other')),
  specialty   text CHECK (char_length(specialty) <= 60),
  phone       text CHECK (phone ~ '^\+?\(?[0-9][0-9 .()-]{1,22}$'),
  address     text CHECK (char_length(address) <= 200),
  notes       text CHECK (char_length(notes) <= 500),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX doctors_user_version ON doctors (user_id, version);

CREATE TABLE appointments (
  id                  uuid PRIMARY KEY,
  user_id             text NOT NULL,
  doctor_id           uuid,
  at                  text NOT NULL CHECK (at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  reason              text CHECK (char_length(reason) <= 120),
  place               text CHECK (char_length(place) <= 200),
  status              text NOT NULL CHECK (status IN ('planned', 'done', 'cancelled')),
  -- Notes post-consultation : prescriptions, prochaine étape.
  after_notes         text CHECK (char_length(after_notes) <= 2000),
  remind_day_before   boolean NOT NULL DEFAULT true,
  -- Rappel N heures avant (0 = aucun).
  remind_hours_before integer NOT NULL DEFAULT 2 CHECK (remind_hours_before BETWEEN 0 AND 48),
  -- Médicaments prescrits lors de ce rendez-vous (ids de meds).
  med_ids             jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(med_ids) = 'array'
                                                         AND octet_length(med_ids::text) <= 1000),
  version             bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX appointments_user_version ON appointments (user_id, version);
