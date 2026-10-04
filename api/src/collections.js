// Registre des collections synchronisées. Chaque phase y ajoute ses tables.
// singleton : un seul document par utilisateur (docId 'me', clé = user_id).
// Sinon : docId = uuid généré par le client, colonne id + colonne propriétaire user_id.

export const COLLECTIONS = {
  profile: {
    table: 'profiles',
    singleton: true,
    roles: ['admin'],
    fields: {
      displayName: { column: 'display_name', schema: { type: 'string', maxLength: 60 } },
      currency: { column: 'currency', schema: { const: 'XOF' } },
      theme: { column: 'theme', schema: { enum: ['dark', 'light'] } },
    },
  },
};
