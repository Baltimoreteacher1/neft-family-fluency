// App shell: state, routing, and the settings sheet.
//
// Routing is hash-based so the whole app is one static file on a CDN with no
// server rewrites, and so the Android back button behaves the way families
// expect.

import config from './config.js';
import { storage, KEY } from './engine/storage.js';
import { loadLang, preferredLang, t, applyTranslations, currentLang } from './engine/i18n.js';
import { el, mount, clear } from './engine/dom.js';
import { loadCurriculum } from './engine/setBuilder.js';
import * as profilesView from './views/profiles.js';
import * as levelsView from './views/levels.js';
import * as weekView from './views/week.js';
import * as learnView from './views/learn.js';
import * as practiceView from './views/practice.js';
import * as playView from './views/play.js';
import * as checkView from './views/check.js';

export const app = {
  config,
  curriculum: null,
  profiles: [],
  activeId: null,
  settings: { lang: 'en', motion: 'auto', timer: false },
  get profile() {
    return this.profiles.find((p) => p.id === this.activeId) || null;
  },
  get totalWeeks() {
    return this.curriculum.weeks.length;
  },
  weekByNumber(n) {
    return this.curriculum.weeks.find((w) => w.week === n);
  },
  t,
  go,
};

const main = () => document.getElementById('main');

// --- routes ---------------------------------------------------------------
// Each route names a view module and the title shown in the top bar.

const ROUTES = [
  { pattern: /^$/, view: profilesView, title: () => t('app.title'), root: true },
  { pattern: /^levels$/, view: levelsView, title: () => t('levels.title') },
  { pattern: /^week\/(\d+)$/, view: weekView, title: (m) => t('week.title', { n: m[1] }) },
  { pattern: /^week\/(\d+)\/learn$/, view: learnView, title: () => t('week.learn') },
  { pattern: /^week\/(\d+)\/practice$/, view: practiceView, title: () => t('week.practice') },
  { pattern: /^week\/(\d+)\/play$/, view: playView, title: () => t('week.play') },
  { pattern: /^week\/(\d+)\/check$/, view: checkView, title: () => t('check.title') },
];

export function go(path) {
  const target = `#/${String(path).replace(/^\/+/, '')}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function currentPath() {
  return location.hash.replace(/^#\/?/, '');
}

async function render() {
  const path = currentPath();
  const route = ROUTES.find((r) => r.pattern.test(path)) || ROUTES[0];
  const match = path.match(route.pattern) || [];

  // A profile is required everywhere except the picker itself.
  if (!route.root && !app.profile) {
    go('');
    return;
  }

  document.getElementById('page-title').textContent = route.title(match);
  document.getElementById('btn-back').hidden = Boolean(route.root);

  clear(main());
  try {
    await route.view.render(main(), app, match);
  } catch (err) {
    console.error(err);
    mount(
      main(),
      el('div', { class: 'card' },
        el('h2', { text: 'Something went wrong' }),
        el('p', { class: 'muted', text: String(err.message || err) }),
        el('button', { class: 'btn', onClick: () => go('') }, t('app.back')),
      ),
    );
  }
  main().focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// --- settings -------------------------------------------------------------

export function saveSettings(patch) {
  app.settings = { ...app.settings, ...patch };
  storage.set(KEY.settings, app.settings);
  applyMotion();
}

function applyMotion() {
  // 'auto' leaves the OS preference in charge; 'reduced' forces it on. There is
  // deliberately no way to force motion ON against the OS setting.
  if (app.settings.motion === 'reduced') {
    document.documentElement.dataset.motion = 'reduced';
  } else {
    delete document.documentElement.dataset.motion;
  }
}

function settingsPanel() {
  const langButtons = ['en', 'es'].map((code) =>
    el('button', {
      type: 'button',
      'aria-pressed': String(app.settings.lang === code),
      onClick: async () => {
        saveSettings({ lang: code });
        await loadLang(code);
        applyTranslations(document);
        render();
        openSettings();
      },
    }, code === 'en' ? 'English' : 'Español'),
  );

  const toggle = (labelKey, hintKey, checked, onChange) =>
    el('div', { class: 'field' },
      el('label', { style: 'display:flex;align-items:center;gap:12px;min-height:48px;cursor:pointer' },
        el('input', {
          type: 'checkbox',
          checked,
          style: 'width:24px;height:24px;min-height:24px;flex:0 0 auto',
          onChange: (e) => onChange(e.target.checked),
        }),
        el('span', { text: t(labelKey) }),
      ),
      el('p', { class: 'muted', text: t(hintKey) }),
    );

  return el('div', { class: 'card' },
    el('h2', { text: t('settings.title') }),
    el('div', { class: 'field' },
      el('span', { class: 'label', text: t('settings.language') }),
      el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('settings.language') }, langButtons),
    ),
    toggle('settings.reducedMotion', 'settings.reducedMotionHint',
      app.settings.motion === 'reduced',
      (on) => saveSettings({ motion: on ? 'reduced' : 'auto' })),
    toggle('settings.timer', 'settings.timerHint', app.settings.timer,
      (on) => saveSettings({ timer: on })),
    el('p', { class: 'muted', text: t('profiles.privacyNote') }),
    el('div', { class: 'row' },
      app.profile
        ? el('button', { class: 'btn btn--ghost', onClick: () => { app.activeId = null; storage.set(KEY.activeProfile, null); go(''); } }, t('profiles.switch'))
        : null,
      el('a', { class: 'btn btn--ghost', href: 'family/', }, t('week.familyCard')),
      el('a', { class: 'btn btn--ghost', href: config.HUB_URL, rel: 'noopener' }, t('app.moreFrom')),
    ),
    el('button', { class: 'btn btn--block', onClick: () => render() }, t('app.close')),
  );
}

function openSettings() {
  mount(main(), settingsPanel());
  document.getElementById('page-title').textContent = t('settings.title');
  document.getElementById('btn-back').hidden = false;
  main().focus({ preventScroll: true });
}

// --- boot -----------------------------------------------------------------

async function boot() {
  app.settings = { lang: preferredLang(), motion: 'auto', timer: false, ...storage.get(KEY.settings, {}) };
  applyMotion();
  await loadLang(app.settings.lang);
  applyTranslations(document);

  app.curriculum = await loadCurriculum();
  app.profiles = storage.get(KEY.profiles, []);
  app.activeId = storage.get(KEY.activeProfile, null);
  if (app.activeId && !app.profiles.some((p) => p.id === app.activeId)) app.activeId = null;

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-back').addEventListener('click', () => history.back());
  window.addEventListener('hashchange', render);

  // Land on the level map if someone is already chosen on this device.
  if (!location.hash && app.activeId) go('levels');
  else render();

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// has no service worker scope; skip rather than throw in dev.
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service worker did not register; the app still works online.', err);
  });
}

boot();

export { currentLang };
