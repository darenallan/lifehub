// Médicaments : libellés, valeurs par défaut et mise en forme (logique pure, testée).
// Aucune base médicamenteuse, aucun conseil : seulement ce que l'utilisateur saisit.

export const MED_FORMS = {
  tablet: { label: 'Comprimé', unit: 'comprimé', emoji: '💊' },
  capsule: { label: 'Gélule', unit: 'gélule', emoji: '💊' },
  syrup: { label: 'Sirop', unit: 'ml', emoji: '🥄' },
  injection: { label: 'Injection', unit: 'dose', emoji: '💉' },
  drops: { label: 'Gouttes', unit: 'goutte', emoji: '💧' },
  cream: { label: 'Crème', unit: 'application', emoji: '🧴' },
  inhaler: { label: 'Inhalateur', unit: 'bouffée', emoji: '🌬️' },
  patch: { label: 'Patch', unit: 'patch', emoji: '🩹' },
  suppository: { label: 'Suppositoire', unit: 'suppositoire', emoji: '💊' },
  other: { label: 'Autre', unit: 'dose', emoji: '✚' },
};

export const INSTRUCTIONS = {
  before_meal: 'Avant le repas',
  with_meal: 'Pendant le repas',
  after_meal: 'Après le repas',
  fasting: 'À jeun',
  bedtime: 'Au coucher',
};

export const SCHEDULE_TYPES = {
  daily: 'Tous les jours',
  weekdays: 'Certains jours',
  everyNDays: 'Tous les N jours',
  everyNHours: 'Toutes les N heures',
  cycle: 'Cure (pause)',
  monthly: 'Une fois par mois',
  asNeeded: 'À la demande',
};

export const MED_COLORS = [
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'yellow',
  'teal',
  'pink',
  'gray',
];

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const DEFAULT_REMINDER = {
  enabled: true,
  advanceMin: 0,
  repeatEveryMin: 10,
  repeatCount: 2,
  snoozeMin: 15,
  discreet: false,
};

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** « 1 comprimé », « 0,5 comprimé », « 2 gélules », « 5 ml ». */
export function formatAmount(amount, unit) {
  const plural = amount >= 2 && /^[a-zà-ÿ]{4,}$/i.test(unit) && !/[sx]$/i.test(unit);
  return `${number.format(amount)} ${plural ? `${unit}s` : unit}`;
}

/** Saisie libre « 0,5 » / « 1.5 » / « ½ » → nombre (2 décimales max), ou null. */
export function parseAmount(text) {
  const raw = String(text ?? '')
    .trim()
    .replace('½', '0.5')
    .replace('¼', '0.25')
    .replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 && value <= 1000 ? value : null;
}

const listTimes = (times) =>
  times
    .map((t) => t.time)
    .sort()
    .join(', ');

/** Résumé lisible du planning. */
export function scheduleLabel(schedule) {
  const times = schedule.times ?? [];
  switch (schedule.type) {
    case 'daily':
      return `Tous les jours · ${listTimes(times)}`;
    case 'weekdays': {
      const days = [...schedule.weekdays].sort().map((d) => WEEKDAY_LABELS[d - 1]);
      return `${days.join(', ')} · ${listTimes(times)}`;
    }
    case 'everyNDays':
      return `Tous les ${schedule.interval} jours · ${listTimes(times)}`;
    case 'everyNHours':
      return `Toutes les ${schedule.interval} h dès ${times[0]?.time ?? ''}`;
    case 'cycle':
      return `${schedule.cycle.on} j de prise, ${schedule.cycle.off} j de pause · ${listTimes(times)}`;
    case 'monthly':
      return `Le ${schedule.monthDay} de chaque mois · ${listTimes(times)}`;
    case 'asNeeded':
      return schedule.maxPer24h
        ? `À la demande · ${schedule.maxPer24h} max / 24 h`
        : 'À la demande';
    default:
      return '';
  }
}

/** Moment de la journée d'un horaire 'HH:mm', pour regrouper les prises. */
export function dayPart(time) {
  const hour = Number(time.slice(0, 2));
  if (hour < 5) return 'Nuit';
  if (hour < 12) return 'Matin';
  if (hour < 17) return 'Après-midi';
  if (hour < 22) return 'Soir';
  return 'Nuit';
}

/** « Doliprane 500 mg » */
export function medTitle(med) {
  return med.strength ? `${med.name} ${med.strength}` : med.name;
}
