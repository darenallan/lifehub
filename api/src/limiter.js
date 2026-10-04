// Limiteur en mémoire par clé (uid) et fenêtre fixe. Complète le rate limit par IP :
// un même compte ne peut pas saturer l'API depuis plusieurs IP.
// En mémoire = par instance ; suffisant pour une seule instance Render gratuite.

export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  return function allow(key) {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      // Nettoyage opportuniste : la Map ne grossit pas indéfiniment.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}
