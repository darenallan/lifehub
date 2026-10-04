// Rappels in-app (toasts) + notifications locales si l'utilisateur les a autorisées.
// Uniquement pendant que l'app est ouverte : pas de push serveur (objectif 0 coût, iOS limité).
import { showToast } from './components/toast.js';
import { dayKey } from './lib/dates.js';
import { dueReminders, taskBucket, timeKey } from './lib/tasks.js';

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
