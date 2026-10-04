// Données créées une seule fois par utilisateur, côté serveur (jamais en double entre appareils).

export const DEFAULT_CATEGORIES = [
  ['Alimentation', '🍽️', 'orange'],
  ['Transport', '🚕', 'blue'],
  ['Logement', '🏠', 'purple'],
  ['Factures', '💡', 'yellow'],
  ['Téléphone & internet', '📱', 'teal'],
  ['Santé', '🩺', 'red'],
  ['Loisirs', '🎉', 'pink'],
  ['Vêtements', '👕', 'green'],
  ['Famille & dons', '🎁', 'orange'],
  ['Autres', '📦', 'gray'],
];

/**
 * Crée les catégories par défaut si ce n'est pas déjà fait.
 * Le drapeau categories_seeded est posé dans la même transaction : si l'utilisateur
 * supprime ensuite toutes ses catégories, elles ne réapparaissent pas.
 */
export function seedDefaultCategories(db, uid) {
  return db.tx(async (q) => {
    const claimed = await q(
      `UPDATE profiles SET categories_seeded = true
       WHERE user_id = $1 AND NOT categories_seeded
       RETURNING 1`,
      [uid],
    );
    if (!claimed.length) return false;

    const values = [];
    const params = [uid];
    DEFAULT_CATEGORIES.forEach(([name, emoji, color], i) => {
      const p = params.length;
      values.push(`(gen_random_uuid(), $1, $${p + 1}, $${p + 2}, $${p + 3}, ${i})`);
      params.push(name, emoji, color);
    });
    await q(
      `INSERT INTO categories (id, user_id, name, emoji, color, sort_order) VALUES ${values.join(', ')}`,
      params,
    );
    return true;
  });
}
