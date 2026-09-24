// Profile picker and creation.
//
// A profile is an avatar, a nickname, a class code and a list number. It is
// never sent anywhere. Siblings sharing a phone each get their own.

import { storage, KEY, remove } from '../engine/storage.js';
import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';

// Emoji avatars: no image files to download, and they render on every Android
// version this app is likely to meet.
const AVATARS = [
  '\u{1F98A}', '\u{1F431}', '\u{1F436}', '\u{1F98B}', '\u{1F41D}', '\u{1F422}',
  '\u{1F419}', '\u{1F984}', '\u{1F43C}', '\u{1F438}', '\u{1F427}', '\u{1F98C}',
  '⚽', '\u{1F3C0}', '\u{1F680}', '⭐', '\u{1F308}', '\u{1F3B8}',
];

export async function render(container, app) {
  mount(container, app.profiles.length ? picker(app) : creator(app));
}

function picker(app) {
  const list = el('ul', { class: 'profiles' },
    app.profiles.map((p) =>
      el('li', {},
        el('button', {
          class: 'profile',
          onClick: () => choose(app, p.id),
        },
          el('span', { class: 'profile__avatar', 'aria-hidden': 'true', text: p.avatar }),
          el('span', { class: 'profile__name', text: p.nickname }),
          el('span', { class: 'muted', text: `${p.classCode} · #${p.studentNumber}` }),
        ),
      ),
    ),
  );

  return el('div', {},
    el('div', { class: 'card' },
      el('h2', { text: t('profiles.who') }),
      list,
      el('button', { class: 'btn btn--soft btn--block', onClick: () => mount(document.getElementById('main'), creator(app)) },
        t('profiles.add')),
    ),
    el('div', { class: 'card' },
      el('p', { class: 'muted', text: t('profiles.privacyNote') }),
      app.profiles.length
        ? el('button', { class: 'btn btn--ghost btn--small', onClick: () => removeFlow(app) }, t('profiles.remove'))
        : null,
    ),
  );
}

function creator(app) {
  let avatar = AVATARS[0];

  const avatarButtons = AVATARS.map((a) =>
    el('button', {
      type: 'button',
      'aria-pressed': String(a === avatar),
      'aria-label': `${t('profiles.pickAvatar')} ${AVATARS.indexOf(a) + 1}`,
      text: a,
      onClick: (e) => {
        avatar = a;
        for (const btn of e.currentTarget.parentElement.children) {
          btn.setAttribute('aria-pressed', String(btn === e.currentTarget));
        }
      },
    }),
  );

  const nickname = el('input', {
    type: 'text', id: 'f-nick', maxlength: '20', autocomplete: 'off',
    placeholder: t('profiles.nicknamePlaceholder'),
  });

  // The flyer links carry ?class=6A, so a family that scanned their own
  // teacher's flyer arrives with the right class already chosen.
  const fromFlyer = new URLSearchParams(location.search).get('class');
  const classCode = el('select', { id: 'f-class' },
    app.config.CLASS_CODES.map((c) =>
      el('option', {
        value: c,
        text: c,
        selected: fromFlyer && c.toUpperCase() === fromFlyer.toUpperCase(),
      }),
    ),
  );

  const studentNumber = el('input', {
    type: 'number', id: 'f-num', min: '1', max: '255',
    inputmode: 'numeric', autocomplete: 'off',
  });

  const error = el('p', { class: 'muted', role: 'alert' });

  const form = el('form', { novalidate: true, onSubmit: (e) => {
    e.preventDefault();
    const name = nickname.value.trim();
    const num = Number(studentNumber.value);
    if (!name) {
      error.textContent = t('profiles.nickname');
      nickname.focus();
      return;
    }
    if (!Number.isInteger(num) || num < 1 || num > 255) {
      error.textContent = t('profiles.studentNumberHint');
      studentNumber.focus();
      return;
    }
    create(app, { nickname: name, avatar, classCode: classCode.value, studentNumber: num });
  } },
    el('div', { class: 'field' },
      el('label', { for: 'f-nick', text: t('profiles.nickname') }),
      nickname,
      el('p', { class: 'muted', text: t('profiles.nicknameHint') }),
    ),
    el('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0 0 16px' },
      el('legend', { style: 'font-weight:600;padding:0;margin-bottom:4px', text: t('profiles.pickAvatar') }),
      el('div', { class: 'avatar-grid' }, avatarButtons),
    ),
    el('div', { class: 'field' },
      el('label', { for: 'f-class', text: t('profiles.classCode') }),
      classCode,
      el('p', { class: 'muted', text: t('profiles.classCodeHint') }),
    ),
    el('div', { class: 'field' },
      el('label', { for: 'f-num', text: t('profiles.studentNumber') }),
      studentNumber,
      el('p', { class: 'muted', text: t('profiles.studentNumberHint') }),
    ),
    error,
    el('button', { class: 'btn btn--block', type: 'submit' }, t('profiles.create')),
  );

  return el('div', { class: 'card' },
    el('h2', { text: t('profiles.newTitle') }),
    form,
    el('p', { class: 'muted', text: t('profiles.privacyNote') }),
  );
}

function create(app, data) {
  const profile = {
    // Random id, not derived from anything about the child.
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    ...data,
  };
  app.profiles = [...app.profiles, profile];
  storage.set(KEY.profiles, app.profiles);
  choose(app, profile.id);
}

function choose(app, id) {
  app.activeId = id;
  storage.set(KEY.activeProfile, id);
  announce(t('levels.title'));
  app.go('levels');
}

function removeFlow(app) {
  const container = document.getElementById('main');
  mount(container,
    el('div', { class: 'card' },
      el('h2', { text: t('profiles.remove') }),
      el('p', { text: t('profiles.removeConfirm') }),
      el('ul', { class: 'profiles' },
        app.profiles.map((p) =>
          el('li', {},
            el('button', {
              class: 'profile',
              onClick: () => {
                app.profiles = app.profiles.filter((x) => x.id !== p.id);
                storage.set(KEY.profiles, app.profiles);
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
