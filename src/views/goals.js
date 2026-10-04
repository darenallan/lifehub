// Carte « Objectifs du jour » (1 à 5), réutilisée par « Aujourd'hui » et « Tâches ».
import { reportError, showToast } from '../components/toast.js';
import { dayKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { MAX_GOALS } from '../lib/tasks.js';
import { addGoal, removeGoal, updateGoal, watchGoals } from '../repos/tasks.js';
import { card } from './common.js';

function goalRow(goal) {
  const text = h('input', {
    class: 'input input--bare',
    value: goal.text,
    maxlength: 120,
    'aria-label': `Objectif : ${goal.text}`,
    onchange: (e) => {
      const value = e.target.value.trim();
      if (!value) e.target.value = goal.text;
      else if (value !== goal.text) updateGoal(goal.id, { text: value }).catch(reportError);
    },
  });
  return h(
    'li',
    { class: `goal${goal.done ? ' is-done' : ''}` },
    h('button', {
      class: 'check',
      type: 'button',
      'aria-pressed': String(goal.done),
      'aria-label': `${goal.done ? 'Décocher' : 'Cocher'} « ${goal.text} »`,
      onclick: () => updateGoal(goal.id, { done: !goal.done }).catch(reportError),
    }),
    text,
    h(
      'button',
      {
        class: 'icon-btn icon-btn--sm icon-btn--quiet',
        type: 'button',
        'aria-label': `Retirer « ${goal.text} »`,
        onclick: () => removeGoal(goal.id).catch(reportError),
      },
      '×',
    ),
  );
}

/** Retourne { el, cleanup }. */
export function goalsCard({ day = dayKey(), footer } = {}) {
  let goals = [];
  let renderLater = false;
  const counter = h('span', { class: 'card__meta' });
  const list = h('ul', { class: 'goals' });
  const input = h('input', {
    class: 'input',
    maxlength: 120,
    placeholder: "Ajouter un objectif pour aujourd'hui",
    'aria-label': 'Nouvel objectif du jour',
  });
  const form = h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        addGoal(day, text, goals).catch((err) =>
          err instanceof Error && err.message.includes('5 objectifs')
            ? showToast(err.message)
            : reportError(err),
        );
        input.value = '';
      },
    },
    input,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
  );

  function render() {
    // Pas de reconstruction pendant qu'on modifie le texte d'un objectif.
    const focused = document.activeElement;
    if (list.contains(focused) && focused.tagName === 'INPUT') {
      renderLater = true;
      return;
    }
    renderLater = false;
    const done = goals.filter((g) => g.done).length;
    counter.textContent = goals.length ? `${done}/${goals.length}` : '';
    mount(list, goals.map(goalRow));
    form.hidden = goals.length >= MAX_GOALS;
  }
  list.addEventListener('focusout', () => setTimeout(() => renderLater && render(), 0));

  const el = card({
    title: 'Objectifs du jour',
    iconName: 'today',
    body: [
      list,
      form,
      h(
        'p',
        { class: 'muted goals__hint' },
        `Jusqu'à ${MAX_GOALS} objectifs, pour rester réaliste.`,
      ),
    ],
    footer,
  });
  el.querySelector('.card__title').append(counter);

  const cleanup = watchGoals(
    day,
    (data) => {
      goals = data;
      render();
    },
    reportError,
  );
  return { el, cleanup };
}
