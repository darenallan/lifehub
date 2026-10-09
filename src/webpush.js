// Web Push (phase 7.6a) : abonnement de cet appareil et envoi du planning au serveur.
// Le planning est recalculé par la boucle des rappels et n'est renvoyé que s'il a changé.
import { planReminders, planSignature, wallToDate } from './lib/health/pushPlan.js';
import { nowStamp, parseStamp } from './lib/health/schedule.js';
import {
  pushPublicKey,
  revokePushDevice,
  savePushSubscription,
  sendPushSchedule,
} from './repos/push.js';

const KEY = 'lifehub.push'; // { id, signature } : abonnement de cet appareil

function readState() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // stockage indisponible : l'appareil se réabonnera au besoin
  }
}

export function pushSupported() {
  return (
    'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
  );
}

export const pushDeviceId = () => readState()?.id ?? null;

/** Clé VAPID publique (base64url) → octets attendus par pushManager.subscribe. */
function keyBytes(base64url) {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Navigateur';
}

/** Demande la permission, abonne l'appareil et l'enregistre côté serveur. false si refus. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(await pushPublicKey()),
    }));
  const { endpoint, keys } = subscription.toJSON();
  const id = await savePushSubscription({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    label: deviceLabel(),
  });
  writeState({ id, signature: null });
  return true;
}

/** Désabonne cet appareil (navigateur + serveur). */
export async function disablePush() {
  const state = readState();
  writeState(null);
  try {
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // déjà désabonné côté navigateur
  }
  if (state?.id) await revokePushDevice(state.id);
}

/** Envoie le planning des 7 prochains jours si l'appareil est abonné et qu'il a changé. */
export async function syncPushSchedule(engine) {
  const state = readState();
  if (!state?.id || !navigator.onLine) return;
  const [meds, logs, appointments] = await Promise.all([
    engine.getAll('med'),
    engine.getAll('doseLog'),
    engine.getAll('appointment'),
  ]);
  const plan = planReminders(meds, logs, appointments, parseStamp(nowStamp()));
  const signature = planSignature(plan);
  if (signature === state.signature) return;
  await sendPushSchedule(
    plan.map((r) => ({ tag: r.tag, kind: r.kind, fireAt: wallToDate(r.at).toISOString() })),
  );
  writeState({ ...state, signature });
}
