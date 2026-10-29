// A plain list of what you can practise. Tap one and you are drilling.

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

  mount(container,
    el('p', { class: 'grade-chip', text: t('grade.label', { n: grade }) }),
    el('ul', { class: 'picklist' },
      data.skills.map((skill) => {
        const record = progress.skills[skill.id];
        const stages = skill.stages.length;
        const done = record?.mastered ? stages : record?.stage ?? 0;

        return el('li', {},
          el('button', {
            class: 'pick',
            onClick: () => app.go(`g/${grade}/${skill.id}`),
          },
            el('span', { class: 'pick__title', text: skill.title[app.lang] || skill.title.en }),
            // Three dots, one per stage. No percentages, no rings, no words.
            el('span', { class: 'pick__dots', 'aria-hidden': 'true' },
              Array.from({ length: stages }, (_, i) =>
                el('span', { class: 'pick__dot', dataset: { on: String(i < done) } })),
            ),
            el('span', { class: 'visually-hidden',
              text: t('skills.stagesDone', { done, total: stages }) }),
          ),
          // Which Common Core standard this skill practises. Closed by default
          // so the child's list stays quiet.
          el('details', { class: 'std' },
            el('summary', { text: t('skills.standard') }),
            el('p', { class: 'std__body' },
              el('strong', { class: 'std__code', text: skill.ccss }),
              ' ',
              standards[skill.ccss]?.[app.lang] || standards[skill.ccss]?.en || ''),
          ),
        );
      }),
    ),

    el('button', {
      class: 'btn btn--block',
      onClick: () => app.go(`g/${grade}/passport`),
    }, t('skills.passport')),

    // One quiet link out, for a grown-up who wants a different grade.
    el('button', {
      class: 'btn btn--ghost btn--block',
      onClick: () => app.go('settings'),
    }, t('skills.change')),
  );
}
