// The Skill Passport: one printable page per grade. A paper twin of the skill
// list -- every skill gets a row with a circle per step and a star for mastery,
// so a child can colour in progress on something they can hold.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { loadGrade, gradeMeta, loadStandards } from '../engine/curriculum.js';
import { loadProgress } from '../engine/model.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const [data, meta, standards] = await Promise.all([
    loadGrade(grade), gradeMeta(grade), loadStandards(),
  ]);
  document.documentElement.style.setProperty('--grade-accent', meta.accent);

  const progress = loadProgress(app.profile.id);
  const sheet = el('section', { class: 'passport', dataset: { filled: 'false' } },
    el('h2', { class: 'passport__title',
      text: t('passport.owner', { name: app.profile.nickname }) }),
    el('p', { class: 'passport__how', text: t('passport.how') }),
    el('ol', { class: 'passport__list' },
      data.skills.map((skill) => stamp(skill, progress.skills[skill.id], standards, app.lang)),
    ),
  );

  mount(container,
    el('div', { class: 'passport-controls' },
      el('label', { class: 'switch' },
        el('input', {
          type: 'checkbox',
          onChange: (e) => { sheet.dataset.filled = String(e.target.checked); },
        }),
        el('span', { text: t('passport.showDone') }),
      ),
      el('button', { class: 'btn', onClick: () => window.print() }, t('passport.print')),
    ),
    sheet,
  );
}

function stamp(skill, record, standards, lang) {
  const done = record?.mastered ? skill.stages.length : record?.stage ?? 0;
  const standard = standards[skill.ccss];

  return el('li', { class: 'passport__skill' },
    el('div', { class: 'passport__head' },
      el('span', { class: 'passport__name', text: skill.title[lang] || skill.title.en }),
      el('span', { class: 'passport__code', text: skill.ccss }),
    ),
    el('p', { class: 'passport__std', text: standard?.[lang] || standard?.en || '' }),
    el('div', { class: 'passport__steps' },
      skill.stages.map((stage, i) =>
        el('span', { class: 'passport__step' },
          el('span', { class: 'passport__circle', dataset: { done: String(i < done) } }),
          el('span', { class: 'passport__label', text: stage.label[lang] || stage.label.en }),
        )),
      el('span', { class: 'passport__step passport__step--star' },
        el('span', { class: 'passport__star', 'aria-hidden': 'true',
          dataset: { done: String(Boolean(record?.mastered)) } }, '★'),
        el('span', { class: 'passport__label', text: t('passport.mastered') }),
      ),
    ),
  );
}
