// Translation lookup. Both language files ship with the app and are cached by
// the service worker, so switching language works offline.

import { storage, KEY } from './storage.js';

const LANGS = ['en', 'es'];
let dict = null;
let current = 'en';

/** The language to start in: saved choice, else the phone's, else English. */
export function preferredLang() {
  const saved = storage.get(KEY.settings, {})?.lang;
  if (LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : 'en';
}

export async function loadLang(lang) {
  const chosen = LANGS.includes(lang) ? lang : 'en';
  const res = await fetch(`i18n/${chosen}.json`);
  if (!res.ok) throw new Error(`Could not load ${chosen}.json`);
  dict = await res.json();
  current = chosen;
  document.documentElement.lang = chosen;
  return chosen;
}

export function currentLang() {
  return current;
}

/**
 * t('week.goal') or t('levels.level', { n: 3 }).
 *
 * A missing key returns the key itself rather than blank or undefined: a
 * visible "week.goal" on screen is a bug report; an empty box is a mystery.
 */
export function t(path, vars) {
  let node = dict;
  for (const part of path.split('.')) {
    if (node == null) break;
    node = node[part];
  }
  if (typeof node !== 'string') return path;
  if (!vars) return node;
  return node.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

/** Fill every [data-t] element in a tree. */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) {
    el.textContent = t(el.dataset.t);
  }
  for (const el of root.querySelectorAll('[data-t-label]')) {
    el.setAttribute('aria-label', t(el.dataset.tLabel));
  }
  for (const el of root.querySelectorAll('[data-t-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.tPlaceholder));
  }
}

export { LANGS };
