-- Accès à LifeHub : e-mails autorisés par le propriétaire (ADMIN_EMAIL).
-- Chaque e-mail autorisé a son propre espace perso (données séparées par user_id).
-- Retirer un accès pose revoked_at : rien n'est supprimé, et un nouvel ajout le réactive.

CREATE TABLE app_users (
  email       text PRIMARY KEY CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  added_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
