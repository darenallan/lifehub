import { deleteDatabase, openDatabase, request, transaction } from '../lib/idb.js';
import { keyOf, mergePatch, nextRetryDelay, planServerChanges } from './merge.js';

const BATCH = 100; // = maxItems côté API
const dbName = (uid) => `lifehub-${uid}`;

function openLocalDb(uid) {
  return openDatabase(dbName(uid), 1, (db) => {
    db.createObjectStore('docs', { keyPath: 'key' }).createIndex('collection', 'collection');
    db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    db.createObjectStore('meta', { keyPath: 'k' });
  });
}

export const deleteLocalData = (uid) => deleteDatabase(dbName(uid));

/**
 * Base locale (IndexedDB) + file d'écritures (outbox) synchronisée avec l'API.
 * Les vues lisent et écrivent toujours en local ; le réseau ne bloque jamais l'UI.
 *
 * send(body) → réponse de POST /api/sync
 * onPending(n), onRejected(list), onStatus('syncing'|'idle'|'error', err?)
 */
export async function createSyncEngine({ uid, send, onPending, onRejected, onStatus }) {
  const db = await openLocalDb(uid);
  const listeners = new Map();
  let running = false;
  let again = false;
  let timer = null;
  let retryDelay = 0;
  let closed = false;

  function notify(collection) {
    for (const fn of listeners.get(collection) ?? []) fn();
  }

  function subscribe(collection, fn) {
    if (!listeners.has(collection)) listeners.set(collection, new Set());
    listeners.get(collection).add(fn);
    return () => listeners.get(collection)?.delete(fn);
  }

  async function get(collection, id) {
    const row = await transaction(db, ['docs'], 'readonly', ({ docs }) =>
      request(docs.get(keyOf(collection, id))),
    );
    return row?.data ?? null;
  }

  async function getAll(collection) {
    const rows = await transaction(db, ['docs'], 'readonly', ({ docs }) =>
      request(docs.index('collection').getAll(collection)),
    );
    return rows.map((r) => ({ id: r.id, ...r.data }));
  }

  async function enqueue(collection, id, op, data) {
    const key = keyOf(collection, id);
    await transaction(db, ['docs', 'outbox'], 'readwrite', async ({ docs, outbox }) => {
      if (op === 'delete') {
        docs.delete(key);
      } else {
        const row = await request(docs.get(key));
        docs.put({
          key,
          collection,
          id,
          data: mergePatch(row?.data, data),
          version: row?.version ?? null,
        });
      }
      outbox.add({
        mutation: { id: crypto.randomUUID(), collection, docId: id, op, ...(data && { data }) },
      });
    });
    notify(collection);
    await refreshPending();
    schedule(300);
  }

  const patch = (collection, id, data) => enqueue(collection, id, 'patch', data);
  const remove = (collection, id) => enqueue(collection, id, 'delete');

  async function refreshPending() {
    const n = await transaction(db, ['outbox'], 'readonly', ({ outbox }) =>
      request(outbox.count()),
    );
    onPending?.(n);
  }

  function schedule(ms = 0) {
    clearTimeout(timer);
    timer = setTimeout(syncNow, ms);
  }

  async function syncNow() {
    if (closed) return;
    if (running) {
      again = true;
      return;
    }
    if (!navigator.onLine) return;
    running = true;
    onStatus?.('syncing');
    try {
      let more;
      do {
        again = false;
        more = await syncOnce();
      } while ((more || again) && !closed);
      retryDelay = 0;
      onStatus?.('idle');
    } catch (err) {
      onStatus?.('error', err);
      // 401/403 : inutile d'insister, l'écran d'auth prend le relais.
      if (err?.status !== 401 && err?.status !== 403) {
        retryDelay = nextRetryDelay(retryDelay);
        schedule(retryDelay);
      }
    } finally {
      running = false;
    }
  }

  async function syncOnce() {
    const { entries, cursor } = await transaction(
      db,
      ['outbox', 'meta'],
      'readonly',
      async ({ outbox, meta }) => ({
        entries: await request(outbox.getAll(undefined, BATCH)),
        cursor: (await request(meta.get('cursor')))?.v ?? '0',
      }),
    );

    const res = await send({ cursor, mutations: entries.map((e) => e.mutation) });
    const rejectedIds = new Set(res.rejected.map((r) => r.id));
    const done = new Set([...res.applied, ...rejectedIds]);
    const touched = new Set();

    await transaction(
      db,
      ['outbox', 'docs', 'meta'],
      'readwrite',
      async ({ outbox, docs, meta }) => {
        for (const e of entries) if (done.has(e.mutation.id)) outbox.delete(e.seq);
        const remaining = await request(outbox.getAll());
        const pendingKeys = new Set(
          remaining.map((e) => keyOf(e.mutation.collection, e.mutation.docId)),
        );

        for (const op of planServerChanges(res.changes, pendingKeys)) {
          if (op.type === 'put') docs.put(op.row);
          else docs.delete(op.key);
          touched.add(op.collection);
        }

        // Écriture refusée : on jette la version locale et on retire tout depuis le début.
        for (const e of entries) {
          const key = keyOf(e.mutation.collection, e.mutation.docId);
          if (rejectedIds.has(e.mutation.id) && !pendingKeys.has(key)) {
            docs.delete(key);
            touched.add(e.mutation.collection);
          }
        }
        meta.put({ k: 'cursor', v: rejectedIds.size ? '0' : res.cursor });
      },
    );

    if (rejectedIds.size) onRejected?.(res.rejected);
    touched.forEach(notify);
    await refreshPending();
    return entries.length === BATCH || res.hasMore || rejectedIds.size > 0;
  }

  function close() {
    closed = true;
    clearTimeout(timer);
    listeners.clear();
    db.close();
  }

  await refreshPending();
  return { get, getAll, patch, remove, subscribe, syncNow, close };
}
