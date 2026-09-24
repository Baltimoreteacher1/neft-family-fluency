// "Send to my teacher" -- the only thing in this app that ever leaves the phone,
// and only when a family taps it.
//
// The class code and student number are asked for HERE, the first time they are
// needed, rather than at profile creation. Asking up front implied the app
// wanted identifying information to function, which it does not: a child who
// never sends anything never types anything but a nickname.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { storage, KEY } from '../engine/storage.js';
import { updateProfile, daysThisWeek, skillRecord, loadProgress } from '../engine/model.js';
import { encodeProgressV2, formatCode, prefillUrl } from '../engine/progressCode.js';
import { qrSvg } from '../engine/qr.js';
import { loadGrade } from '../engine/curriculum.js';

/**
 * The card shown under a Check result.
 * @param {{grade:number, skill:object, result:object}} ctx
 */
export function sendCard(app, ctx) {
  const host = el('div', { class: 'card' });
  paintPrompt(host, app, ctx);
  return host;
}

function paintPrompt(host, app, ctx) {
  mount(host,
    el('h3', { class: 'flush', text: t('send.title') }),
    el('p', { class: 'muted', text: t('send.body') }),
    el('button', {
      class: 'btn btn--soft btn--block',
      onClick: () => {
        const p = app.profile;
        if (p.classCode && p.studentNumber) paintCode(host, app, ctx);
        else paintAsk(host, app, ctx);
      },
    }, t('send.button')),
  );
}

/** Asked once, then remembered on the profile and editable in Settings. */
function paintAsk(host, app, ctx) {
  const code = el('input', {
    type: 'text', id: 'send-class', maxlength: '4', autocomplete: 'off',
    placeholder: '6B', 'aria-describedby': 'send-hint',
  });
  const num = el('input', {
    type: 'number', id: 'send-num', min: '1', max: '255',
    inputmode: 'numeric', autocomplete: 'off',
  });
  const error = el('p', { class: 'form-error', role: 'alert' });

  mount(host,
    el('h3', { class: 'flush', text: t('send.title') }),
    el('p', { class: 'muted', id: 'send-hint', text: t('send.askWhy') }),
    el('div', { class: 'field' },
      el('label', { for: 'send-class', text: t('settings.classCode') }),
      code,
    ),
    el('div', { class: 'field' },
      el('label', { for: 'send-num', text: t('settings.studentNumber') }),
      num,
      el('p', { class: 'muted', text: t('send.numberHint') }),
    ),
    error,
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onClick: () => {
          const c = code.value.trim().toUpperCase();
          const n = Number(num.value);
          if (!c) { error.textContent = t('send.needClass'); code.focus(); return; }
          if (!Number.isInteger(n) || n < 1 || n > 255) {
            error.textContent = t('send.needNumber'); num.focus(); return;
          }
          updateProfile(app.profile.id, { classCode: c, studentNumber: n });
          app.reloadProfile();
          paintCode(host, app, ctx);
        },
      }, t('app.save')),
      el('button', {
        class: 'btn btn--ghost',
        onClick: () => paintPrompt(host, app, ctx),
      }, t('app.cancel')),
    ),
  );
}

async function paintCode(host, app, ctx) {
  const { grade, skill, result } = ctx;
  const profile = app.profile;

  const data = await loadGrade(grade);
  const skillIndex = data.skills.findIndex((s) => s.id === skill.id);

  const record = skillRecord(loadProgress(profile.id), skill.id);
  const missed = topMissed(record);

  const code = encodeProgressV2({
    classCode: profile.classCode,
    studentNumber: profile.studentNumber,
    grade,
    skillIndex: skillIndex < 0 ? 0 : skillIndex,
    stage: result.stage,
    accuracy: result.accuracy,
    daysPractised: daysThisWeek(record).length,
    mastered: record.mastered,
    missed,
  });

  const formUrl = storage.get(KEY.formUrlOverride, null) || app.config.FORM_URL;
  const entryId = storage.get(KEY.formEntryOverride, null) || app.config.FORM_ENTRY_ID;
  const url = prefillUrl(formUrl, entryId, code);

  const qrHolder = el('div', { class: 'qr-holder' });
  const copied = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });

  mount(host,
    el('h3', { class: 'flush', text: t('send.title') }),
    el('p', { class: 'muted', text: t('send.noName') }),
    el('p', { class: 'code', id: 'progress-code', text: formatCode(code) }),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(code);
            copied.textContent = t('send.copied');
          } catch {
            const range = document.createRange();
            range.selectNodeContents(document.getElementById('progress-code'));
            const sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }, t('send.copy')),
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => mount(qrHolder, qrSvg(code, { size: 180, label: t('send.qrLabel') })),
      }, t('send.showQr')),
    ),
    copied,
    qrHolder,
    url
      ? el('a', { class: 'btn btn--block', href: url, target: '_blank', rel: 'noopener' },
          t('send.open'))
      : el('p', { class: 'muted', text: t('send.noForm') }),
  );
  announce(t('send.ready'));
}

/** The three facts most often missed, for the teacher's "keep practising". */
function topMissed(record, limit = 3) {
  return Object.entries(record.facts || {})
    .filter(([, f]) => f.missed > 0)
    .sort((a, b) => b[1].missed - a[1].missed || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}
