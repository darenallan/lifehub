// Graphiques SVG maison. Couleurs via classes CSS (pas de style inline : CSP).
import { h, svg } from './dom.js';

const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Anneau de progression avec le % au centre. */
export function ring(value, { size = 132, stroke = 12, label } = {}) {
  const pct = clamp(value);
  const c = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const text = `${Math.round(pct * 100)} %`;

  return svg(
    'svg',
    {
      viewBox: `0 0 ${size} ${size}`,
      width: size,
      height: size,
      class: 'ring',
      role: 'img',
      'aria-label': label ? `${label} : ${text}` : text,
    },
    svg('circle', { class: 'ring__track', cx: c, cy: c, r, 'stroke-width': stroke, fill: 'none' }),
    pct > 0
      ? svg('circle', {
          class: 'ring__value',
          cx: c,
          cy: c,
          r,
          'stroke-width': stroke,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-dasharray': `${circumference * pct} ${circumference}`,
          transform: `rotate(-90 ${c} ${c})`,
        })
      : null,
    svg(
      'text',
      { class: 'ring__label', x: c, y: c, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
      text,
    ),
  );
}

/**
 * Histogramme. items : [{ label, value: 0..1, title, highlight }].
 * Les étiquettes sont en HTML sous le SVG (lisibles quelle que soit la largeur).
 */
export function barChart(items, { height = 80, label, showLabels = true } = {}) {
  const w = 10;
  const chart = svg(
    'svg',
    {
      viewBox: `0 0 ${items.length * w} ${height}`,
      preserveAspectRatio: 'none',
      class: 'bars__svg',
      role: 'img',
      'aria-label': label ?? '',
    },
    items.map((item, i) => {
      const v = clamp(item.value);
      const barHeight = v > 0 ? Math.max(v * height, 2) : 0;
      return svg(
        'g',
        {},
        svg('rect', { class: 'bars__track', x: i * w + 1, y: 0, width: w - 2, height }),
        svg(
          'rect',
          {
            class: `bars__bar${item.highlight ? ' is-highlight' : ''}`,
            x: i * w + 1,
            y: height - barHeight,
            width: w - 2,
            height: barHeight,
          },
          svg('title', {}, item.title ?? ''),
        ),
      );
    }),
  );

  const figure = h('figure', { class: 'bars' }, chart);
  if (showLabels) {
    const labels = h(
      'div',
      { class: 'bars__labels', 'aria-hidden': 'true' },
      items.map((item) => h('span', { class: item.highlight ? 'is-highlight' : null }, item.label)),
    );
    // CSSOM (autorisé par la CSP, contrairement à l'attribut style).
    labels.style.setProperty('--n', items.length);
    figure.append(labels);
  }
  return figure;
}

/**
 * Courbe(s) dans le temps. lines : [{ points: [{ t, v }], className }] (t en minutes murales).
 * band : { min, max } = plage cible saisie par l'utilisateur (bornes null = ouvertes).
 * Axe x de `from` à `to` ; axe y ajusté aux valeurs et à la plage, avec une marge.
 */
export function lineChart(lines, { from, to, band = null, height = 140, label } = {}) {
  const width = 320;
  const pad = 6;
  const values = lines.flatMap((l) => l.points.map((p) => p.v));
  const bounds = [...values, band?.min, band?.max].filter((v) => v != null);
  let lo = Math.min(...bounds);
  let hi = Math.max(...bounds);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const margin = (hi - lo) * 0.12;
  lo -= margin;
  hi += margin;
  const x = (t) => pad + ((t - from) / Math.max(1, to - from)) * (width - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);

  const bandRect =
    band && (band.min != null || band.max != null)
      ? svg('rect', {
          class: 'line__band',
          x: 0,
          width,
          y: y(band.max ?? hi),
          height: Math.max(0, y(band.min ?? lo) - y(band.max ?? hi)),
        })
      : null;

  return h(
    'figure',
    { class: 'line' },
    svg(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        class: 'line__svg',
        role: 'img',
        'aria-label': label ?? '',
      },
      bandRect,
      lines.map((l) =>
        svg(
          'g',
          { class: l.className ?? 'line__series' },
          l.points.length > 1
            ? svg('polyline', {
                class: 'line__path',
                fill: 'none',
                points: l.points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '),
              })
            : null,
          l.points.map((p) => svg('circle', { class: 'line__dot', cx: x(p.t), cy: y(p.v), r: 3 })),
        ),
      ),
    ),
  );
}
