// The teacher view: paste progress codes, get a class table, export CSV.
//
// Entirely local. Codes are stored on this device and decoded in the browser;
// nothing is uploaded and there is no backend to upload it to. Students are
// identified as class code + list number, so this page cannot display a name
// even if someone wanted it to -- the name is not in the data.

import { loadLang, t } from '../engine/i18n.js';
import { el, mount, announce } from '../engine/dom.js';
import { storage, KEY } from '../engine/storage.js';
import { decodeAny, formatCode, parseFormLink } from '../engine/progressCode.js';
import config from '../config.js';

const main = () => document.getElementById('main');

function stored() {
  return storage.get(KEY.teacherCodes, []);
}

function save(rows) {
  storage.set(KEY.teacherCodes, rows);
}

/**
 * Add pasted codes. A code already present for the same class/student/week is
 * replaced rather than duplicated -- a family that sends twice should not
 * appear twice.
 */
function addCodes(text) {
  const lines = String(text).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const rows = stored();
  let added = 0;
  let rejected = 0;

  for (const line of lines) {
    const out = decodeAny(line);
    if (!out.ok) {
      rejected++;
      continue;
    }
    const v = out.value;
    // v1 rows are identified by week, v2 by grade+skill. Keying on whichever
    // the code carries stops a re-send appearing as a second row.
    const idOf = (r) =>
      r.version === 2
        ? `${r.classCode}|${r.studentNumber}|g${r.grade}|s${r.skillIndex}`
        : `${r.classCode}|${r.studentNumber}|w${r.week}`;
    const key = idOf(v);
    const existing = rows.findIndex((r) => idOf(r) === key);
    const row = { ...v, code: line.toUpperCase(), addedAt: Date.now() };
    if (existing >= 0) rows[existing] = row;
    else rows.push(row);
    added++;
  }

  save(rows);
  return { added, rejected };
}

function table(rows) {
  if (!rows.length) return el('p', { class: 'muted', text: t('teacher.empty') });

  const sorted = rows.slice().sort(
    (a, b) =>
      a.classCode.localeCompare(b.classCode) ||
      a.studentNumber - b.studentNumber ||
      a.week - b.week,
  );

  const head = el('tr', {},
    ['colClass', 'colStudent', 'colWhat', 'colAccuracy', 'colDays', 'colBadge', 'colMissed']
      .map((k) => el('th', { scope: 'col', text: t(`teacher.${k}`) })),
  );

  const body = sorted.map((r) => {
    // The two flags a teacher actually acts on: not enough practice, or
    // accuracy low enough that the week did not land.
    const lowAccuracy = r.accuracyPct < 70;
    const lowDays = r.daysPractised < 3;

    return el('tr', {},
      el('td', { text: r.classCode }),
      el('td', { text: `#${r.studentNumber}` }),
      // One column for "what was practised", so v1 and v2 rows sit together.
      el('td', { text: describe(r) }),
      el('td', { dataset: { flag: lowAccuracy ? 'low' : r.accuracyPct >= 90 ? 'good' : '' }, text: `${r.accuracyPct}%` }),
      el('td', { dataset: { flag: lowDays ? 'low' : '' }, text: String(r.daysPractised) }),
      el('td', { text: r.medianMs ? `${(r.medianMs / 1000).toFixed(1)}s` : '—' }),
      el('td', { dataset: { flag: r.badge ? 'good' : '' }, text: r.badge ? '⭐' : '' }),
      el('td', { style: 'white-space:normal', text: r.missed.map(pretty).join(', ') || '—' }),
    );
  });

  return el('div', { class: 'table-wrap' },
    el('table', {}, el('thead', {}, head), el('tbody', {}, body)),
  );
}

/** What this row is about, in words, whichever version the code was. */
function describe(r) {
  if (r.version === 2) {
    const name = SKILL_LABELS[r.grade]?.[r.skillIndex];
    const skill = name || `#${r.skillIndex + 1}`;
    return `G${r.grade} \u00b7 ${skill} \u00b7 ${t('teacher.stageN', { n: r.stage + 1 })}`;
  }
  return t('teacher.weekN', { n: r.week });
}

/**
 * Skill names by position, matching the order in each grade file. v2 encodes a
 * skill by its position, so this list and the curriculum must stay in step --
 * tests/unit/appsScriptDecoder.test.js enforces the same thing for the Sheet.
 */
const SKILL_LABELS = {
  3: ['\u00d72, \u00d75, \u00d710', '\u00d74, \u00d78', '\u00d73, \u00d76', '\u00d79, \u00d77', 'Division facts'],
  4: ['Extended facts', 'Divide by 1 digit'],
  5: ['Divide by 2 digits'],
};

/** "mult:7x8" reads as "7 x 8" to a human. */
function pretty(itemId) {
  const [op, rest] = String(itemId).split(':');
  if (!rest) return itemId;
  if (op === 'mult' || op === 'xmult') return rest.replace('x', ' × ');
  return rest.replace('/', ' ÷ ');
}

function toCsv(rows) {
  const header = ['class', 'student', 'version', 'week', 'grade', 'skill_index', 'stage', 'accuracy_pct', 'days_practised', 'badge', 'top_missed'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.classCode,
      r.studentNumber,
      r.version,
      r.week ?? '',
      r.grade ?? '',
      r.skillIndex ?? '',
      r.stage == null ? '' : r.stage + 1,
      r.accuracyPct,
      r.daysPractised,
      r.badge ? 'yes' : 'no',
      // Quoted: the missed list contains commas.
      `"${r.missed.map(pretty).join('; ')}"`,
    ].join(','));
  }
  return lines.join('\n');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {{message?:string}} [flash] a line to show after the rebuild.
 *
 * Adding codes re-renders the whole page, which wipes anything written into the
 * status line first. A teacher pasting a damaged code has to be told -- silence
 * reads as "accepted", and the row they expect never appears.
 */
function render(flash = {}) {
  document.getElementById('page-title').textContent = t('teacher.title');
  const rows = stored();

  const input = el('textarea', {
    id: 'codes',
    placeholder: t('teacher.pastePlaceholder'),
    'aria-label': t('teacher.pasteTitle'),
  });

  const status = el('p', {
    class: 'muted',
    role: 'status',
    'aria-live': 'polite',
    text: flash.message || '',
  });

  const override = el('input', {
    type: 'url',
    id: 'form-url',
    value: storage.get(KEY.formUrlOverride, '') || '',
    placeholder:
      config.FORM_URL ||
      'https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.123456=CODE',
  });

  const overrideStatus = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });

  mount(main(),
    el('p', { class: 'muted', text: t('teacher.subtitle') }),

    el('div', { class: 'card' },
      el('h2', { text: t('teacher.pasteTitle') }),
      input,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', {
          class: 'btn',
          onClick: () => {
            const { added, rejected } = addCodes(input.value);
            input.value = '';

            const parts = [];
            if (added) parts.push(t('teacher.added', { n: added }));
            if (rejected) parts.push(t('teacher.rejected', { n: rejected }));
            const message = parts.join(' ');

            announce(message);
            render({ message });
          },
        }, t('teacher.add')),
      ),
      status,
      el('p', { class: 'muted', text: t('teacher.noNames') }),
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('teacher.tableTitle') }),
      table(rows),
      rows.length
        ? el('div', { class: 'row', style: 'margin-top:12px' },
            el('button', {
              class: 'btn btn--ghost',
              onClick: () => download('family-fluency.csv', toCsv(rows)),
            }, t('teacher.exportCsv')),
            el('button', {
              class: 'btn btn--ghost',
              onClick: () => {
                if (!confirm(t('teacher.clearConfirm'))) return;
                save([]);
                render();
              },
            }, t('teacher.clearAll')),
          )
        : null,
    ),

    // The override exists so a form that gets recreated mid-year does not
    // require editing config.js and pushing to main.
    el('div', { class: 'card' },
      el('h2', { text: t('teacher.formOverride') }),
      el('p', { class: 'muted', text: t('teacher.formOverrideHint') }),
      override,
      overrideStatus,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', {
          class: 'btn',
          id: 'save-form-url',
          onClick: () => {
            const value = override.value.trim();
            if (!value) {
              storage.set(KEY.formUrlOverride, null);
              storage.set(KEY.formEntryOverride, null);
              overrideStatus.textContent = '';
              announce(t('app.save'));
              return;
            }

            const parsed = parseFormLink(value);
            if (!parsed) {
              overrideStatus.textContent = t('teacher.formOverrideBad');
              announce(overrideStatus.textContent);
              return;
            }

            storage.set(KEY.formUrlOverride, parsed.formUrl);
            // Only replace the entry id when the pasted link actually carried
            // one. Clearing it on a plain URL would silently break the Send
            // button for a teacher who pasted the address bar instead.
            if (parsed.entryId) storage.set(KEY.formEntryOverride, parsed.entryId);

            const entry = parsed.entryId || storage.get(KEY.formEntryOverride, null) || config.FORM_ENTRY_ID;
            overrideStatus.textContent = entry
              ? t('teacher.formOverrideOk', { entry })
              : t('teacher.formOverrideNoEntry');
            announce(overrideStatus.textContent);
          },
        }, t('app.save')),
      ),
    ),
  );
}

loadLang(storage.get(KEY.settings, {}).lang || 'en').then(render);

export { addCodes, toCsv, pretty };
