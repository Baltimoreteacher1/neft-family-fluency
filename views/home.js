// Who is practising. Tap a face and go.

import { el, mount } from '../engine/dom.js';
import { t, loadLang } from '../engine/i18n.js';
import { storage, KEY, remove } from '../engine/storage.js';
import { loadProfiles, saveProfiles, newProfile } from '../engine/model.js';

const AVATARS = [
  '\u{1F98A}', '\u{1F431}', '\u{1F436}', '\u{1F98B}', '\u{1F41D}', '\u{1F422}',
  '\u{1F419}', '\u{1F984}', '\u{1F43C}', '\u{1F438}', '\u{1F427}', '\u{1F98C}',
  '⚽', '\u{1F3C0}', '\u{1F680}', '⭐', '\u{1F308}', '\u{1F3B8}',
];

export async function render(container, app) {
  const profiles = loadProfiles();
  mount(container,
    languageBar(app),
    profiles.length ? picker(app, profiles) : creator(app),
  );
}

/**
 * The language switch sits on the first screen, not in Settings.
 *
 * It used to be behind a gear labelled in English, so a Spanish-speaking
 * parent who landed in English had to guess which icon would rescue them.
 * Each label is written in its own language, so neither depends on already
 * understanding the other.
 */
function languageBar(app) {
  return el('div', { class: 'langbar' },
    el('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Language / Idioma' },
      [['en', 'English'], ['es', 'Español']].map(([code, label]) =>
        el('button', {
          type: 'button',
          lang: code,
          'aria-pressed': String(app.settings.lang === code),
          onClick: async () => {
            if (app.settings.lang === code) return;
            app.saveSettings({ lang: code });
            await loadLang(code);
            app.render();
          },
        }, label),
      ),
    ),
  );
}

function picker(app, profiles) {
  return el('div', {},
    el('ul', { class: 'faces' },
      profiles.map((p) =>
        el('li', {},
          el('button', { class: 'face', onClick: () => choose(app, p) },
            el('span', { class: 'face__avatar', 'aria-hidden': 'true', text: p.avatar }),
            el('span', { class: 'face__name', text: p.nickname }),
          ),
        ),
      ),
    ),
    el('button', {
      class: 'btn btn--ghost btn--block',
      onClick: () => mount(document.getElementById('main'), languageBar(app), creator(app)),
    }, t('home.add')),
    el('p', { class: 'muted tiny', text: t('home.privacy') }),
  );
}

function creator(app) {
  let avatar = null;
  let grade = null;

  const error = el('p', { class: 'form-error', role: 'alert' });

  const avatarGrid = el('div', { class: 'avatar-grid' },
    AVATARS.map((a, i) =>
      el('button', {
        type: 'button',
        'aria-pressed': 'false',
        'aria-label': t('home.avatarN', { n: i + 1 }),
        text: a,
        onClick: (e) => {
          avatar = a;
          for (const b of e.currentTarget.parentElement.children) {
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          }
          error.textContent = '';
        },
      }),
    ),
  );

  const gradeGrid = el('div', { class: 'grade-grid' },
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      el('button', {
        type: 'button',
        class: 'grade-pick',
        'aria-pressed': 'false',
        'aria-label': t('grade.label', { n }),
        onClick: (e) => {
          grade = n;
          for (const b of e.currentTarget.parentElement.children) {
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          }
          error.textContent = '';
        },
      }, String(n)),
    ),
  );

  // A name is optional. A child who cannot write yet picks a face and a
  // number and starts; the app never needed the name for anything.
  const nickname = el('input', {
    type: 'text', id: 'f-nick', maxlength: '20', autocomplete: 'off',
    placeholder: t('home.nicknameOptional'),
  });

  return el('div', {},
    el('p', { class: 'step', text: t('home.pickAvatar') }),
    avatarGrid,
    el('p', { class: 'step', text: t('home.pickGrade') }),
    gradeGrid,
    el('div', { class: 'field' }, nickname),
    error,
    el('button', {
      class: 'btn btn--big btn--block',
      onClick: () => {
        if (!avatar) { error.textContent = t('home.needAvatar'); return; }
        if (!grade) { error.textContent = t('home.needGrade'); return; }
        const profile = newProfile({
          nickname: nickname.value.trim() || defaultName(avatar),
          avatar,
          grade,
        });
        saveProfiles([...loadProfiles(), profile]);
        choose(app, profile);
      },
    }, t('home.start')),
    el('p', { class: 'muted tiny', text: t('home.privacy') }),
  );
}

/** A profile with no name is still a profile; the avatar names it. */
function defaultName(avatar) {
  return avatar;
}

function choose(app, profile) {
  app.reloadProfile();
  app.activeId = profile.id;
  storage.set(KEY.activeProfile, profile.id);
  app.go(`g/${profile.grade}`);
}

export { AVATARS };
