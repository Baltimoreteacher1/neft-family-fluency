// App shell: state, routing, settings.
//
// Routes are hash-based so the whole app is one static file on a CDN with no
// server rewrites. Three concepts only:
//
//   #/                        home -- who is practising?
//   #/g/:grade                the grade dashboard (Today + skill cards)
//   #/g/:grade/:skillId       a skill (Learn / Practice / Play / Check)
//   #/g/:grade/:skillId/:act  an activity
//   #/settings
//
// Back always goes UP the hierarchy, never into browser history and never off
// the site.

import config from './config.js';
import { storage, KEY } from './engine/storage.js';
import { migrate } from './engine/migrate.js';
import { loadLang, preferredLang, t, applyTranslations } from './engine/i18n.js';
import { el, mount, clear } from './engine/dom.js';
import { loadProfiles } from './engine/model.js';
import { locateSkill } from './engine/curriculum.js';
import { WEEK_TO_SKILL } from './engine/migrate.js';
import * as homeView from './views/home.js';
import * as dashboardView from './views/dashboard.js';
import * as skillView from './views/skill.js';
import * as settingsView from './views/settings.js';
import * as learnView from './views/learn.js';
import * as practiceView from './views/practice.js';
import * as playView from './views/play.js';
import * as checkView from './views/check.js';
import * as familyView from './views/family.js';

export const app = {
  config,
  profiles: [],
  activeId: null,
  settings: { lang: 'en', motion: 'auto', timer: false, sound: false, textSize: 'normal', contrast: 'normal' },
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
  { pattern: /^settings$/, view: settingsView, up: () => backToGrade(), title: () => t('settings.title') },
  { pattern: /^g\/(\d+)$/, view: dashboardView, up: () => '', needsProfile: true,
    title: (m) => t('grade.label', { n: m[1] }) },
  { pattern: /^g\/(\d+)\/([\w-]+)$/, view: skillView, needsProfile: true,
    up: (m) => `g/${m[1]}`, title: () => t('skill.title') },
  { pattern: /^g\/(\d+)\/([\w-]+)\/learn$/, view: learnView, needsProfile: true,
    up: (m) => `g/${m[1]}/${m[2]}`, title: () => t('activity.learn') },
  { pattern: /^g\/(\d+)\/([\w-]+)\/practice$/, view: practiceView, needsProfile: true,
    up: (m) => `g/${m[1]}/${m[2]}`, title: () => t('activity.practice') },
  { pattern: /^g\/(\d+)\/([\w-]+)\/play$/, view: playView, needsProfile: true,
    up: (m) => `g/${m[1]}/${m[2]}`, title: () => t('activity.play') },
  { pattern: /^g\/(\d+)\/([\w-]+)\/check$/, view: checkView, needsProfile: true,
    up: (m) => `g/${m[1]}/${m[2]}`, title: () => t('activity.check') },
  { pattern: /^g\/(\d+)\/([\w-]+)\/family$/, view: familyView, needsProfile: true,
    up: (m) => `g/${m[1]}/${m[2]}`, title: () => t('skill.forGrownUps') },
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
 * Old URLs from the week-based app. A family with a bookmark or a printed
 * flyer must land somewhere sensible, not on a blank screen.
 *
 *   #/levels        -> the child's grade dashboard
 *   #/week/N        -> the skill that week became
 *   #/week/N/act    -> that skill's activity
 */
async function legacyRedirect(path) {
  if (path === 'levels') {
    go(backToGrade());
    return true;
  }
  const m = path.match(/^week\/(\d+)(?:\/(learn|practice|play|check))?$/);
  if (!m) return false;

  const target = WEEK_TO_SKILL[Number(m[1])];
  if (!target) {
    go(backToGrade());
    return true;
  }
  go(`g/${target.grade}/${target.skillId}${m[2] ? `/${m[2]}` : ''}`);
  return true;
}

async function render() {
  const path = currentPath();

  if (await legacyRedirect(path)) return;

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
        el('h2', { text: t('app.wentWrong') }),
        el('p', { class: 'muted', text: String(err.message || err) }),
        el('button', { class: 'btn', onClick: () => go(backToGrade()) }, t('app.back')),
      ),
    );
  }
  main().focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** The header: Back, where you are, the avatar switcher, and Settings. */
function paintChrome(route, match) {
  const back = document.getElementById('btn-back');
  const title = document.getElementById('page-title');
  const switcher = document.getElementById('btn-switch');

  title.textContent = route.title(match);

  if (route.root) {
    back.hidden = true;
  } else {
    back.hidden = false;
    back.onclick = () => go(route.up ? route.up(match) : '');
  }

  // One tap to switch child, from anywhere. Siblings share phones and taking
  // turns should not cost four taps.
  const profile = app.profile;
  switcher.hidden = !profile || route.root;
  if (profile) {
    switcher.textContent = profile.avatar;
    switcher.setAttribute('aria-label', t('app.switchFrom', { name: profile.nickname }));
  }
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

  if (app.settings.contrast === 'high') root.dataset.contrast = 'high';
  else delete root.dataset.contrast;

  root.dataset.textSize = app.settings.textSize || 'normal';
}

async function boot() {
  // Before anything reads storage: convert v1 data if this device has any.
  // Safe to call every boot; it returns immediately once it has run.
  try {
    migrate();
  } catch (err) {
    console.warn('Migration skipped:', err);
  }

  app.settings = {
    lang: preferredLang(), motion: 'auto', timer: false, sound: false,
    textSize: 'normal', contrast: 'normal',
    ...storage.get(KEY.settings, {}),
  };

  // A flyer QR can carry ?lang=es so a Spanish-speaking family lands in
  // Spanish without hunting for a toggle.
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

  // A returning child lands on their dashboard, one tap from Today.
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
