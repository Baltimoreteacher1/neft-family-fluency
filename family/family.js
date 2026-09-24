// The family view. Deliberately a separate page rather than a route inside the
// app: a grown-up arrives here from a printed flyer or a text message, and
// should land on the guidance without meeting a profile picker first. It also
// means the print stylesheet has a whole page to work with.

import { loadLang, t, currentLang } from '../engine/i18n.js';
import { el, mount } from '../engine/dom.js';
import { storage, KEY } from '../engine/storage.js';
import { loadCurriculum } from '../engine/setBuilder.js';
import config from '../config.js';

const main = () => document.getElementById('main');

// How many weeks exist comes from the curriculum, never from a number written
// here. A hardcoded bound is exactly what makes "add week 9 by editing JSON"
// stop being true.
let totalWeeks = 0;

function weekFromUrl() {
  const n = Number(new URLSearchParams(location.search).get('week'));
  return Number.isInteger(n) && n >= 1 && n <= totalWeeks ? n : 1;
}

async function loadCard(week) {
  const res = await fetch(`week-${String(week).padStart(2, '0')}.json`);
  if (!res.ok) throw new Error(`No card for week ${week}`);
  return res.json();
}

async function render() {
  const week = weekFromUrl();
  const lang = currentLang();
  const card = await loadCard(week);
  const pick = (obj) => obj?.[lang] ?? obj?.en;

  document.getElementById('page-title').textContent = t('family.title');
  document.getElementById('back').textContent = t('family.toStudent');

  const dayNames = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri'];
  const dayPlan = [
    t('week.learn'), t('week.practice'), t('week.play'), t('week.practice'), t('check.title'),
  ];

  mount(main(),
    el('div', { class: 'card' },
      el('p', { class: 'strategy__label', style: 'margin:0', text: t('levels.level', { n: week }) }),
      el('h2', { style: 'margin-top:4px', text: t('family.why') }),
      el('p', { text: pick(card.why) }),
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('family.sayThis') }),
      el('ul', { class: 'say-list' },
        pick(card.say).map((line) => el('li', { text: line })),
      ),
    ),

    // This block is the most important thing on the page. A family that
    // believes their own method is "wrong" stops helping altogether, and a
    // child who is told at home that school's method is wrong stops trusting
    // either one.
    el('div', { class: 'callout' },
      el('h3', { style: 'margin-top:0', text: t('family.okYourWay') }),
      el('p', { style: 'margin:0', text: t('family.okYourWayBody') }),
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('family.calendar') }),
      el('ol', { class: 'say-list' },
        dayNames.map((d, i) =>
          el('li', {},
            el('strong', { text: `${t(d)}: ` }),
            dayPlan[i],
          ),
        ),
      ),
      el('p', { class: 'muted', text: t('week.goal') }),
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('family.game') }),
      el('h3', { text: pick(card.game.name) }),
      el('p', {},
        el('strong', { text: `${t('family.gameNeeds')}: ` }),
        pick(card.game.needs),
      ),
      el('p', { style: 'margin-bottom:6px' }, el('strong', { text: t('family.gameHow') })),
      el('ol', { class: 'say-list' },
        pick(card.game.how).map((step) => el('li', { text: step })),
      ),
    ),

    el('div', { class: 'card no-print' },
      el('div', { class: 'row' },
        el('button', { class: 'btn', onClick: () => window.print() }, t('family.printCard')),
        week > 1
          ? el('a', { class: 'btn btn--ghost', href: `?week=${week - 1}` }, t('app.back'))
          : null,
        week < totalWeeks
          ? el('a', { class: 'btn btn--ghost', href: `?week=${week + 1}` }, t('app.next'))
          : null,
      ),
      el('p', { class: 'muted', style: 'margin:12px 0 0', text: `${config.TEACHER_NAME} · ${config.SCHOOL_NAME}` }),
    ),
  );
}

async function setLang(lang) {
  await loadLang(lang);
  storage.set(KEY.settings, { ...storage.get(KEY.settings, {}), lang });
  document.getElementById('lang-en').setAttribute('aria-pressed', String(lang === 'en'));
  document.getElementById('lang-es').setAttribute('aria-pressed', String(lang === 'es'));
  await render();
}

async function boot() {
  const curriculum = await loadCurriculum();
  totalWeeks = curriculum.weeks.length;

  const saved = storage.get(KEY.settings, {}).lang;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  await setLang(['en', 'es'].includes(saved) ? saved : ['en', 'es'].includes(nav) ? nav : 'en');

  document.getElementById('lang-en').addEventListener('click', () => setLang('en'));
  document.getElementById('lang-es').addEventListener('click', () => setLang('es'));
}

boot().catch((err) => {
  mount(main(), el('div', { class: 'card' }, el('p', { text: String(err.message || err) })));
});
