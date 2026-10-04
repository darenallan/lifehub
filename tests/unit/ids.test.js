import { describe, expect, it } from 'vitest';
import { deterministicId } from '../../src/lib/ids.js';

// Même motif que l'API (version 1–8, variante RFC).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicId', () => {
  it("produit un UUID v8 accepté par l'API", async () => {
    const id = await deterministicId('habit-check:u1:h1:2026-10-04');
    expect(id).toMatch(UUID);
    expect(id[14]).toBe('8');
  });

  it('est stable pour une même graine et différent sinon', async () => {
    const a = await deterministicId('habit-check:u1:h1:2026-10-04');
    expect(await deterministicId('habit-check:u1:h1:2026-10-04')).toBe(a);
    expect(await deterministicId('habit-check:u1:h1:2026-10-05')).not.toBe(a);
    expect(await deterministicId('habit-check:u2:h1:2026-10-04')).not.toBe(a);
  });
});
