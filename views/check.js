// The Friday Check: 20 seeded items, no hints, no second tries, and the badge
// decision. This is the only activity that measures anything.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { buildSet } from '../engine/setBuilder.js';
import { recordCheck, weekSummary } from '../engine/progress.js';
import { encodeProgress, formatCode, prefillUrl } from '../engine/progressCode.js';
import { storage, KEY } from '../engine/storage.js';
import { qrSvg } from '../engine/qr.js';
import { runSet } from './runner.js';

export async function render(container, app, match) {
  const weekNumber = Number(match[1]);
  const week = app.weekByNumber(weekNumber);

  mount(container,
    el('div', { class: 'card' },
      el('h2', { text: t('check.title') }),
      el('p', { text: t('check.intro') }),
      el('button', {
        class: 'btn btn--block',
        onClick: () => start(container, app, weekNumber, week),
      }, t('check.start')),
    ),
  );
}

function start(container, app, weekNumber, week) {
  // The check is seeded per profile and week but NOT per day: retaking it
  // should be the same assessment, not a search for an easier draw.
  const set = buildSet(app.curriculum, {
    week: weekNumber,
    kind: 'check',
    seed: `${app.profile.id}|${weekNumber}|check`,
  });

  runSet(container, app, {
    set,
    week,
    allowHints: false,
    onFinish: (attempts) => {
      const result = recordCheck(
        app.profile.id, weekNumber, attempts, week.mode, app.curriculum.defaults.mastery,
      );
      showResult(container, app, weekNumber, week, result);
    },
  });
}

function showResult(container, app, weekNumber, week, result) {
  const pct = Math.round(result.accuracy * 100);
  const seconds = result.medianMs == null ? '—' : (result.medianMs / 1000).toFixed(1);

  const summary = weekSummary(app.profile.id, weekNumber);
  const code = encodeProgress({
    classCode: app.profile.classCode,
    studentNumber: app.profile.studentNumber,
    week: weekNumber,
    daysPractised: summary.daysPractised,
    accuracy: summary.accuracy,
    medianMs: summary.medianMs,
    badge: summary.badge,
    missed: summary.missed,
  });

  announce(result.mastered
    ? t('check.badgeEarned', { n: week.level })
    : t('check.badgeNotYet'));

  mount(container,
    el('div', { class: 'card result' },
      el('h2', { text: t('check.resultTitle') }),
      result.mastered
        ? el('div', { class: 'badge badge--pop', 'aria-hidden': 'true', text: '⭐' })
        : null,
      el('p', { class: 'result__figure', text: `${pct}%` }),
      el('p', { class: 'muted', text: t('check.accuracy', { pct }) }),
      el('p', { class: 'muted', text: t('check.medianTime', { seconds }) }),
      el('h3', { text: result.mastered
        ? t('check.badgeEarned', { n: week.level })
        : t('check.badgeNotYet') }),
      result.nextFocus
        ? el('p', { text: t(result.nextFocus === 'speed' ? 'check.focusSpeed' : 'check.focusAccuracy') })
        : null,
    ),
    sendCard(app, code),
    el('button', {
      class: 'btn btn--block',
      onClick: () => app.go('levels'),
    }, t('practice.summaryBack')),
  );
}

function sendCard(app, code) {
  const pretty = formatCode(code);
  // The teacher's override wins, so a recreated form needs no redeploy.
  const formUrl = storage.get(KEY.formUrlOverride, null) || app.config.FORM_URL;
  const url = prefillUrl(formUrl, app.config.FORM_ENTRY_ID, code);

  const copied = el('span', { class: 'muted' });
  const qrHolder = el('div', { style: 'text-align:center' });

  return el('div', { class: 'card' },
    el('h3', { text: t('check.sendTitle') }),
    el('p', { class: 'muted', text: t('check.sendBody') }),
    el('p', { class: 'code', id: 'progress-code', text: pretty }),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(code);
            copied.textContent = t('check.copied');
          } catch {
            // Clipboard is blocked in some Android WebViews; selecting the text
            // is the fallback that always works.
            const range = document.createRange();
            range.selectNodeContents(document.getElementById('progress-code'));
            const sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }, t('check.copyCode')),
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => mount(qrHolder, qrSvg(code, { size: 180 })),
      }, t('check.showQr')),
    ),
    qrHolder,
    // Hidden rather than dead: a button that goes nowhere is worse than no
    // button, and FORM_URL is blank until the Apps Script has been run.
    url
      ? el('a', { class: 'btn btn--block', href: url, target: '_blank', rel: 'noopener' },
          t('check.sendButton'))
      : el('p', { class: 'muted', text: t('check.yourCode') }),
  );
}
