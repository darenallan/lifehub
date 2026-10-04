// Aides partagées par les onglets de la maison.

const API_MESSAGES = {
  house_exists: 'Une maison existe déjà.',
  already_member: 'Cette personne est déjà membre.',
  invalid_email: 'Adresse e-mail invalide.',
  self_invite: "Tu ne peux pas t'inviter toi-même.",
  not_found: 'Introuvable (déjà retiré ?).',
};

/** Erreur d'une action en ligne (création, invitation…) → message lisible. */
export function apiErrorMessage(err) {
  if (err?.status === 0) return 'Connexion internet requise pour cette action.';
  return API_MESSAGES[err?.code] ?? 'Action impossible pour le moment.';
}

export function memberName(members, userId) {
  const member = members.find((m) => m.userId === userId);
  return member ? member.displayName || member.email : 'un ancien membre';
}

/** Ajoute un compteur discret à droite du titre d'une carte. */
export function withMeta(cardEl, text) {
  const meta = document.createElement('span');
  meta.className = 'card__meta';
  meta.textContent = text;
  cardEl.querySelector('.card__title').append(meta);
  return cardEl;
}
