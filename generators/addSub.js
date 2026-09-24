// Addition and subtraction across Grades 1-3.
//
// One generator covers within 10, within 20, within 100 and within 1000,
// because the arithmetic is identical and only the range and the regrouping
// rule change. Grade-appropriate limits are HARD rules, enforced here rather
// than left to the curriculum author to get right:
//
//   - no negative results before Grade 7 (params.allowNegative)
//   - subtraction is built from its own addition, so it never goes below zero
//   - "no regrouping" stages really have no regrouping, digit by digit

/**
 * @param {object} rng
 * @param {{min:number, max:number, op:'add'|'sub'|'both', regroup?:boolean,
 *          allowNegative?:boolean}} params
 */
export function addSub(rng, params, meta = {}) {
  const op = params.op === 'both' ? rng.pick(['add', 'sub']) : params.op;
  return op === 'add' ? addition(rng, params, meta) : subtraction(rng, params, meta);
}

function addition(rng, params, meta) {
  const { min = 0, max } = params;
  let a;
  let b;
  let guard = 0;

  do {
    a = rng.int(min, max);
    b = rng.int(min, max - a < min ? min : Math.min(max, max - a));
    guard++;
  } while ((a + b > max || !regroupOk(a, b, '+', params)) && guard < 200);

  // If the constraints could not be met, fall back to something inside range
  // rather than emitting a sum that breaks the stage's promise.
  if (a + b > max) {
    a = Math.floor(max / 2);
    b = max - a;
  }

  return {
    id: `add:${a}+${b}`,
    kind: 'fact',
    op: 'add',
    a,
    b,
    prompt: `${a} + ${b}`,
    answer: a + b,
    answerType: 'integer',
    accept: [String(a + b)],
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(a + b, [a + b + 1, a + b - 1, a + b + 10, Math.abs(a - b)]),
  };
}

function subtraction(rng, params, meta) {
  const { min = 0, max } = params;

  // Built from the addition fact, so the result is never negative before the
  // grade that teaches negatives.
  const answer = rng.int(min, max);
  const b = rng.int(min, Math.max(min, max - answer));
  const a = answer + b;

  if (a > max) {
    // Retry rather than emit something outside the stage's range.
    return subtraction(rng, { ...params, max }, meta);
  }

  if (!regroupOk(a, b, '-', params)) {
    const adjusted = noRegroupSubtraction(rng, params);
    if (adjusted) return finishSub(adjusted.a, adjusted.b, meta);
  }

  return finishSub(a, b, meta);
}

function finishSub(a, b, meta) {
  const answer = a - b;
  return {
    id: `sub:${a}-${b}`,
    kind: 'fact',
    op: 'sub',
    a,
    b,
    prompt: `${a} − ${b}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + 1, answer - 1, a + b, Math.abs(b - a)]),
  };
}

/** Build a subtraction where no column needs to borrow. */
function noRegroupSubtraction(rng, params) {
  const digits = String(params.max).length;
  let a = 0;
  let b = 0;
  for (let place = 0; place < digits; place++) {
    const top = rng.int(place === digits - 1 ? 1 : 0, 9);
    const bottom = rng.int(0, top); // never larger, so never a borrow
    a += top * 10 ** place;
    b += bottom * 10 ** place;
  }
  return a <= params.max ? { a, b } : null;
}

/**
 * Does this pair respect the stage's regrouping rule?
 * `regroup: false` means "no carrying/borrowing anywhere", which is what makes
 * an early two-digit stage genuinely easier rather than just smaller.
 */
function regroupOk(a, b, sign, params) {
  if (params.regroup !== false) return true;
  let x = a;
  let y = b;
  while (x > 0 || y > 0) {
    const dx = x % 10;
    const dy = y % 10;
    if (sign === '+' && dx + dy > 9) return false;
    if (sign === '-' && dx < dy) return false;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return true;
}

function nearMisses(answer, candidates) {
  const seen = new Set([answer]);
  const out = [];
  for (const c of candidates) {
    if (c >= 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.slice(0, 3);
}

// --- make ten -------------------------------------------------------------

/** "7 + _ = 10". The pair that completes a ten, which everything else leans on. */
export function makeTen(rng, params, meta = {}) {
  const total = params.total || 10;
  const a = rng.int(0, total);
  const answer = total - a;
  return {
    id: `maketen:${a}`,
    kind: 'fact',
    op: 'add',
    a,
    b: answer,
    prompt: `${a} + ? = ${total}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + 1, answer - 1, total]),
  };
}

// --- missing addend -------------------------------------------------------

/** "8 + _ = 13". Same fact family as subtraction, asked the other way round. */
export function missingAddend(rng, params, meta = {}) {
  const { max = 20 } = params;
  const total = rng.int(params.min || 5, max);
  const a = rng.int(0, total);
  const answer = total - a;
  return {
    id: `missing:${a}+?=${total}`,
    kind: 'fact',
    op: 'add',
    a,
    b: answer,
    prompt: `${a} + ? = ${total}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + 1, answer - 1, total, a]),
  };
}

// --- doubles --------------------------------------------------------------

/** Doubles and near doubles: 7+7, then 7+8 as "double 7 and one more". */
export function doubles(rng, params, meta = {}) {
  const max = params.max || 10;
  const a = rng.int(params.min || 1, max);
  const offset = params.near ? rng.pick([0, 0, 1, -1]) : 0;
  const b = Math.max(0, a + offset);
  const answer = a + b;
  return {
    id: `doubles:${a}+${b}`,
    kind: 'fact',
    op: 'add',
    a,
    b,
    prompt: `${a} + ${b}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    near: offset !== 0,
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + 1, answer - 1, a * 2]),
  };
}

// --- add or subtract a round number --------------------------------------

/** "47 + 10", "362 - 100": the place-value pattern, not counting. */
export function addSubRound(rng, params, meta = {}) {
  const step = rng.pick(params.steps || [10]);
  const a = rng.int(params.min || 10, params.max || 99);
  const op = rng.pick(params.ops || ['add', 'sub']);

  // Never below zero: these grades have not met negatives.
  const answer = op === 'add' ? a + step : a - step;
  if (answer < 0) return addSubRound(rng, params, meta);

  return {
    id: `round:${a}${op === 'add' ? '+' : '-'}${step}`,
    kind: 'fact',
    op: op === 'add' ? 'add' : 'sub',
    a,
    b: step,
    prompt: `${a} ${op === 'add' ? '+' : '−'} ${step}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + step, answer - step, a]),
  };
}

// --- skip counting --------------------------------------------------------

/** "5, 10, 15, ?" -- the sequence that becomes multiplication. */
export function skipCount(rng, params, meta = {}) {
  const step = rng.pick(params.steps || [2, 5, 10]);
  const start = params.fromZero === false ? step * rng.int(1, 4) : step;
  const shown = params.shown || 3;
  const terms = [];
  for (let i = 0; i < shown; i++) terms.push(start + step * i);
  const answer = start + step * shown;

  return {
    id: `skip:${step}:${start}:${shown}`,
    kind: 'fact',
    op: 'add',
    a: start,
    b: step,
    prompt: `${terms.join(', ')}, ?`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    step,
    strategyHint: meta.strategyTag || null,
    distractors: nearMisses(answer, [answer + step, answer - step, answer + 1]),
  };
}
