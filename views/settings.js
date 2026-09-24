// Settings. Reached from a button labelled "Settings", not a bare gear.

import { el, mount } from '../engine/dom.js';
import { t, loadLang } from '../engine/i18n.js';
import { storage, KEY, remove } from '../engine/storage.js';
import { loadProfiles, updateProfile } from '../engine/model.js';

export async function render(container, app) {
  const profile = app.profile;

  const toggle = (key, labelKey, hintKey, value, onChange) =>
    el('div', { class: 'field' },
      el('label', { class: 'switch' },
        el('input', {
          type: 'checkbox',
          checked: value,
          onChange: (e) => onChange(e.target.checked),
        }),
        el('span', { text: t(labelKey) }),
      ),
      hintKey ? el('p', { class: 'muted', text: t(hintKey) }) : null,
    );

  const gradeGrid = el('div', { class: 'grade-grid' },
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
  );

  mount(container,
    el('div', { class: 'card' },
      el('h2', { text: t('settings.grade') }),
      el('p', { class: 'muted', text: t('settings.gradeHint') }),
      gradeGrid,
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('settings.language') }),
      el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('settings.language') },
        [['en', 'English'], ['es', 'Español']].map(([code, label]) =>
          el('button', {
            type: 'button',
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
      el('h2', { text: t('settings.title') }),
      toggle('sound', 'settings.sound', 'settings.soundHint', app.settings.sound,
        (on) => app.saveSettings({ sound: on })),
      toggle('timer', 'settings.timer', 'settings.timerHint', app.settings.timer,
        (on) => app.saveSettings({ timer: on })),
      toggle('motion', 'settings.reducedMotion', 'settings.reducedMotionHint',
        app.settings.motion === 'reduced',
        (on) => app.saveSettings({ motion: on ? 'reduced' : 'auto' })),
      toggle('contrast', 'settings.contrast', 'settings.contrastHint',
        app.settings.contrast === 'high',
        (on) => app.saveSettings({ contrast: on ? 'high' : 'normal' })),
      el('div', { class: 'field' },
        el('span', { class: 'label', text: t('settings.textSize') }),
        el('div', { class: 'row' },
          [['normal', 'A'], ['large', 'A+'], ['xlarge', 'A++']].map(([size, label]) =>
            el('button', {
              class: 'btn btn--ghost btn--small',
              'aria-pressed': String(app.settings.textSize === size),
              onClick: () => app.saveSettings({ textSize: size }),
            }, label),
          ),
        ),
      ),
    ),

    // The class tag lives here because it is optional and only matters to a
    // family that has chosen to send progress to a teacher.
    el('div', { class: 'card' },
      el('h2', { text: t('settings.classTag') }),
      el('p', { class: 'muted', text: t('settings.classTagHint') }),
      classTagForm(app, profile),
    ),

    el('div', { class: 'card' },
      el('button', {
        class: 'btn btn--ghost btn--block',
        onClick: () => {
          if (!confirm(t('settings.resetConfirm'))) return;
          remove(KEY.progress(profile.id));
          app.go(`g/${profile.grade}`);
        },
      }, t('settings.reset')),
    ),
  );
}

function classTagForm(app, profile) {
  const code = el('input', {
    type: 'text', id: 's-class', maxlength: '4', autocomplete: 'off',
    value: profile.classCode || '', placeholder: '6B',
  });
  const num = el('input', {
    type: 'number', id: 's-num', min: '1', max: '255', inputmode: 'numeric',
    autocomplete: 'off', value: profile.studentNumber ?? '',
  });
  const status = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });

  return el('div', {},
    el('div', { class: 'field' },
      el('label', { for: 's-class', text: t('settings.classCode') }),
      code,
    ),
    el('div', { class: 'field' },
      el('label', { for: 's-num', text: t('settings.studentNumber') }),
      num,
    ),
    status,
    el('button', {
      class: 'btn',
      onClick: () => {
        const n = Number(num.value);
        updateProfile(profile.id, {
          classCode: code.value.trim().toUpperCase() || null,
          studentNumber: Number.isInteger(n) && n > 0 ? n : null,
        });
        app.reloadProfile();
        status.textContent = t('app.saved');
      },
    }, t('app.save')),
  );
}
