// Appli Android (Capacitor, phase 7.6b) : connexion Google native et alarmes locales exactes.
// Dans le navigateur, rien ici n'est chargé : les plugins ne sont importés que dans l'appli,
// où Capacitor injecte window.Capacitor.
import { planReminders, planSignature, wallToDate } from './lib/health/pushPlan.js';
import { nowStamp, parseStamp } from './lib/health/schedule.js';

const ALARMS = 'lifehub.alarms'; // { enabled, signature }

export const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());

// ---------- Connexion Google ----------

let socialLogin = null;

/** Le plugin, initialisé une fois avec l'ID client Web (le même que Firebase Auth). */
function googlePlugin() {
  socialLogin ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    await SocialLogin.initialize({
      google: { webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID },
    });
    return SocialLogin;
  });
  return socialLogin;
}

/**
 * Connexion Google native (Credential Manager) → jeton d'identité Google, que le SDK web
 * Firebase échange ensuite (signInWithCredential) : l'API reçoit le même jeton qu'en web.
 */
export async function nativeGoogleIdToken() {
  const SocialLogin = await googlePlugin();
  const res = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
  const idToken = res.result?.idToken;
  if (!idToken) {
    throw Object.assign(new Error('Connexion Google annulée.'), { code: 'native/no-token' });
  }
  return idToken;
}

/** Oublie le compte choisi, pour pouvoir en changer à la prochaine connexion. */
export async function nativeGoogleLogout() {
  if (!isNative()) return;
  try {
    await (await googlePlugin()).logout({ provider: 'google' });
  } catch {
    // aucune session native : rien à faire
  }
}

// ---------- Alarmes locales ----------

function readAlarms() {
  try {
    return JSON.parse(localStorage.getItem(ALARMS) ?? 'null');
  } catch {
    return null;
  }
}

function writeAlarms(state) {
  try {
    if (state) localStorage.setItem(ALARMS, JSON.stringify(state));
    else localStorage.removeItem(ALARMS);
  } catch {
    // stockage indisponible : les alarmes seront reprogrammées au prochain tour
  }
}

export const alarmsEnabled = () => Boolean(readAlarms()?.enabled);

const localNotifications = () =>
  import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

/** Identifiant numérique stable (entier Java positif) dérivé de l'étiquette du rappel. */
export function alarmId(tag) {
  let hash = 5381;
  for (const char of tag) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return hash & 0x7fffffff;
}

const TEXT = {
  dose: { body: "C'est l'heure d'une prise.", url: '#/health' },
  appointment: { body: 'Rappel de rendez-vous.', url: '#/health/care' },
};

async function cancelPending(LocalNotifications) {
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) {
    await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
  }
}

/** Reprogramme les 7 prochains jours d'alarmes si le planning a changé (aucun réseau requis). */
export async function syncLocalAlarms(engine) {
  const state = readAlarms();
  if (!isNative() || !state?.enabled) return;
  const [meds, logs, appointments] = await Promise.all([
    engine.getAll('med'),
    engine.getAll('doseLog'),
    engine.getAll('appointment'),
  ]);
  const plan = planReminders(meds, logs, appointments, parseStamp(nowStamp()));
  const signature = planSignature(plan);
  if (signature === state.signature) return;

  const LocalNotifications = await localNotifications();
  await cancelPending(LocalNotifications);
  if (plan.length) {
    await LocalNotifications.schedule({
      notifications: plan.map((r) => ({
        id: alarmId(r.tag),
        title: 'LifeHub',
        body: TEXT[r.kind].body,
        schedule: { at: wallToDate(r.at), allowWhileIdle: true },
        extra: { url: TEXT[r.kind].url },
      })),
    });
  }
  writeAlarms({ ...state, signature });
}

/**
 * Active les alarmes : permission de notifier, puis (Android 12+) « Alarmes et rappels »
 * pour qu'elles sonnent à la minute près. Retourne { granted, exact }.
 */
export async function enableAlarms(engine) {
  const LocalNotifications = await localNotifications();
  const { display } = await LocalNotifications.requestPermissions();
  if (display !== 'granted') return { granted: false, exact: false };
  let exact = true;
  try {
    const setting = await LocalNotifications.checkExactNotificationSetting();
    exact = setting.exact_alarm === 'granted';
    if (!exact) await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // versions d'Android sans ce réglage : alarmes exactes autorisées d'office
  }
  writeAlarms({ enabled: true, signature: null });
  await syncLocalAlarms(engine);
  return { granted: true, exact };
}

export async function disableAlarms() {
  writeAlarms(null);
  await cancelPending(await localNotifications());
}

/** Au toucher d'une alarme : ouvrir la bonne page. À appeler une fois au démarrage. */
export async function listenAlarmTaps() {
  if (!isNative()) return;
  const LocalNotifications = await localNotifications();
  await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const url = notification.extra?.url;
    if (typeof url === 'string' && url.startsWith('#/')) location.hash = url;
  });
}
