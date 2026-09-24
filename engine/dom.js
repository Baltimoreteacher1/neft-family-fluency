// Tiny DOM helpers. Not a framework -- just the three lines every view would
// otherwise repeat, and one place where escaping is guaranteed.

/** Create an element. Children may be nodes or strings (always escaped). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('el() does not accept raw HTML');
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(container, ...nodes) {
  clear(container);
  container.append(...nodes.flat().filter(Boolean));
  return container;
}

/** Announce to assistive tech. `assertive` interrupts; use it only for errors. */
export function announce(message, assertive = false) {
  const region = document.getElementById(assertive ? 'live-assertive' : 'live');
  if (!region) return;
  // Re-setting identical text does not re-announce, so blank it first.
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

export function on(node, event, handler) {
  node.addEventListener(event, handler);
  return node;
}
