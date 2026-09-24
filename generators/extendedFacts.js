// Extended facts in both directions.
//
// "30 x 7" and "3600 / 9" are the same idea read two ways, and the old app
// taught them together. A skill names one generator, so this dispatches to the
// multiplication or division form rather than splitting the skill in two.

import extendedMult from './extendedMult.js';
import extendedDiv from './extendedDiv.js';

export function extendedFacts(rng, params, meta = {}) {
  const wantDiv = params.include === 'div'
    || (params.include === 'both' && rng.chance(0.5));

  return wantDiv
    ? extendedDiv(rng, {
        divisors: params.factors,
        quotients: params.others,
        scales: params.scales,
      }, meta)
    : extendedMult(rng, params, meta);
}

export default extendedFacts;
