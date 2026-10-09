-- Phase 7.6a : Web Push (rappels app fermée). Pas synchronisé par /api/sync : routes dédiées.

-- Un appareil abonné (navigateur / PWA installée). Révocable depuis Réglages.
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  endpoint    text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh      text NOT NULL CHECK (char_length(p256dh) BETWEEN 40 AND 200),
  auth        text NOT NULL CHECK (char_length(auth) BETWEEN 10 AND 100),
  label       text CHECK (char_length(label) <= 60),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Planning des 7 prochains jours, envoyé par l'appareil et remplacé à chaque envoi.
-- Aucun nom de médicament ni valeur : seulement l'heure, le type et un identifiant opaque.
CREATE TABLE push_reminders (
  user_id  text NOT NULL,
  tag      text NOT NULL CHECK (tag ~ '^[A-Za-z0-9|:_-]{1,120}$'),
  kind     text NOT NULL CHECK (kind IN ('dose', 'appointment')),
  fire_at  timestamptz NOT NULL,
  sent_at  timestamptz,
  PRIMARY KEY (user_id, tag)
);
