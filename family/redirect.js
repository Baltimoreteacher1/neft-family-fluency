// /family/?week=N was the old grown-ups URL. Printed flyers and bookmarks
// still point here, so it forwards into the app rather than 404ing.

import { WEEK_TO_SKILL } from '../engine/migrate.js';

const week = Number(new URLSearchParams(location.search).get('week'));
const target = WEEK_TO_SKILL[week];

const href = target
  ? `../#/g/${target.grade}/${target.skillId}/family`
  : '../';

document.getElementById('go').setAttribute('href', href);
location.replace(href);
