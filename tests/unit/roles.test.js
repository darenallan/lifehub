import { describe, expect, it } from 'vitest';
import { resolveRole, ROLE } from '../../src/lib/roles.js';

const ADMIN_EMAIL = 'admin@example.com';
const user = (email, emailVerified = true) => ({ email, emailVerified });

describe('resolveRole', () => {
  it('null si déconnecté', () => {
    expect(resolveRole(null, ADMIN_EMAIL)).toBeNull();
  });

  it("admin si l'e-mail vérifié correspond (insensible à la casse)", () => {
    expect(resolveRole(user('Admin@Example.com'), ADMIN_EMAIL)).toBe(ROLE.ADMIN);
  });

  it('refuse un e-mail admin non vérifié', () => {
    expect(resolveRole(user(ADMIN_EMAIL, false), ADMIN_EMAIL)).toBe(ROLE.UNAUTHORIZED);
  });

  it('refuse un compte inconnu', () => {
    expect(resolveRole(user('x@example.com'), ADMIN_EMAIL)).toBe(ROLE.UNAUTHORIZED);
  });

  it('refuse tout le monde si ADMIN_EMAIL est vide', () => {
    expect(resolveRole(user(''), '')).toBe(ROLE.UNAUTHORIZED);
  });
});
