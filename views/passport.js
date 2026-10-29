// The Skill Passport: a printable paper twin of the skill list. Every skill gets
// a row with a circle per step and a star for mastery, so a child can colour in
// progress on something they can hold.
//
// Two layouts from the same rows: one flat page, or a booklet -- one sheet
// printed on both sides in landscape and folded in half (cover, two inside
// pages of skills, back page with the key and a "complete" box).

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { loadGrade, gradeMeta, loadStandards } from '../engine/curriculum.js';
import { loadProgress } from '../engine/model.js';

// A folded sheet has two inside pages. Past this many skills a grade would
// need a second sheet, which this layout does not do -- a unit test guards it.
export const BOOKLET_MAX_SKILLS = 8;

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const [data, meta, standards] = await Promise.all([
    loadGrade(grade), gradeMeta(grade), loadStandards(),
  ]);
  document.documentElement.style.setProperty('--grade-accent', meta.accent);

  const progress = loadProgress(app.profile.id);
  const rows = data.skills.map((skill) =>
    () => stamp(skill, progress.skills[skill.id], standards, app.lang));
  const name = app.profile.nickname;
  const gradeText = t('grade.label', { n: grade });

  const wrap = el('div', { class: 'passport-wrap', dataset: { filled: 'false', layout: 'page' } },
    flatPage(rows, name, gradeText),
    booklet(rows, name, gradeText),
  );

  // A named @page size only matters when printing the booklet; the flat page
  // keeps the browser's default. Disabled until the booklet is chosen.
  const pageSize = el('style', { text: '@page { size: letter landscape; margin: 0; }' });
  pageSize.disabled = true;

  const choose = (layout) => {
    wrap.dataset.layout = layout;
    pageSize.disabled = layout !== 'booklet';
    for (const b of container.querySelectorAll('[data-layout-btn]')) {
      b.setAttribute('aria-pressed', String(b.dataset.layoutBtn === layout));
    }
  };

  mount(container,
    pageSize,
    el('div', { class: 'passport-controls' },
      el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('passport.layout') },
        [['page', 'passport.layoutPage'], ['booklet', 'passport.layoutBooklet']].map(([id, key]) =>
          el('button', {
            type: 'button',
            dataset: { layoutBtn: id },
            'aria-pressed': String(id === 'page'),
            onClick: () => choose(id),
          }, t(key))),
      ),
      el('label', { class: 'switch' },
        el('input', {
          type: 'checkbox',
          onChange: (e) => { wrap.dataset.filled = String(e.target.checked); },
        }),
        el('span', { text: t('passport.showDone') }),
      ),
      el('button', { class: 'btn', onClick: () => window.print() }, t('passport.print')),
    ),
    el('p', { class: 'passport-fold muted', text: t('passport.foldHelp') }),
    wrap,
  );
}

function flatPage(rows, name, gradeText) {
  return el('section', { class: 'passport' },
    el('h2', { class: 'passport__title', text: t('passport.owner', { name }) }),
    el('p', { class: 'passport__grade', text: gradeText }),
    el('p', { class: 'passport__how', text: t('passport.how') }),
    el('ol', { class: 'passport__list' }, rows.map((row) => row())),
  );
}

function booklet(rows, name, gradeText) {
  // First inside page takes the extra skill when the count is odd.
  const split = Math.ceil(rows.length / 2);
  const inside = (list, n) => el('section', { class: `booklet__page booklet__inside booklet__p${n}` },
    el('p', { class: 'booklet__running', text: `${gradeText} \u00b7 ${t('passport.pageN', { n })}` }),
    el('ol', { class: 'passport__list' }, list.map((row) => row())),
  );

  return el('div', { class: 'booklet' },
    el('section', { class: 'booklet__page booklet__cover' },
      el('span', { class: 'booklet__big-star', 'aria-hidden': 'true' }, '\u2605'),
      el('h2', { class: 'booklet__title', text: t('passport.title') }),
      el('p', { class: 'booklet__name', text: name }),
      el('p', { class: 'booklet__grade', text: gradeText }),
      el('p', { class: 'booklet__line', text: t('passport.started') }),
    ),
    inside(rows.slice(0, split), 2),
    inside(rows.slice(split), 3),
    el('section', { class: 'booklet__page booklet__back' },
      el('h3', { text: t('passport.backTitle') }),
      el('p', { text: t('passport.how') }),
      el('p', { text: t('passport.keyCode') }),
      el('div', { class: 'booklet__complete' },
        el('strong', { text: t('passport.complete') }),
        el('p', { class: 'booklet__line', text: t('passport.signed') }),
        el('p', { class: 'booklet__line', text: t('passport.date') }),
      ),
    ),
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
