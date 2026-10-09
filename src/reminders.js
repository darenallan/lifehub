// Rappels in-app (toasts) + notifications locales si l'utilisateur les a autorisées.
// Uniquement pendant que l'app est ouverte : pas de push serveur (objectif 0 coût, iOS limité).
import { showToast } from './components/toast.js';
import { dayKey } from './lib/dates.js';
import { dueReminders, taskBucket, timeKey } from './lib/tasks.js';
import { alertText, doseAlerts } from './lib/health/reminders.js';
import { appointmentAlerts, appointmentTitle, whenLabel } from './lib/health/care.js';
import {
  dayFromIndex,
  dayIndex,
  dosesForDay,
  missedDoses,
  nowStamp,
  parseStamp,
} from './lib/health/schedule.js';

const CHECK_MS = 30_000;
const FIRST_CHECK_MS = 3_000; // laisse la première sync arriver
const PREFIX = 'lifehub.reminded.';
const SUMMARY = 'summary';

function loadReminded(day) {
  try {
    return new Set(JSON.parse(localStorage.getItem(PREFIX + day) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** Garde seulement la liste du jour (les jours précédents ne servent plus). */
function saveReminded(day, reminded) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key !== PREFIX + day) localStorage.removeItem(key);
    }
    localStorage.setItem(PREFIX + day, JSON.stringify([...reminded]));
  } catch {
    // stockage indisponible : au pire, un rappel peut se répéter
  }
}

export function notificationsSupported() {
  return typeof Notification !== 'undefined';
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

async function notify(title, body, tag) {
  if (notificationPermission() !== 'granted') return;
  try {
    // Via le service worker : seule méthode acceptée par Chrome Android en PWA.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, { body, tag, icon: '/pwa-192.png' });
    } else {
      new Notification(title, { body, tag });
    }
  } catch {
    // notification refusée par le système : le toast in-app suffit
  }
}

const goToTasks = () => {
  location.hash = '#/tasks';
};

const goToHealth = () => {
  location.hash = '#/health';
};

/** Pastille sur l'icône de l'app (si le navigateur la gère) : prises à prendre ou manquées. */
function updateBadge(count) {
  try {
    if (count) navigator.setAppBadge?.(count)?.catch(() => {});
    else navigator.clearAppBadge?.()?.catch(() => {});
  } catch {
    // API absente ou refusée : sans conséquence
  }
}

/** Rappels de prise. En mode discret, ni le toast ni la notification ne nomment le médicament. */
async function checkDoses(engine, reminded) {
  const [meds, logs] = await Promise.all([engine.getAll('med'), engine.getAll('doseLog')]);
  const now = parseStamp(nowStamp());
  const pending = dosesForDay(meds, logs, dayKey(), now).filter((d) => d.status === 'due');
  updateBadge(pending.length + missedDoses(meds, logs, now).length);

  for (const alert of doseAlerts(meds, logs, now, reminded)) {
    const { title, body } = alertText(alert);
    showToast(`💊 ${title} · ${body}`, {
      actionLabel: 'Voir',
      onAction: goToHealth,
      persistent: true,
    });
    notify(title, body, `dose-${alert.occurrence.date}-${alert.occurrence.time}`);
    reminded.add(alert.id);
  }
}

/** Rappels de rendez-vous médicaux (la veille et quelques heures avant). */
async function checkAppointments(engine, reminded) {
  const [appointments, doctors] = await Promise.all([
    engine.getAll('appointment'),
    engine.getAll('doctor'),
  ]);
  const now = nowStamp();
  const today = now.slice(0, 10);
  const tomorrow = dayFromIndex(dayIndex(today) + 1);
  for (const { id, appointment } of appointmentAlerts(appointments, parseStamp(now), reminded)) {
    const title = `Rendez-vous : ${appointmentTitle(appointment, doctors)}`;
    const body = whenLabel(appointment.at, today, tomorrow);
    showToast(`📅 ${title} · ${body}`, {
      actionLabel: 'Voir',
      onAction: goToCare,
      persistent: true,
    });
    notify(title, body, id);
    reminded.add(id);
  }
}

const goToCare = () => {
  location.hash = '#/health/care';
};

/** Démarre la surveillance ; retourne la fonction d'arrêt. */
export function startReminders(engine) {
  let stopped = false;

  async function check() {
    if (stopped) return;
    const today = dayKey();
    const reminded = loadReminded(today);
    const tasks = await engine.getAll('task');

    if (!reminded.has(SUMMARY)) {
      const count = tasks.filter((t) => ['overdue', 'today'].includes(taskBucket(t, today))).length;
      if (count) {
        showToast(`${count} tâche(s) pour aujourd'hui`, {
          actionLabel: 'Voir',
          onAction: goToTasks,
        });
        reminded.add(SUMMARY);
      }
    }

    for (const task of dueReminders(tasks, today, timeKey(), reminded)) {
      showToast(`⏰ ${task.title}`, { actionLabel: 'Voir', onAction: goToTasks, persistent: true });
      notify('Rappel LifeHub', `${task.title} · ${task.dueTime}`, task.id);
      reminded.add(task.id);
    }

    await checkDoses(engine, reminded);
    await checkAppointments(engine, reminded);
    saveReminded(today, reminded);
  }

  const run = () => check().catch((err) => console.error(err));
  const first = setTimeout(run, FIRST_CHECK_MS);
  const interval = setInterval(run, CHECK_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}
