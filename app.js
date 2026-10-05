// App shell: three screens.
//
//   #/                who is practising
//   #/g/:grade        what to practise
//   #/g/:grade/:skill drilling
//
// Plus settings. That is the whole app. Back goes up one level, never into
// browser history and never off the site.

import config from './config.js';
import { storage, KEY } from './engine/storage.js';
import { migrate, WEEK_TO_SKILL } from './engine/migrate.js';
import { loadLang, preferredLang, t, applyTranslations } from './engine/i18n.js';
import { el, mount, clear } from './engine/dom.js';
import { loadProfiles } from './engine/model.js';
import * as homeView from './views/home.js';
import * as skillsView from './views/skills.js';
import * as drillView from './views/drill.js';
import * as settingsView from './views/settings.js';

export const app = {
  config,
  profiles: [],
  activeId: null,
  settings: { lang: 'en', motion: 'auto' },
  get profile() {
    return this.profiles.find((p) => p.id === this.activeId) || null;
  },
  get lang() {
    return this.settings.lang;
  },
  t,
  go,
  render,
  saveSettings,
  reloadProfile() {
    this.profiles = loadProfiles();
  },
};

const main = () => document.getElementById('main');

const ROUTES = [
  { pattern: /^$/, view: homeView, root: true, title: () => t('home.who') },
  { pattern: /^settings$/, view: settingsView, up: () => backToGrade(),
    title: () => t('settings.title') },
  { pattern: /^g\/(\d+)$/, view: skillsView, needsProfile: true, up: () => '',
    title: () => t('skills.title') },
  { pattern: /^g\/(\d+)\/([\w-]+)$/, view: drillView, needsProfile: true,
    up: (m) => `g/${m[1]}`, title: () => t('drill.title') },
];

export function go(path) {
  const target = `#/${String(path).replace(/^\/+/, '')}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function currentPath() {
  return location.hash.replace(/^#\/?/, '');
}

function backToGrade() {
  return app.profile ? `g/${app.profile.grade}` : '';
}

/**
 * Old URLs. Bookmarks and printed flyers still point at the week-based app and
 * at the four-activity version that followed it; both now land on the drill
 * for whichever skill that was.
 */
function legacyRedirect(path) {
  if (path === 'levels') {
    go(backToGrade());
    return true;
  }

  const week = path.match(/^week\/(\d+)(?:\/\w+)?$/);
  if (week) {
    const target = WEEK_TO_SKILL[Number(week[1])];
    go(target ? `g/${target.grade}/${target.skillId}` : backToGrade());
    return true;
  }

  // The four activities and the grown-ups page are gone; their URLs open the
  // skill itself rather than 404ing.
  const activity = path.match(/^g\/(\d+)\/([\w-]+)\/\w+$/);
  if (activity) {
    go(`g/${activity[1]}/${activity[2]}`);
    return true;
  }
  return false;
}

async function render() {
  const path = currentPath();
  if (legacyRedirect(path)) return;

  const route = ROUTES.find((r) => r.pattern.test(path)) || ROUTES[0];
  const match = path.match(route.pattern) || [];

  if (route.needsProfile && !app.profile) {
    go('');
    return;
  }

  paintChrome(route, match);
  clear(main());

  try {
    await route.view.render(main(), app, match);
  } catch (err) {
    console.error(err);
    mount(main(),
      el('div', { class: 'card' },
        el('p', { text: t('app.wentWrong') }),
        el('button', { class: 'btn', onClick: () => go(backToGrade()) }, t('app.back')),
      ),
    );
  }
  main().focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function paintChrome(route, match) {
  const back = document.getElementById('btn-back');
  const title = document.getElementById('page-title');
  const switcher = document.getElementById('btn-switch');
  const settings = document.getElementById('btn-settings');

  title.textContent = route.title(match);

  back.hidden = Boolean(route.root);
  if (!route.root) back.onclick = () => go(route.up ? route.up(match) : '');

  // One tap to switch child, from anywhere. Siblings share phones.
  const profile = app.profile;
  switcher.hidden = !profile || route.root;
  if (profile) {
    switcher.textContent = profile.avatar;
    switcher.setAttribute('aria-label', t('app.switchFrom', { name: profile.nickname }));
  }

  // Settings is a grown-up's door, so it stays out of the drill.
  settings.hidden = route.root || path0(route) === 'drill';
}

function path0(route) {
  return route.view === drillView ? 'drill' : '';
}

export function saveSettings(patch) {
  app.settings = { ...app.settings, ...patch };
  storage.set(KEY.settings, app.settings);
  applyPreferences();
}

function applyPreferences() {
  const root = document.documentElement;
  if (app.settings.motion === 'reduced') root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

async function boot() {
  // Convert v1 data if this device has any. Safe on every boot.
  try {
    migrate();
  } catch (err) {
    console.warn('Migration skipped:', err);
  }

  app.settings = {
    lang: preferredLang(), motion: 'auto',
    ...storage.get(KEY.settings, {}),
  };

  // A flyer QR carries ?lang=es so a Spanish-speaking family lands in Spanish.
  const fromLink = new URLSearchParams(location.search).get('lang');
  if (fromLink === 'es' || fromLink === 'en') app.settings.lang = fromLink;

  applyPreferences();
  await loadLang(app.settings.lang);
  applyTranslations(document);

  app.profiles = loadProfiles();
  app.activeId = storage.get(KEY.activeProfile, null);
  if (app.activeId && !app.profiles.some((p) => p.id === app.activeId)) app.activeId = null;

  document.getElementById('btn-settings').addEventListener('click', () => go('settings'));
  document.getElementById('btn-switch').addEventListener('click', () => go(''));
  window.addEventListener('hashchange', render);

  // A returning child lands on their own list, one tap from drilling.
  if (!location.hash && app.profile) go(`g/${app.profile.grade}`);
  else render();

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service worker did not register; the app still works online.', err);
  });
}

boot();
