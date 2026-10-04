import { auth } from './firebase.js';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
// Render (offre gratuite) s'endort : le premier appel peut prendre ~1 min.
const DEFAULT_TIMEOUT_MS = 70_000;

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status; // 0 = réseau / délai dépassé
    this.code = body?.error ?? null;
  }
}

async function request(path, { method, body, token, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0);
  } finally {
    clearTimeout(timer);
  }
}

/** Appel authentifié. Un 401 force un rafraîchissement du jeton puis une seconde tentative. */
export async function api(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, { error: 'signed_out' });

  let res = await request(path, { method, body, timeoutMs, token: await user.getIdToken() });
  if (res.status === 401) {
    res = await request(path, { method, body, timeoutMs, token: await user.getIdToken(true) });
  }
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
