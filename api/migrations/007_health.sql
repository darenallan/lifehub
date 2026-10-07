-- Phase 7.0 : module Santé (admin uniquement) : profil santé et contacts d'urgence.
-- Aucune valeur n'est pré-remplie : tout est saisi par l'utilisateur.

-- Singleton par utilisateur (docId 'me'), comme profiles.
CREATE TABLE health_profiles (
  user_id            text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 128),
  blood_group        text CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  -- Listes saisies librement (une par ligne) : affichées telles quelles sur la carte d'urgence.
  allergies          text CHECK (char_length(allergies) <= 500),
  conditions         text CHECK (char_length(conditions) <= 500),
  emergency_notes    text CHECK (char_length(emergency_notes) <= 300),
  height_cm          integer CHECK (height_cm BETWEEN 50 AND 250),
  doctor_name        text CHECK (char_length(doctor_name) <= 60),
  doctor_phone       text CHECK (doctor_phone ~ '^\+?[0-9][0-9 .()-]{3,22}$'),
  -- Jour où l'avertissement « ne remplace pas un médecin » a été lu.
  disclaimer_seen_on text CHECK (disclaimer_seen_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  version            bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX health_profiles_user_version ON health_profiles (user_id, version);

-- Une ligne par contact : deux appareils peuvent en ajouter sans conflit.
CREATE TABLE emergency_contacts (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  phone       text NOT NULL CHECK (phone ~ '^\+?[0-9][0-9 .()-]{3,22}$'),
  relation    text CHECK (char_length(relation) <= 40),
  sort_order  integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  version     bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX emergency_contacts_user_version ON emergency_contacts (user_id, version);
