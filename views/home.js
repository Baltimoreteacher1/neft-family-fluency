// Home: who is practising?
//
// The first screen a family ever sees, and the one a returning child taps
// through in half a second. Tapping an avatar goes straight to that child's
// grade dashboard -- never via a menu.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { storage, KEY } from '../engine/storage.js';
import { loadProfiles, saveProfiles, newProfile } from '../engine/model.js';
import { remove } from '../engine/storage.js';

const AVATARS = [
  '\u{1F98A}', '\u{1F431}', '\u{1F436}', '\u{1F98B}', '\u{1F41D}', '\u{1F422}',
  '\u{1F419}', '\u{1F984}', '\u{1F43C}', '\u{1F438}', '\u{1F427}', '\u{1F98C}',
  '⚽', '\u{1F3C0}', '\u{1F680}', '⭐', '\u{1F308}', '\u{1F3B8}',
];

export async function render(container, app) {
  const profiles = loadProfiles();
  mount(container, profiles.length ? picker(app, profiles) : creator(app));
}

function picker(app, profiles) {
  return el('div', {},
    el('div', { class: 'card' },
      el('h2', { text: t('home.who') }),
      el('ul', { class: 'profiles' },
        profiles.map((p) =>
          el('li', {},
            el('button', {
              class: 'profile',
              onClick: () => choose(app, p),
            },
              el('span', { class: 'profile__avatar', 'aria-hidden': 'true', text: p.avatar }),
              el('span', { class: 'profile__name', text: p.nickname }),
              el('span', { class: 'profile__grade', text: t('grade.label', { n: p.grade }) }),
              // The class tag is small, optional, and only appears once a
              // family has chosen to send progress to a teacher.
              p.classCode
                ? el('span', { class: 'profile__tag', text: `${p.classCode} · #${p.studentNumber ?? '?'}` })
                : null,
            ),
          ),
        ),
      ),
      el('button', {
        class: 'btn btn--soft btn--block',
        onClick: () => mount(document.getElementById('main'), creator(app)),
      }, t('home.add')),
    ),
    el('div', { class: 'card' },
      // Accurate now that "Send to my teacher" exists: nothing leaves the
      // device unless the family chooses to send it.
      el('p', { class: 'muted', text: t('home.privacy') }),
      profiles.length
        ? el('button', {
            class: 'btn btn--ghost btn--small',
            onClick: () => removeFlow(app, profiles),
          }, t('home.remove'))
        : null,
    ),
  );
}

function creator(app) {
  let avatar = AVATARS[0];
  let grade = null;

  const nickname = el('input', {
    type: 'text', id: 'f-nick', maxlength: '20', autocomplete: 'off',
    placeholder: t('home.nicknamePlaceholder'),
  });

  const avatarButtons = AVATARS.map((a, i) =>
    el('button', {
      type: 'button',
      'aria-pressed': String(a === avatar),
      'aria-label': t('home.avatarN', { n: i + 1 }),
      text: a,
      onClick: (e) => {
        avatar = a;
        for (const btn of e.currentTarget.parentElement.children) {
          btn.setAttribute('aria-pressed', String(btn === e.currentTarget));
        }
      },
    }),
  );

  // Grades are a grid of big numbers, not a dropdown: a parent picks one in a
  // single tap and a child can see which one is chosen.
  const gradeButtons = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    el('button', {
      type: 'button',
      class: 'grade-pick',
      'aria-pressed': 'false',
      'aria-label': t('grade.label', { n }),
      onClick: (e) => {
        grade = n;
        for (const btn of e.currentTarget.parentElement.children) {
          btn.setAttribute('aria-pressed', String(btn === e.currentTarget));
        }
        error.textContent = '';
      },
    }, String(n)),
  );

  const error = el('p', { class: 'form-error', role: 'alert' });

  const form = el('form', {
    novalidate: true,
    onSubmit: (e) => {
      e.preventDefault();
      const name = nickname.value.trim();
      if (!name) {
        error.textContent = t('home.needNickname');
        nickname.focus();
        return;
      }
      if (!grade) {
        error.textContent = t('home.needGrade');
        return;
      }
      const profile = newProfile({ nickname: name, avatar, grade });
      saveProfiles([...loadProfiles(), profile]);
      choose(app, profile);
    },
  },
    el('div', { class: 'field' },
      el('label', { for: 'f-nick', text: t('home.nickname') }),
      nickname,
      el('p', { class: 'muted', text: t('home.nicknameHint') }),
    ),
    el('fieldset', { class: 'field fieldset' },
      el('legend', { text: t('home.pickAvatar') }),
      el('div', { class: 'avatar-grid' }, avatarButtons),
    ),
    el('fieldset', { class: 'field fieldset' },
      el('legend', { text: t('home.pickGrade') }),
      el('div', { class: 'grade-grid' }, gradeButtons),
      el('p', { class: 'muted', text: t('home.gradeHint') }),
    ),
    error,
    el('button', { class: 'btn btn--block', type: 'submit' }, t('home.start')),
  );

  return el('div', { class: 'card' },
    el('h2', { text: t('home.newTitle') }),
    form,
    el('p', { class: 'muted', text: t('home.privacy') }),
  );
}

function choose(app, profile) {
  // Re-read from storage first: a profile created a moment ago is in storage
  // but not yet in app.profiles, and app.profile would come back null --
  // which sends every route straight back here.
  app.reloadProfile();
  app.activeId = profile.id;
  storage.set(KEY.activeProfile, profile.id);
  app.go(`g/${profile.grade}`);
}

function removeFlow(app, profiles) {
  mount(document.getElementById('main'),
    el('div', { class: 'card' },
      el('h2', { text: t('home.remove') }),
      el('p', { text: t('home.removeConfirm') }),
      el('ul', { class: 'profiles' },
        profiles.map((p) =>
          el('li', {},
            el('button', {
              class: 'profile',
              onClick: () => {
                saveProfiles(loadProfiles().filter((x) => x.id !== p.id));
                remove(KEY.progress(p.id));
                if (app.activeId === p.id) {
                  app.activeId = null;
                  storage.set(KEY.activeProfile, null);
                }
                app.go('');
              },
            },
              el('span', { class: 'profile__avatar', 'aria-hidden': 'true', text: p.avatar }),
              el('span', { class: 'profile__name', text: p.nickname }),
            ),
          ),
        ),
      ),
      el('button', { class: 'btn btn--block', onClick: () => app.go('') }, t('app.cancel')),
    ),
  );
}

export { AVATARS };
