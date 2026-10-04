import { describe, expect, it } from 'vitest';
import { keyOf, mergePatch, nextRetryDelay, planServerChanges } from '../../src/sync/merge.js';

describe('mergePatch', () => {
  it('fusionne par champ sans muter', () => {
    const current = { theme: 'dark', displayName: 'A' };
    expect(mergePatch(current, { theme: 'light' })).toEqual({ theme: 'light', displayName: 'A' });
    expect(current.theme).toBe('dark');
    expect(mergePatch(null, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('planServerChanges', () => {
  const change = (docId, version, data = { v: version }) => ({
    collection: 'note',
    docId,
    version: String(version),
    data,
  });

  it('écrit les documents et supprime les pierres tombales', () => {
    const ops = planServerChanges([change('a', 1), change('b', 2, null)], new Set());
    expect(ops).toEqual([
      {
        type: 'put',
        key: 'note/a',
        collection: 'note',
        row: { key: 'note/a', collection: 'note', id: 'a', data: { v: 1 }, version: '1' },
      },
      { type: 'delete', key: 'note/b', collection: 'note' },
    ]);
  });

  it('ignore les documents avec écritures locales en attente', () => {
    const ops = planServerChanges([change('a', 1), change('b', 2)], new Set([keyOf('note', 'a')]));
    expect(ops.map((o) => o.key)).toEqual(['note/b']);
  });

  it('garde la version la plus récente en cas de doublon', () => {
    const ops = planServerChanges([change('a', 9), change('a', 3)], new Set());
    expect(ops).toHaveLength(1);
    expect(ops[0].row.version).toBe('9');
  });
});

describe('nextRetryDelay', () => {
  it('double et plafonne à 5 min', () => {
    expect(nextRetryDelay(0)).toBe(5000);
    expect(nextRetryDelay(5000)).toBe(10000);
    expect(nextRetryDelay(240000)).toBe(300000);
    expect(nextRetryDelay(300000)).toBe(300000);
  });
});
