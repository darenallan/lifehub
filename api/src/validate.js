// Validation des patchs envoyés par le client. Postgres revérifie avec ses contraintes CHECK.

/** Retourne la liste des erreurs (vide si valide). */
export function validatePatch(fields, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return ['data doit être un objet'];
  }
  const keys = Object.keys(data);
  if (keys.length === 0) return ['patch vide'];

  const errors = [];
  for (const key of keys) {
    const field = Object.hasOwn(fields, key) ? fields[key] : null;
    if (!field) {
      errors.push(`champ inconnu : ${key}`);
      continue;
    }
    const error = checkValue(field.schema, data[key]);
    if (error) errors.push(`${key} : ${error}`);
  }
  return errors;
}

export function checkValue(schema, value) {
  if (value === null) return schema.nullable ? null : 'ne peut pas être null';
  if ('const' in schema) return value === schema.const ? null : `doit valoir ${schema.const}`;
  if (schema.enum) return schema.enum.includes(value) ? null : 'valeur non autorisée';

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return 'doit être une chaîne';
      if (schema.minLength != null && value.length < schema.minLength) return 'trop court';
      if (schema.maxLength != null && value.length > schema.maxLength) return 'trop long';
      if (schema.pattern && !schema.pattern.test(value)) return 'format invalide';
      return null;
    case 'integer':
      if (!Number.isSafeInteger(value)) return 'doit être un entier';
      if (schema.minimum != null && value < schema.minimum) return 'trop petit';
      if (schema.maximum != null && value > schema.maximum) return 'trop grand';
      return null;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'doit être un nombre';
      if (schema.minimum != null && value < schema.minimum) return 'trop petit';
      if (schema.maximum != null && value > schema.maximum) return 'trop grand';
      return schema.check ? schema.check(value) : null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'doit être un booléen';
    // Objet structuré (stocké en jsonb) : forme vérifiée par schema.check, qui ne doit jamais
    // recopier de valeur dans son message (les refus sont journalisés).
    case 'json':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return 'doit être un objet';
      }
      if (JSON.stringify(value).length > (schema.maxBytes ?? 4000)) return 'trop volumineux';
      return schema.check(value);
    default:
      return 'type non géré';
  }
}
