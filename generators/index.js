// The generator registry: a curriculum names a generator by the keys here.
//
// Every generator is a pure function (rng, params, meta) -> item, and every
// item carries `answer`, `answerType` and `accept` so engine/answer.js can
// judge equivalent forms without knowing which skill produced it.

import multFact from './multFact.js';
import divFact from './divFact.js';
import extendedMult from './extendedMult.js';
import extendedDiv from './extendedDiv.js';
import extendedFacts from './extendedFacts.js';
import longDivision from './longDivision.js';
import { addSub, makeTen, missingAddend, doubles, addSubRound, skipCount } from './addSub.js';
import { multByMultiples, multiDigitMul, multiDigitAddSub } from './multiDigit.js';
import {
  equivFraction, fractionAddSub, fractionMultiply, fractionDivide,
} from './fractions.js';
import { decimalArithmetic, powersOfTen } from './decimals.js';
import { gcfLcm, factorsMultiples } from './numberTheory.js';
import {
  evaluateExpression, oneStepEq, twoStepEq, multiStepEq,
} from './equations.js';
import { integerAddSub, integerMulDiv, rationalOp } from './integers.js';
import { unitRate, constantOfProportionality, percent } from './ratios.js';
import { expRule, roots, sciNotation, irrationalBetween, slope } from './exponents.js';

export const GENERATORS = {
  // Grade 1-2
  makeTen,
  addSub,
  missingAddend,
  doubles,
  addSubRound,
  skipCount,
  // Grade 3
  multFact,
  divFact,
  multByMultiples,
  // Grade 4
  multiDigitAddSub,
  extendedMult,
  extendedDiv,
  extendedFacts,
  multiDigitMul,
  longDivision,
  equivFraction,
  factorsMultiples,
  // Grade 5
  decimalArithmetic,
  powersOfTen,
  fractionAddSub,
  fractionMultiply,
  // Grade 6
  gcfLcm,
  fractionDivide,
  evaluateExpression,
  oneStepEq,
  unitRate,
  // Grade 7
  integerAddSub,
  integerMulDiv,
  rationalOp,
  percent,
  twoStepEq,
  constantOfProportionality,
  // Grade 8
  expRule,
  roots,
  sciNotation,
  multiStepEq,
  slope,
  irrationalBetween,
};

export default GENERATORS;
