import { svg } from './dom.js';

// Tracés 24×24, trait 1.75, sans remplissage.
const PATHS = {
  today: [
    'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
  ],
  habits: ['M4 4h16v16H4z', 'M8 12l3 3l5-6'],
  expenses: ['M3 7h18v12H3z', 'M3 7l3-3h12l3 3', 'M16 13h2'],
  tasks: ['M9 6h11M9 12h11M9 18h11', 'M4 6l1 1l2-2M4 12l1 1l2-2M4 18l1 1l2-2'],
  house: ['M3 11l9-7l9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  settings: ['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12', 'M14 4v4M8 10v4M16 16v4'],
  more: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4l4 4', 'M6 12h10'],
  cloudOff: ['M3 3l18 18', 'M8 7a6 6 0 0 1 10 4a4 4 0 0 1 1 7.5M15 19H7a5 5 0 0 1-2-9.6'],
  sync: ['M20 11a8 8 0 0 0-14-5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14 5l2-2', 'M20 20v-4h-4'],
};

export function icon(name, { size = 22, label } = {}) {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'icon',
      'aria-hidden': label ? null : 'true',
      role: label ? 'img' : null,
      'aria-label': label ?? null,
    },
    (PATHS[name] ?? []).map((d) => svg('path', { d })),
  );
}
