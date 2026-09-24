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
    if (params.regroup === false) {
      const adjusted = noRegroupSubtraction(rng, params);
      if (adjusted) return finishSub(adjusted.a, adjusted.b, meta);
    } else {
      const borrowed = borrowingSubtraction(rng, params);
      if (borrowed) return finishSub(borrowed.a, borrowed.b, meta);
    }
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

/** Build a subtraction that definitely needs a borrow in the ones column. */
function borrowingSubtraction(rng, params) {
  const digits = String(params.max).length;
  if (digits < 2) return null;
  const topOnes = rng.int(0, 8);
  const bottomOnes = rng.int(topOnes + 1, 9); // forces the borrow
  const topTens = rng.int(1, 9);
  const bottomTens = rng.int(0, topTens - 1);
  const a = topTens * 10 + topOnes;
  const b = bottomTens * 10 + bottomOnes;
  return a <= params.max && a > b ? { a, b } : null;
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
  if (params.regroup === undefined) return true; // mixed: anything goes
  const needs = needsRegrouping(a, b, sign);
  // `regroup: false` is the easier first stage; `regroup: true` is the stage
  // that is ABOUT carrying, so a problem with no carrying does not belong in
  // it. Without the second case a "with carrying" stage quietly served the
  // same problems as the stage before it.
  return params.regroup ? needs : !needs;
}

function needsRegrouping(a, b, sign) {
  let x = a;
  let y = b;
  while (x > 0 || y > 0) {
    const dx = x % 10;
    const dy = y % 10;
    if (sign === '+' && dx + dy > 9) return true;
    if (sign === '-' && dx < dy) return true;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return false;
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
  const total = params.totals ? rng.pick(params.totals) : params.total || 10;
  const a = rng.int(0, total);
  const answer = total - a;
  // Asking the pair from the other side ("? + 6 = 10") is a genuine step up:
  // the same fact, but the child can no longer just count on from the left.
  const reversed = params.reverse && rng.chance(0.5);
  if (reversed) {
    return {
      id: `maketen-r:${total}:${answer}`,
      kind: 'fact',
      op: 'add',
      a: answer,
      b: a,
      prompt: `? + ${answer} = ${total}`,
      answer: a,
      answerType: 'integer',
      accept: [String(a)],
      strategyHint: meta.strategyTag || null,
      distractors: nearMisses(a, [a + 1, a - 1, total]),
    };
  }
  return {
    id: `maketen:${total}:${a}`,
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
  // `offsets` lets a stage widen from doubles only, to doubles plus one more,
  // to doubles either side -- so each stage is a real step rather than the
  // same problems with a new label.
  const offsets = params.offsets || (params.near ? [0, 0, 1, -1] : [0]);
  const offset = rng.pick(offsets);
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
  // Counting on from somewhere other than the first multiple is the harder
  // stage; even the easy stage varies the start, or three steps would mean
  // three problems and nothing to practise.
  const start = params.fromZero === false ? step * rng.int(2, 9) : step * rng.int(1, 3);
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
