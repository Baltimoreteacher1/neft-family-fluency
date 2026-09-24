/**
 * Family Fluency -- weekly progress form + decoding dashboard
 * ---------------------------------------------------------------------------
 * Creates, in YOUR Google account:
 *   1. A Google Form, "Family Fluency -- Weekly Check-In", with one short-answer
 *      question ("Progress code") and a validation rule that rejects anything
 *      that is not a 29-character code.
 *   2. A linked response Sheet, with a second tab called "Dashboard" that
 *      decodes every code into columns automatically.
 *   3. Conditional formatting on the Dashboard: red when accuracy < 70% or
 *      days < 3, green when a badge was earned.
 *
 * ============================  HOW TO USE  =================================
 * 1. Go to https://script.google.com  ->  New project.
 * 2. Delete the sample code, paste THIS whole file in, and Save.
 * 3. Run  setupProgressForm  once. Approve the permissions prompt
 *    (it creates a Form and a Sheet in YOUR Drive).
 * 4. Open View -> Logs. Copy the two values it prints into config.js:
 *       FORM_URL        and        FORM_ENTRY_ID
 * 5. Deploy the site again (or paste FORM_URL into the Teacher view's
 *    "Google Form URL override" box, which needs no redeploy).
 *
 * Other functions you can run:
 *   testDecoder()       - checks DECODE_PROGRESS against the shared test
 *                         vectors. Run this if you ever change the format.
 *   rebuildDashboard()  - re-writes the Dashboard tab's formulas.
 * ===========================================================================
 *
 * ---------------------------------------------------------------------------
 * DECODE_PROGRESS() BELOW IS A PORT OF engine/progressCode.js.
 * The two must agree exactly. tests/vectors.json in the repo is the contract,
 * and testDecoder() checks this side against it. If you change the bit layout
 * in one place, change it in the other and regenerate the vectors.
 * ---------------------------------------------------------------------------
 */

var FORM_TITLE = 'Family Fluency — Weekly Check-In';
var SHEET_TITLE = 'Family Fluency — Progress';
var DASHBOARD_TAB = 'Dashboard';

// ===========================================================================
// SETUP
// ===========================================================================

function setupProgressForm() {
  var form = FormApp.create(FORM_TITLE);
  form.setDescription(
    'Send your weekly practice code. The code has no name in it — just a class ' +
    'code and a list number.\n\n' +
    'Envie su codigo semanal de practica. El codigo no lleva ningun nombre: solo ' +
    'un codigo de clase y un numero de lista.'
  );
  form.setCollectEmail(false);          // no personal data, by design
  form.setLimitOneResponsePerUser(false); // families share devices
  form.setAllowResponseEdits(true);
  form.setProgressBar(false);

  var item = form.addTextItem();
  item.setTitle('Progress code');
  item.setHelpText(
    'Tap "Send to teacher" in the app and this fills in by itself. ' +
    'Dashes are fine. / Los guiones no importan.'
  );
  item.setRequired(true);

  // Reject anything that is not 29 code characters, ignoring dashes and spaces.
  // The alphabet excludes I, L, O and U so a handwritten code cannot be
  // misread; the app folds those letters back before encoding.
  var validation = FormApp.createTextValidation()
    .setHelpText('That does not look like a progress code.')
    .requireTextMatchesPattern('^[\\s-]*([0-9A-Za-z][\\s-]*){28,29}$')
    .build();
  item.setValidation(validation);

  // Linked response sheet.
  var ss = SpreadsheetApp.create(SHEET_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // setDestination attaches asynchronously; reopen to see the new tab.
  SpreadsheetApp.flush();
  ss = SpreadsheetApp.openById(ss.getId());

  buildDashboard_(ss);

  var entryId = findEntryId_(form);

  Logger.log('=======================================================');
  Logger.log('Paste these two values into config.js:');
  Logger.log('');
  Logger.log('  FORM_URL:       %s', form.getPublishedUrl());
  Logger.log('  FORM_ENTRY_ID:  %s', entryId);
  Logger.log('');
  Logger.log('  Responses Sheet: %s', ss.getUrl());
  Logger.log('  Edit the form:   %s', form.getEditUrl());
  Logger.log('=======================================================');

  return {
    formUrl: form.getPublishedUrl(),
    entryId: entryId,
    sheetUrl: ss.getUrl()
  };
}

/**
 * The prefill field id, as "entry.123456789".
 *
 * Apps Script does not expose it directly, so we generate a prefilled response
 * and read the id back out of the URL it produces. That is more reliable than
 * scraping the form's HTML, which changes shape whenever Google reskins Forms.
 */
function findEntryId_(form) {
  var response = form.createResponse();
  var items = form.getItems(FormApp.ItemType.TEXT);
  response.withItemResponse(items[0].asTextItem().createResponse('PREFILLPROBE'));
  var url = response.toPrefilledUrl();
  var match = url.match(/entry\.(\d+)=PREFILLPROBE/);
  return match ? 'entry.' + match[1] : '(could not detect -- see the form’s "Get pre-filled link")';
}

function rebuildDashboard_() {
  buildDashboard_(SpreadsheetApp.getActiveSpreadsheet());
}

function rebuildDashboard() {
  rebuildDashboard_();
  Logger.log('Dashboard rebuilt.');
}

/**
 * The Dashboard tab. Every cell is a formula reading the raw responses tab, so
 * new submissions decode themselves with no trigger, no script run, and
 * nothing for the teacher to remember.
 */
function buildDashboard_(ss) {
  var responses = ss.getSheets()[0];
  var responsesName = responses.getName();

  var dash = ss.getSheetByName(DASHBOARD_TAB);
  if (dash) ss.deleteSheet(dash);
  dash = ss.insertSheet(DASHBOARD_TAB);

  var headers = [
    'Submitted', 'Class', 'Student #', 'Grade', 'Skill', 'Stage', 'Week',
    'Accuracy %', 'Days', 'Badge', 'Top missed', 'Code', 'Status'
  ];
  dash.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  dash.setFrozenRows(1);

  // ARRAYFORMULA over the whole column so the sheet grows by itself. The IF on
  // a blank code is what stops 1,000 empty rows of #VALUE! appearing.
  var q = "'" + responsesName.replace(/'/g, "''") + "'";

  dash.getRange('A2').setFormula(
    '=ARRAYFORMULA(IF(' + q + '!A2:A="","",' + q + '!A2:A))'
  );

  // v1 codes fill Week and leave Grade/Skill/Stage blank; v2 codes do the
  // reverse. One table shows both, which is what a changeover needs.
  var fields = [
    ['B', 'class'],
    ['C', 'student'],
    ['D', 'grade'],
    ['E', 'skill'],
    ['F', 'stage'],
    ['G', 'week'],
    ['H', 'accuracy'],
    ['I', 'days'],
    ['J', 'badge'],
    ['K', 'missed'],
    ['M', 'status']
  ];
  for (var i = 0; i < fields.length; i++) {
    var col = fields[i][0];
    var field = fields[i][1];
    dash.getRange(col + '2').setFormula(
      '=ARRAYFORMULA(IF(' + q + '!B2:B="","",DECODE_PROGRESS(' + q + '!B2:B,"' + field + '")))'
    );
  }
  dash.getRange('L2').setFormula(
    '=ARRAYFORMULA(IF(' + q + '!B2:B="","",' + q + '!B2:B))'
  );

  dash.setColumnWidth(1, 150);
  dash.setColumnWidth(5, 180);
  dash.setColumnWidth(11, 220);
  dash.setColumnWidth(12, 260);

  applyFormatting_(dash);

  // A short legend, so a teacher opening this in March remembers what it is.
  var note = dash.getRange('O1');
  note.setValue(
    'Decoded automatically from each submitted code. No student names are ' +
    'collected anywhere — a student is a class code plus a list number. ' +
    'Red = accuracy under 70% or fewer than 3 days. Green = badge earned.'
  );
  note.setWrap(true);
  dash.setColumnWidth(15, 320);
}

function applyFormatting_(dash) {
  var lastRow = 1000;
  var rules = [];

  // Accuracy under 70%.
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($H2<>"",$H2<70)')
      .setBackground('#fbeae6')
      .setFontColor('#a3341f')
      .setRanges([dash.getRange('H2:H' + lastRow)])
      .build()
  );

  // Fewer than 3 days of practice.
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($I2<>"",$I2<3)')
      .setBackground('#fbeae6')
      .setFontColor('#a3341f')
      .setRanges([dash.getRange('I2:I' + lastRow)])
      .build()
  );

  // Badge earned.
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$J2="yes"')
      .setBackground('#e2f4e8')
      .setFontColor('#1a6b3c')
      .setRanges([dash.getRange('A2:M' + lastRow)])
      .build()
  );

  // A code that failed its checksum.
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($M2<>"",$M2<>"ok")')
      .setBackground('#fbf1d8')
      .setFontColor('#8a6212')
      .setRanges([dash.getRange('A2:M' + lastRow)])
      .build()
  );

  dash.setConditionalFormatRules(rules);
}

// ===========================================================================
// DECODER -- a port of engine/progressCode.js. Keep the two in step.
// ===========================================================================

var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
var VERSION = 1;
var OPS = ['mult', 'div', 'xmult', 'xdiv', 'longdiv'];

var LAYOUT_VERSION = 3;
var LAYOUT_CCLEN = 3;
var LAYOUT_STUDENT = 8;
var LAYOUT_WEEK = 6;
var LAYOUT_DAYS = 3;
var LAYOUT_ACCURACY = 7;
var LAYOUT_MEDIAN = 10;
var LAYOUT_BADGE = 1;
var LAYOUT_MISSEDCOUNT = 2;
var MISSED_OP = 3;
var MISSED_A = 14;
var MISSED_B = 7;
var CHECKSUM_BITS = 10;
var TOTAL_BITS = 145;

/**
 * DECODE_PROGRESS(code, field) -- custom spreadsheet function.
 *
 * @param {string|Array} code  A progress code, or a range of them.
 * @param {string} field       class | student | week | accuracy | days |
 *                             median | badge | missed | status
 * @return The decoded value, or "" for a blank cell.
 * @customfunction
 */
function DECODE_PROGRESS(code, field) {
  // Ranges arrive as a 2-D array; map over them so ARRAYFORMULA works.
  if (Object.prototype.toString.call(code) === '[object Array]') {
    var out = [];
    for (var r = 0; r < code.length; r++) {
      var row = [];
      for (var c = 0; c < code[r].length; c++) {
        row.push(DECODE_PROGRESS(code[r][c], field));
      }
      out.push(row);
    }
    return out;
  }

  if (code === '' || code === null || code === undefined) return '';

  var result = decodeProgressCode_(String(code));
  var wanted = String(field || 'status').toLowerCase();

  if (!result.ok) {
    return wanted === 'status' ? result.error : '';
  }

  var v = result.value;
  switch (wanted) {
    case 'class':    return v.classCode;
    case 'student':  return v.studentNumber;
    case 'week':     return v.week === null || v.week === undefined ? '' : v.week;
    case 'grade':    return v.grade === undefined ? '' : v.grade;
    case 'skill':    return v.grade === undefined ? '' : skillName_(v.grade, v.skillIndex);
    case 'stage':    return v.stage === undefined ? '' : (v.stage + 1);
    case 'version':  return v.version;
    case 'accuracy': return v.accuracyPct;
    case 'days':     return v.daysPractised;
    case 'badge':    return v.badge ? 'yes' : 'no';
    case 'median':   return v.medianMs === null ? '' : v.medianMs / 1000;
    case 'missed':   return v.missed.map(prettyItem_).join(', ');
    case 'status':   return 'ok';
    default:         return 'Unknown field: ' + wanted;
  }
}

function prettyItem_(itemId) {
  var parts = String(itemId).split(':');
  if (parts.length < 2) return itemId;
  if (parts[0] === 'mult' || parts[0] === 'xmult') {
    return parts[1].replace('x', ' × ');
  }
  return parts[1].replace('/', ' ÷ ');
}

function normalizeChar_(ch) {
  var c = ch.toUpperCase();
  if (c === 'I' || c === 'L') return '1';
  if (c === 'O') return '0';
  if (c === 'U') return 'V';
  return c;
}

function checksumOf_(bits) {
  var c = 0x3ff;
  for (var i = 0; i < bits.length; i++) {
    c = ((c << 1) ^ (c >> 9) ^ bits[i]) & 0x3ff;
  }
  return c;
}

function readBits_(bits, offset, width) {
  var value = 0;
  for (var i = 0; i < width; i++) value = value * 2 + bits[offset + i];
  return value;
}

function unpackItemId_(op, a, b) {
  var name = OPS[op] || OPS[0];
  var sep = (name === 'mult' || name === 'xmult') ? 'x' : '/';
  return name + ':' + a + sep + b;
}

/**
 * Decode a code of EITHER version.
 *
 * v1 codes (29 characters, carrying a week number) are already sitting in
 * teachers' Sheets. v2 codes (28 characters, carrying grade + skill + stage)
 * came with the grade-based app. Both must keep working: a row that stops
 * decoding is a row of lost data, and the teacher has no way to get it back.
 */
function decodeProgressCode_(raw) {
  var clean = String(raw === null || raw === undefined ? '' : raw)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');

  var folded = '';
  for (var i = 0; i < clean.length; i++) folded += normalizeChar_(clean[i]);

  if (folded.length === 28) return decodeV2_(folded);

  if (folded.length !== 29) {
    return { ok: false, error: 'Expected 28 or 29 characters, got ' + folded.length };
  }

  var bits = [];
  for (var j = 0; j < folded.length; j++) {
    var v = ALPHABET.indexOf(folded[j]);
    if (v < 0) return { ok: false, error: 'Bad character "' + folded[j] + '"' };
    for (var k = 4; k >= 0; k--) bits.push((v >> k) & 1);
  }
  if (bits.length !== TOTAL_BITS) {
    return { ok: false, error: 'Wrong length after decoding' };
  }

  var payload = bits.slice(0, TOTAL_BITS - CHECKSUM_BITS);
  var given = readBits_(bits, TOTAL_BITS - CHECKSUM_BITS, CHECKSUM_BITS);
  if (checksumOf_(payload) !== given) {
    return { ok: false, error: 'Checksum failed -- the code was mistyped or damaged' };
  }

  var o = 0;
  function take(w) {
    var value = readBits_(bits, o, w);
    o += w;
    return value;
  }

  var version = take(LAYOUT_VERSION);
  if (version !== VERSION) {
    return { ok: false, error: 'Unsupported code version ' + version };
  }

  var ccLen = take(LAYOUT_CCLEN);
  var classCode = '';
  for (var m = 0; m < 4; m++) {
    var idx = take(5);
    if (m < ccLen) classCode += ALPHABET[idx];
  }

  var studentNumber = take(LAYOUT_STUDENT);
  var week = take(LAYOUT_WEEK);
  var daysPractised = take(LAYOUT_DAYS);
  var accuracyPct = take(LAYOUT_ACCURACY);
  var medianDs = take(LAYOUT_MEDIAN);
  var badge = take(LAYOUT_BADGE) === 1;
  var missedCount = take(LAYOUT_MISSEDCOUNT);

  var missed = [];
  for (var n = 0; n < 3; n++) {
    var op = take(MISSED_OP);
    var a = take(MISSED_A);
    var b = take(MISSED_B);
    if (n < missedCount) missed.push(unpackItemId_(op, a, b));
  }

  return {
    ok: true,
    value: {
      version: version,
      classCode: classCode,
      studentNumber: studentNumber,
      week: week,
      daysPractised: daysPractised,
      accuracy: accuracyPct / 100,
      accuracyPct: accuracyPct,
      medianMs: medianDs * 100,
      badge: badge,
      missed: missed
    }
  };
}

// ===========================================================================
// SELF-TEST -- the same vectors the repo's unit tests use.
// ===========================================================================

/**
 * These are tests/vectors.json, pasted. If you regenerate the vectors in the
 * repo (node tests/tools/make-vectors.mjs), paste the new codes here too.
 */
var TEST_VECTORS = [
  { name: 'typical week with a badge',
    code: '535000W3JW0RW0072102M381EG4DS',
    expect: { classCode: '6A', studentNumber: 14, week: 3, daysPractised: 4,
      accuracyPct: 92, medianMs: 2400, badge: true,
      missed: ['mult:7x8', 'div:42/6', 'longdiv:372/4'] } },
  { name: 'no badge, low accuracy, two days',
    code: '535G00E59Q1X4G1R1R000000000KX',
    expect: { classCode: '6B', studentNumber: 7, week: 5, daysPractised: 2,
      accuracyPct: 55, medianMs: 6100, badge: false, missed: ['div:56/7'] } },
  { name: 'perfect week, no misses',
    code: '6ACAK028Q40FG00000000000000W3',
    expect: { classCode: 'MRN6', studentNumber: 1, week: 8, daysPractised: 5,
      accuracyPct: 100, medianMs: 1500, badge: true, missed: [] } },
  { name: 'all fields at their minimum',
    code: '400000010000000000000000000YV',
    expect: { classCode: '', studentNumber: 0, week: 1, daysPractised: 0,
      accuracyPct: 0, medianMs: 0, badge: false, missed: [] } },
  { name: 'all fields at their maximum',
    code: '6FZZZZZZZ4ZZYFZZZTZZZZQZZZZYF',
    expect: { classCode: 'ZZZZ', studentNumber: 255, week: 63, daysPractised: 7,
      accuracyPct: 100, medianMs: 102300, badge: true,
      missed: ['longdiv:16383/127', 'xmult:16383x127', 'xdiv:16383/127'] } },
  { name: 'extended facts week',
    code: '5K00G1C6EN0Y90181V7104G0000PP',
    expect: { classCode: '601', studentNumber: 22, week: 6, daysPractised: 3,
      accuracyPct: 85, medianMs: 3000, badge: false,
      missed: ['xmult:40x7', 'xdiv:3600/9'] } }
];

/**
 * Checks this decoder against the shared vectors, then checks that a corrupted
 * code is rejected. Run it after any change to the format.
 */
function testDecoder() {
  var failures = 0;

  for (var i = 0; i < TEST_VECTORS.length; i++) {
    var vector = TEST_VECTORS[i];
    var result = decodeProgressCode_(vector.code);

    if (!result.ok) {
      Logger.log('FAIL  %s -- %s', vector.name, result.error);
      failures++;
      continue;
    }

    var got = result.value;
    var want = vector.expect;
    var problems = [];

    if (got.classCode !== want.classCode) problems.push('classCode ' + got.classCode + ' != ' + want.classCode);
    if (got.studentNumber !== want.studentNumber) problems.push('studentNumber ' + got.studentNumber + ' != ' + want.studentNumber);
    if (got.week !== want.week) problems.push('week ' + got.week + ' != ' + want.week);
    if (got.daysPractised !== want.daysPractised) problems.push('days ' + got.daysPractised + ' != ' + want.daysPractised);
    if (got.accuracyPct !== want.accuracyPct) problems.push('accuracy ' + got.accuracyPct + ' != ' + want.accuracyPct);
    if (got.medianMs !== want.medianMs) problems.push('median ' + got.medianMs + ' != ' + want.medianMs);
    if (got.badge !== want.badge) problems.push('badge ' + got.badge + ' != ' + want.badge);
    if (got.missed.join('|') !== want.missed.join('|')) {
      problems.push('missed [' + got.missed.join(', ') + '] != [' + want.missed.join(', ') + ']');
    }

    if (problems.length) {
      Logger.log('FAIL  %s -- %s', vector.name, problems.join('; '));
      failures++;
    } else {
      Logger.log('pass  %s', vector.name);
    }
  }

  // A damaged code must be caught, not silently decoded into wrong data.
  var corrupted = TEST_VECTORS[0].code.substring(0, 10) + 'Z' + TEST_VECTORS[0].code.substring(11);
  var bad = decodeProgressCode_(corrupted);
  if (bad.ok) {
    Logger.log('FAIL  a corrupted code decoded without complaint');
    failures++;
  } else {
    Logger.log('pass  a corrupted code is rejected (%s)', bad.error);
  }

  // Dashes and lowercase must survive, so a retyped code still works.
  var messy = TEST_VECTORS[0].code.toLowerCase().replace(/(.{5})/g, '$1-');
  var tidy = decodeProgressCode_(messy);
  if (!tidy.ok || tidy.value.classCode !== '6A') {
    Logger.log('FAIL  a dashed, lowercase code did not decode');
    failures++;
  } else {
    Logger.log('pass  a dashed, lowercase code decodes');
  }

  Logger.log(failures === 0
    ? '\nALL PASS -- this decoder matches engine/progressCode.js'
    : '\n' + failures + ' FAILURE(S) -- this decoder has drifted from engine/progressCode.js');

  return failures;
}


// ===========================================================================
// VERSION 2 -- a port of encodeProgressV2/decodeProgressV2 in
// engine/progressCode.js. Same rule as v1: keep the two in step, and run
// testDecoder() after any change.
// ===========================================================================

var V2_TOTAL_BITS = 140;

function decodeV2_(folded) {
  var bits = [];
  for (var j = 0; j < folded.length; j++) {
    var v = ALPHABET.indexOf(folded[j]);
    if (v < 0) return { ok: false, error: 'Bad character "' + folded[j] + '"' };
    for (var k = 4; k >= 0; k--) bits.push((v >> k) & 1);
  }
  if (bits.length !== V2_TOTAL_BITS) {
    return { ok: false, error: 'Wrong length after decoding' };
  }

  var payload = bits.slice(0, V2_TOTAL_BITS - CHECKSUM_BITS);
  var given = readBits_(bits, V2_TOTAL_BITS - CHECKSUM_BITS, CHECKSUM_BITS);
  if (checksumOf_(payload) !== given) {
    return { ok: false, error: 'Checksum failed -- the code was mistyped or damaged' };
  }

  var o = 0;
  function take(w) {
    var value = readBits_(bits, o, w);
    o += w;
    return value;
  }

  var version = take(3);
  if (version !== 2) {
    return { ok: false, error: 'Unsupported code version ' + version };
  }

  var ccLen = take(3);
  var classCode = '';
  for (var m = 0; m < 4; m++) {
    var idx = take(5);
    if (m < ccLen) classCode += ALPHABET[idx];
  }

  var studentNumber = take(8);
  var grade = take(4);
  var skillIndex = take(5);
  var stage = take(2);
  var accuracyPct = take(7);
  var daysPractised = take(3);
  var mastered = take(1) === 1;
  var missedCount = take(2);

  var missed = [];
  for (var n = 0; n < 3; n++) {
    var op = take(3);
    var a = take(14);
    var b = take(7);
    if (n < missedCount) missed.push(unpackItemId_(op, a, b));
  }

  return {
    ok: true,
    value: {
      version: version,
      classCode: classCode,
      studentNumber: studentNumber,
      grade: grade,
      skillIndex: skillIndex,
      stage: stage,
      accuracy: accuracyPct / 100,
      accuracyPct: accuracyPct,
      daysPractised: daysPractised,
      mastered: mastered,
      badge: mastered,
      missed: missed,
      week: null,
      medianMs: null
    }
  };
}

/**
 * Skill names by grade, so the Dashboard shows "Divide by 1 digit" rather than
 * "grade 4, skill 1". Positions must match the order of `skills` in each
 * curriculum/grade-N.json -- that order IS the wire format for v2.
 */
var SKILL_NAMES = {
  3: ["×2, ×5, ×10", "×4, ×8", "×3, ×6", "×9, ×7", "Division facts"],
  4: ["Extended facts", "Divide by 1 digit"],
  5: ["Divide by 2 digits"]
};

function skillName_(grade, index) {
  var list = SKILL_NAMES[grade];
  if (!list || index >= list.length) return 'Grade ' + grade + ', skill ' + (index + 1);
  return list[index];
}
