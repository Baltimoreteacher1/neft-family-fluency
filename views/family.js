// "For grown-ups", inside the app shell.
//
// Organised around how the skill DEVELOPS rather than as a list of tips: where
// it comes from, what the three stages look like, how to tell your child is
// ready to move on, and what it is preparing them for. A parent who can see
// the arc knows why this week matters and stops asking "when do they learn
// real maths".

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill, loadGrade } from '../engine/curriculum.js';
import { loadProgress, skillRecord, GOAL_DAYS } from '../engine/model.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const [skill, gradeData] = await Promise.all([findSkill(grade, skillId), loadGrade(grade)]);
  if (!skill) throw new Error(`No skill ${skillId}`);

  const lang = app.lang;
  const pick = (o) => o?.[lang] ?? o?.en;
  const family = skill.family || {};

  const record = skillRecord(loadProgress(app.profile.id), skillId);
  const reached = record.mastered ? skill.stages.length : record.stage;

  // Where this skill sits in the grade, so the sequence is visible.
  const position = gradeData.skills.findIndex((s) => s.id === skillId);
  const previous = position > 0 ? gradeData.skills[position - 1] : null;
  const next = position < gradeData.skills.length - 1 ? gradeData.skills[position + 1] : null;

  mount(container,
    el('div', { class: 'card' },
      el('p', { class: 'strategy__label', text: t('family.skillN', {
        n: position + 1, total: gradeData.skills.length,
      }) }),
      el('h2', { class: 'flush', text: skill.title[lang] || skill.title.en }),
      el('p', { class: 'muted', text: `${t('skill.standard')} ${skill.ccss}` }),
    ),

    // --- what it builds on -------------------------------------------------
    family.buildsOn
      ? el('div', { class: 'card' },
          el('h3', { class: 'flush', text: t('family.buildsOn') }),
          el('p', { text: pick(family.buildsOn) }),
          previous
            ? el('p', { class: 'muted', text: `← ${previous.title[lang] || previous.title.en}` })
            : null,
        )
      : null,

    el('div', { class: 'card' },
      el('h3', { class: 'flush', text: t('family.why') }),
      el('p', { text: pick(family.why) || t('family.noContent') }),
    ),

    // --- the three stages, and where the child is now ----------------------
    el('div', { class: 'card' },
      el('h3', { class: 'flush', text: t('family.howItGrows') }),
      el('ol', { class: 'stagelist' },
        skill.stages.map((stage, i) =>
          el('li', {
            class: 'stagelist__item',
            dataset: { state: i < reached ? 'done' : i === reached ? 'now' : 'todo' },
          },
            el('span', { class: 'stagelist__label', text: stage.label[lang] || stage.label.en }),
            i === reached && !record.mastered
              ? el('span', { class: 'chip', text: t('family.hereNow') })
              : i < reached
                ? el('span', { class: 'stagelist__tick', 'aria-hidden': 'true', text: '✓' })
                : null,
          ),
        ),
      ),
      family.readyWhen
        ? el('p', { class: 'muted', text: `${t('family.readyWhen')}: ${pick(family.readyWhen)}` })
        : null,
    ),

    family.say
      ? el('div', { class: 'card' },
          el('h3', { class: 'flush', text: t('family.sayThis') }),
          el('ul', { class: 'say-list' }, pick(family.say).map((line) => el('li', { text: line }))),
        )
      : null,

    // The most important block on the page. A family who believes their own
    // method is wrong stops helping at all.
    el('div', { class: 'callout' },
      el('h3', { class: 'flush', text: t('family.okYourWay') }),
      el('p', { class: 'flush', text: t('family.okYourWayBody') }),
    ),

    el('div', { class: 'card' },
      el('h3', { class: 'flush', text: t('family.fiveDays') }),
      el('ol', { class: 'say-list' },
        ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri'].map((d, i) =>
          el('li', {},
            el('strong', { text: `${t(d)}: ` }),
            [t('activity.learn'), t('activity.practice'), t('activity.play'),
             t('activity.practice'), t('activity.check')][i],
          ),
        ),
      ),
      el('p', { class: 'muted', text: t('family.goal', { n: GOAL_DAYS }) }),
    ),

    family.game
      ? el('div', { class: 'card' },
          el('h3', { class: 'flush', text: t('family.game') }),
          el('p', { class: 'gamename', text: pick(family.game.name) }),
          el('p', {}, el('strong', { text: `${t('family.needs')}: ` }), pick(family.game.needs)),
          el('p', { class: 'flush' }, el('strong', { text: t('family.howToPlay') })),
          el('ol', { class: 'say-list' }, pick(family.game.how).map((s) => el('li', { text: s }))),
        )
      : null,

    // --- what it leads to --------------------------------------------------
    family.leadsTo
      ? el('div', { class: 'card' },
          el('h3', { class: 'flush', text: t('family.leadsTo') }),
          el('p', { text: pick(family.leadsTo) }),
          next
            ? el('p', { class: 'muted', text: `→ ${next.title[lang] || next.title.en}` })
            : null,
        )
      : null,

    el('div', { class: 'card no-print' },
      el('div', { class: 'row' },
        el('button', { class: 'btn', onClick: () => window.print() }, t('family.print')),
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => app.go(`g/${grade}/${skillId}`),
        }, t('family.backToPractice')),
      ),
      el('p', { class: 'muted', text: `${app.config.TEACHER_NAME} · ${app.config.SCHOOL_NAME}` }),
    ),
  );
}
