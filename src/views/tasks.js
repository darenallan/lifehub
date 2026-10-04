import { reportError } from '../components/toast.js';
import { dayKey, formatLongDate, parseDayKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { dueLabel, RECURRENCES, taskBucket, tasksForView } from '../lib/tasks.js';
import { notificationPermission, requestNotifications } from '../reminders.js';
import { addTask, setTaskDone, watchTasks } from '../repos/tasks.js';
import { card } from './common.js';
import { goalsCard } from './goals.js';
import { openTaskEditor } from './taskSheet.js';

const VIEWS = [
  { key: 'today', label: "Aujourd'hui", href: '#/tasks' },
  { key: 'upcoming', label: 'À venir', href: '#/tasks/upcoming' },
  { key: 'done', label: 'Terminées', href: '#/tasks/done' },
];

const SECTION_TITLES = {
  overdue: 'En retard',
  today: "Aujourd'hui",
  upcoming: 'À venir',
  someday: 'Sans date',
};

const EMPTY = {
  today: "Rien d'urgent aujourd'hui. Ajoute une tâche ou profite !",
  upcoming: 'Aucune tâche à venir.',
  done: 'Aucune tâche terminée pour le moment.',
};

const recurrenceLabel = (value) => RECURRENCES.find((r) => r.value === value)?.label;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ligne de tâche : case à cocher + titre cliquable (ouvre l'édition). */
export function taskRow(task, today) {
  const meta = [
    dueLabel(task, today),
    task.recurrence ? `↻ ${recurrenceLabel(task.recurrence)}` : null,
    task.done && task.doneOn ? `Fait le ${formatLongDate(parseDayKey(task.doneOn))}` : null,
  ].filter(Boolean);
  const overdue = taskBucket(task, today) === 'overdue';

  return h(
    'li',
    { class: `task${task.done ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}` },
    h('button', {
      class: 'check',
      type: 'button',
      'aria-pressed': String(task.done),
      'aria-label': `${task.done ? 'Rouvrir' : 'Terminer'} « ${task.title} »`,
      onclick: () => setTaskDone(task, !task.done).catch(reportError),
    }),
    h(
      'button',
      { class: 'task__body', type: 'button', onclick: () => openTaskEditor(task) },
      h(
        'span',
        { class: 'task__title' },
        task.priority === 1 && !task.done
          ? h('span', { class: 'priority', title: 'Priorité haute' }, '!')
          : null,
        task.title,
      ),
      meta.length ? h('span', { class: 'task__meta' }, meta.join(' · ')) : null,
    ),
  );
}

/** Regroupe les tâches d'un onglet par section (en retard, aujourd'hui, à venir, sans date). */
function sections(tasks, view, today) {
  if (view === 'done') return [{ key: 'done', tasks }];
  const groups = new Map();
  for (const t of tasks) {
    const key = taskBucket(t, today);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, tasks: items }));
}

function notificationPrompt(onChange) {
  if (notificationPermission() !== 'default') return null;
  return h(
    'div',
    { class: 'notice' },
    h('p', {}, "Active les rappels pour être prévenu à l'heure de tes tâches (app ouverte)."),
    h(
      'button',
      {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onclick: () => requestNotifications().then(onChange),
      },
      'Activer les rappels',
    ),
  );
}

export function renderTasks(outlet, { params }) {
  const today = dayKey();
  const view = VIEWS.some((v) => v.key === params[0]) ? params[0] : 'today';
  const defaultDue = view === 'today' ? today : null;
  let tasks = [];

  const goals = view === 'today' ? goalsCard() : null;

  const quickInput = h('input', {
    class: 'input',
    maxlength: 200,
    placeholder: view === 'today' ? "Nouvelle tâche pour aujourd'hui" : 'Nouvelle tâche',
    'aria-label': 'Nouvelle tâche',
  });
  const quickForm = h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const title = quickInput.value.trim();
        if (!title) return;
        addTask({ title, dueDate: defaultDue }).catch(reportError);
        quickInput.value = '';
      },
    },
    quickInput,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
    h(
      'button',
      {
        class: 'btn btn--ghost',
        type: 'button',
        'aria-label': 'Ajouter avec date, heure et répétition',
        title: 'Plus d’options',
        onclick: () => openTaskEditor(null, { dueDate: defaultDue }),
      },
      '…',
    ),
  );

  const tabs = h(
    'nav',
    { class: 'tabs', 'aria-label': 'Vues des tâches' },
    VIEWS.map((v) =>
      h(
        'a',
        { class: 'tabs__tab', href: v.href, 'aria-current': v.key === view ? 'page' : null },
        v.label,
      ),
    ),
  );

  const prompt = h('div');
  const list = h('div', { class: 'stack' });
  const renderPrompt = () => mount(prompt, notificationPrompt(renderPrompt));

  function renderList() {
    const visible = tasksForView(tasks, view, today);
    if (!visible.length) {
      mount(list, h('p', { class: 'empty' }, EMPTY[view]));
      return;
    }
    mount(
      list,
      sections(visible, view, today).map((s) =>
        h(
          'section',
          {},
          SECTION_TITLES[s.key]
            ? h('h3', { class: `section-title section-title--${s.key}` }, SECTION_TITLES[s.key])
            : null,
          h(
            'ul',
            { class: 'tasks' },
            s.tasks.map((t) => taskRow(t, today)),
          ),
        ),
      ),
    );
  }

  mount(
    outlet,
    h(
      'header',
      { class: 'page-header' },
      h('p', { class: 'eyebrow' }, capitalize(formatLongDate())),
      h('h1', { class: 'page-title' }, 'Tâches'),
    ),
    h(
      'div',
      { class: 'stack' },
      goals?.el,
      prompt,
      card({ title: 'Mes tâches', iconName: 'tasks', body: [tabs, quickForm, list] }),
    ),
  );
  renderPrompt();

  const unsubscribe = watchTasks((all) => {
    tasks = all;
    renderList();
  }, reportError);

  return () => {
    unsubscribe();
    goals?.cleanup();
  };
}
