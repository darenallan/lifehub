// Fenêtre de création / modification d'une tâche.
import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError } from '../components/toast.js';
import { h } from '../lib/dom.js';
import { PRIORITIES, RECURRENCES } from '../lib/tasks.js';
import { addTask, deleteTask, updateTask } from '../repos/tasks.js';

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
}

/** task absent = création, avec les valeurs par défaut `defaults`. */
export function openTaskEditor(task = null, defaults = {}) {
  const values = {
    priority: 2,
    dueDate: null,
    dueTime: null,
    recurrence: null,
    ...defaults,
    ...task,
  };

  const title = h('input', {
    class: 'input',
    maxlength: 200,
    required: true,
    value: values.title ?? '',
    placeholder: 'Que faut-il faire ?',
    'aria-label': 'Titre',
  });
  const priority = h(
    'select',
    { class: 'input' },
    PRIORITIES.map((p) =>
      h('option', { value: p.value, selected: p.value === values.priority }, p.label),
    ),
  );
  const dueDate = h('input', { class: 'input', type: 'date', value: values.dueDate ?? '' });
  const dueTime = h('input', { class: 'input', type: 'time', value: values.dueTime ?? '' });
  const recurrence = h(
    'select',
    { class: 'input' },
    RECURRENCES.map((r) =>
      h('option', { value: r.value ?? '', selected: r.value === values.recurrence }, r.label),
    ),
  );
  const error = h('p', { class: 'error', role: 'alert' });
  let dialog;

  const save = (e) => {
    e.preventDefault();
    const data = {
      title: title.value.trim(),
      priority: Number(priority.value),
      dueDate: dueDate.value || null,
      dueTime: dueTime.value || null,
      recurrence: recurrence.value || null,
    };
    if (!data.title) {
      error.textContent = 'Le titre est obligatoire.';
      return;
    }
    if ((data.dueTime || data.recurrence) && !data.dueDate) {
      error.textContent = "L'heure et la répétition demandent une date d'échéance.";
      return;
    }
    (task ? updateTask(task.id, data) : addTask(data)).catch(reportError);
    dialog.close();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette tâche ?',
      message: task.title,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    deleteTask(task.id).catch(reportError);
    dialog.close();
  };

  const content = h(
    'form',
    { class: 'stack', onsubmit: save },
    title,
    h(
      'div',
      { class: 'form-grid' },
      field('Priorité', priority),
      field('Répéter', recurrence),
      field('Échéance', dueDate),
      field('Heure de rappel', dueTime),
    ),
    error,
    h(
      'div',
      { class: 'row row--wrap modal__actions' },
      task
        ? h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, 'Supprimer')
        : null,
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
    ),
  );
  dialog = openDialog({ title: task ? 'Modifier la tâche' : 'Nouvelle tâche', content });
  title.focus();
}
