// Settings: grade, language, and a way to start a profile over. Nothing else.

import { el, mount } from '../engine/dom.js';
import { t, loadLang } from '../engine/i18n.js';
import { KEY, remove, storage } from '../engine/storage.js';
import { loadProfiles, saveProfiles, updateProfile } from '../engine/model.js';

export async function render(container, app) {
  const profile = app.profile;

  mount(container,
    el('div', { class: 'card' },
      el('h2', { class: 'flush', text: t('settings.grade') }),
      el('div', { class: 'grade-grid' },
        [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
          el('button', {
            type: 'button',
            class: 'grade-pick',
            'aria-pressed': String(profile.grade === n),
            'aria-label': t('grade.label', { n }),
            onClick: () => {
              updateProfile(profile.id, { grade: n });
              app.reloadProfile();
              app.go(`g/${n}`);
            },
          }, String(n)),
        ),
      ),
    ),

    el('div', { class: 'card' },
      el('h2', { class: 'flush', text: t('settings.language') }),
      el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('settings.language') },
        [['en', 'English'], ['es', 'Español']].map(([code, label]) =>
          el('button', {
            type: 'button',
            lang: code,
            'aria-pressed': String(app.settings.lang === code),
            onClick: async () => {
              app.saveSettings({ lang: code });
              await loadLang(code);
              app.render();
            },
          }, label),
        ),
      ),
    ),

    el('div', { class: 'card' },
      el('label', { class: 'switch' },
        el('input', {
          type: 'checkbox',
          checked: app.settings.motion === 'reduced',
          onChange: (e) => app.saveSettings({ motion: e.target.checked ? 'reduced' : 'auto' }),
        }),
        el('span', { text: t('settings.reducedMotion') }),
      ),
    ),

    el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => {
            if (!confirm(t('settings.resetConfirm'))) return;
            remove(KEY.progress(profile.id));
            app.go(`g/${profile.grade}`);
          },
        }, t('settings.reset')),
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => {
            if (!confirm(t('home.removeConfirm'))) return;
            saveProfiles(loadProfiles().filter((x) => x.id !== profile.id));
            remove(KEY.progress(profile.id));
            app.activeId = null;
            storage.set(KEY.activeProfile, null);
            app.go('');
          },
        }, t('home.remove')),
      ),
    ),
  );
}
