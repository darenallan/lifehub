// Seul point de création de DOM : jamais de HTML brut, les textes passent par des text nodes.

const SVG_NS = 'http://www.w3.org/2000/svg';
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.\/|data:image\/)/i;

/**
 * h('button', { class: 'btn', onclick: fn }, 'Texte', autreNoeud)
 * Props spéciales : class, text, dataset, on<event>.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** Remplace tout le contenu de `container`. */
export function mount(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
  return container;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'innerHTML' || key === 'outerHTML') throw new Error(`${key} interdit (XSS)`);

    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (URL_ATTRS.has(key)) {
      const url = String(value).trim();
      if (!SAFE_URL.test(url)) throw new Error(`URL refusée : ${url}`);
      el.setAttribute(key, url);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
