import { describe, expect, it } from 'vitest';
import { assertConfig, loadConfig } from '../src/config.js';
import { checkValue, validatePatch } from '../src/validate.js';

describe('checkValue', () => {
  it.each([
    [{ type: 'integer', minimum: 1 }, 5, null],
    [{ type: 'integer', minimum: 1 }, 0, 'trop petit'],
    [{ type: 'integer' }, 2.5, 'doit être un entier'],
    [{ type: 'boolean' }, 'true', 'doit être un booléen'],
    [{ type: 'string', pattern: /^\d{4}$/ }, '2026', null],
    [{ type: 'string', pattern: /^\d{4}$/ }, '26', 'format invalide'],
    [{ type: 'string', nullable: true }, null, null],
    [{ type: 'string' }, null, 'ne peut pas être null'],
  ])('%j / %j', (schema, value, expected) => {
    expect(checkValue(schema, value)).toBe(expected);
  });
});

describe('validatePatch', () => {
  const fields = { name: { schema: { type: 'string', maxLength: 3 } } };

  it('refuse les clés héritées du prototype', () => {
    expect(validatePatch(fields, JSON.parse('{"__proto__": 1}'))).toEqual([
      'champ inconnu : __proto__',
    ]);
    expect(validatePatch(fields, { toString: 'x' })).toEqual(['champ inconnu : toString']);
  });

  it('refuse les non-objets', () => {
    expect(validatePatch(fields, [])).toHaveLength(1);
    expect(validatePatch(fields, null)).toHaveLength(1);
  });
});

describe('config', () => {
  it("refuse l'émulateur Auth en production", () => {
    const config = loadConfig({
      RENDER: 'true',
      FIREBASE_PROJECT_ID: 'p',
      ADMIN_EMAIL: 'a@b.c',
      DATABASE_URL: 'postgres://x',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    });
    expect(() => assertConfig(config)).toThrow(/interdit/);
  });

  it('exige DATABASE_URL sur Render et écoute en local sur 127.0.0.1', () => {
    expect(() =>
      assertConfig(loadConfig({ RENDER: 'true', FIREBASE_PROJECT_ID: 'p', ADMIN_EMAIL: 'a@b.c' })),
    ).toThrow(/DATABASE_URL/);
    expect(loadConfig({}).host).toBe('127.0.0.1');
  });
});
