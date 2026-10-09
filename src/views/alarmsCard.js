// Réglages (appli Android) · « Alarmes de l'appli » : rappels exacts, même sans réseau (7.6b).
import { reportError, showToast } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { alarmsEnabled, disableAlarms, enableAlarms } from '../native.js';
import { getEngine } from '../session.js';
import { card } from './common.js';

export function alarmsCard() {
  const body = h('div', { class: 'stack' });
  const el = card({ title: "Alarmes de l'appli", iconName: 'today', body });

  async function enable() {
    const { granted, exact } = await enableAlarms(getEngine());
    if (!granted) {
      showToast('Notifications refusées : autorise-les dans les réglages Android.', {
        tone: 'danger',
      });
    } else if (exact) {
      showToast('Alarmes activées.');
    } else {
      showToast("Alarmes activées. Autorise « Alarmes et rappels » pour l'heure exacte.");
    }
  }

  async function toggle() {
    try {
      if (alarmsEnabled()) {
        await disableAlarms();
        showToast('Alarmes désactivées.');
      } else {
        await enable();
      }
    } catch (err) {
      reportError(err);
    }
    render();
  }

  function render() {
    const on = alarmsEnabled();
    mount(
      body,
      h(
        'p',
        { class: 'muted' },
        on
          ? 'Activées : prises et rendez-vous des 7 prochains jours, même sans réseau.'
          : "Reçois une alarme à l'heure de chaque prise et avant tes rendez-vous, même sans réseau.",
      ),
      h(
        'button',
        { class: `btn ${on ? 'btn--ghost' : 'btn--primary'}`, type: 'button', onclick: toggle },
        on ? 'Désactiver les alarmes' : 'Activer les alarmes',
      ),
      h(
        'p',
        { class: 'field__hint' },
        "Ouvre l'appli au moins une fois par semaine : les alarmes sont programmées 7 jours à l'avance. Si ton téléphone économise la batterie, exclus LifeHub de l'optimisation.",
      ),
    );
  }

  render();
  return { el, cleanup: () => {} };
}
