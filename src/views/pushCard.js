// Réglages · « Rappels app fermée » (Web Push, phase 7.6a).
import { confirmDialog } from '../components/modal.js';
import { reportError, showToast } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { listPushDevices, revokePushDevice } from '../repos/push.js';
import { disablePush, enablePush, pushDeviceId, pushSupported } from '../webpush.js';
import { card } from './common.js';

const formatDay = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export function pushCard() {
  const body = h('div', { class: 'stack' });
  const el = card({ title: 'Rappels app fermée', iconName: 'today', body });
  let active = true;

  const hint = h(
    'p',
    { class: 'field__hint' },
    "Le contenu reste générique (« C'est l'heure d'une prise ») : aucun nom de médicament ne passe par les serveurs de notification. Le détail s'affiche dans l'app.",
  );

  function renderUnsupported() {
    mount(
      body,
      h('p', { class: 'muted' }, 'Ce navigateur ne gère pas les notifications push.'),
      h(
        'p',
        { class: 'field__hint' },
        "Sur iPhone : ouvre LifeHub dans Safari, « Partager » → « Sur l'écran d'accueil », puis active les rappels depuis l'app installée (iOS 16.4 ou plus).",
      ),
    );
  }

  async function toggle(enable) {
    try {
      if (!enable) {
        await disablePush();
        showToast('Rappels désactivés sur cet appareil.');
      } else if (await enablePush()) {
        showToast('Rappels activés sur cet appareil.');
      } else {
        showToast('Notifications refusées par le navigateur.', { tone: 'danger' });
      }
    } catch (err) {
      reportError(err);
    }
    await load();
  }

  async function removeDevice(device) {
    const ok = await confirmDialog({
      title: `Retirer « ${device.label ?? 'Appareil'} » ?`,
      message: "Cet appareil ne recevra plus de rappels quand l'app est fermée.",
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    if (device.id === pushDeviceId()) await disablePush();
    else await revokePushDevice(device.id);
    await load();
  }

  function deviceRow(device) {
    const here = device.id === pushDeviceId();
    return h(
      'li',
      { class: 'contact' },
      h(
        'div',
        { class: 'contact__text' },
        h('strong', {}, `${device.label ?? 'Appareil'}${here ? ' (celui-ci)' : ''}`),
        h('span', { class: 'muted' }, `Depuis le ${formatDay(device.createdOn)}`),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          onclick: () => removeDevice(device).catch(reportError),
        },
        'Retirer',
      ),
    );
  }

  function render(devices) {
    const here = devices.some((d) => d.id === pushDeviceId());
    mount(
      body,
      h(
        'p',
        { class: 'muted' },
        here
          ? 'Activés sur cet appareil : rappels de prises et de rendez-vous, même app fermée.'
          : "Reçois les rappels de prises et de rendez-vous même quand l'app est fermée.",
      ),
      h(
        'button',
        {
          class: `btn ${here ? 'btn--ghost' : 'btn--primary'}`,
          type: 'button',
          onclick: () => toggle(!here),
        },
        here ? 'Désactiver sur cet appareil' : 'Activer sur cet appareil',
      ),
      devices.length ? h('ul', { class: 'contact-list' }, devices.map(deviceRow)) : null,
      hint,
    );
  }

  async function load() {
    if (!pushSupported()) {
      renderUnsupported();
      return;
    }
    try {
      const devices = await listPushDevices();
      if (active) render(devices);
    } catch (err) {
      if (!active) return;
      if (err.status === 503) {
        mount(body, h('p', { class: 'muted' }, 'Pas encore configuré sur le serveur.'));
      } else if (err.status === 0) {
        mount(body, h('p', { class: 'muted' }, 'Connexion nécessaire pour gérer les rappels.'));
      } else {
        reportError(err);
      }
    }
  }

  load();
  return {
    el,
    cleanup: () => {
      active = false;
    },
  };
}
