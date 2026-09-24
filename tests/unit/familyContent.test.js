// The grown-ups page is the only part of this app a parent reads, and a skill
// that ships without it shows them "guidance is being written" -- which reads
// as "nobody finished this".
//
// The content is also where the SEQUENCE is explained: what this builds on and
// what it leads to. A missing leadsTo is a broken link in the ladder, even
// though the app still runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(here('../../curriculum/index.json'), 'utf8'));
const grades = index.grades.map((g) => ({
  meta: g,
  data: JSON.parse(readFileSync(here(`../../curriculum/${g.file}`), 'utf8')),
}));
const allSkills = grades.flatMap(({ meta, data }) =>
  data.skills.map((s) => ({ ...s, grade: meta.grade })),
);

const LANGS = ['en', 'es'];

test('every skill explains what it builds on and what it leads to', () => {
  for (const s of allSkills) {
    const f = s.family || {};
    for (const lang of LANGS) {
      assert.ok(f.buildsOn?.[lang], `${s.id} has no ${lang} "builds on"`);
      assert.ok(f.leadsTo?.[lang], `${s.id} has no ${lang} "leads to"`);
      assert.ok(f.why?.[lang], `${s.id} has no ${lang} explanation`);
    }
    assert.ok(f.readyWhen?.en && f.readyWhen?.es, `${s.id} has no "ready when"`);
  }
});

test('every skill gives a parent something to say and something to play', () => {
  for (const s of allSkills) {
    const f = s.family || {};
    for (const lang of LANGS) {
      assert.ok(f.say?.[lang]?.length >= 3, `${s.id} has fewer than 3 ${lang} prompts`);
      assert.ok(f.game?.name?.[lang], `${s.id} has no ${lang} game name`);
      assert.ok(f.game?.needs?.[lang], `${s.id} does not say what the ${lang} game needs`);
      assert.ok(f.game?.how?.[lang]?.length >= 3, `${s.id} ${lang} game has fewer than 3 steps`);
    }
  }
});

test('English and Spanish carry the same number of prompts and steps', () => {
  // Not a translation check -- a completeness check. A Spanish page with two
  // prompts where English has four is a page somebody stopped writing.
  for (const s of allSkills) {
    const f = s.family;
    assert.equal(f.say.en.length, f.say.es.length, `${s.id}: prompt counts differ`);
    assert.equal(f.game.how.en.length, f.game.how.es.length, `${s.id}: game step counts differ`);
  }
});

test('the ladder connects: a skill that names its neighbour is not the last one', () => {
  // "leadsTo" should point forwards. The last skill of Grade 8 is allowed to
  // point outside the app; nothing else should read like a dead end.
  for (const s of allSkills) {
    const text = `${s.family.leadsTo.en}`.toLowerCase();
    assert.ok(text.length > 20, `${s.id} "leads to" is too short to say anything`);
    // Deliberately narrow: "and nothing else changes" is good writing about a
    // skill that carries forward, not a dead end. Only phrases that actually
    // say the ladder stops should fail.
    assert.ok(
      !/(leads (to )?nowhere|nothing (comes )?(after|next)|this is the end|the last skill)/.test(text),
      `${s.id} describes itself as a dead end`,
    );
  }
});

test('nothing in the family content compares one child to another', () => {
  const banned = /leaderboard|rank(ing|ed)?\b|faster than (other|the other)|ahead of|behind the (class|others)|top \d+%/i;
  for (const s of allSkills) {
    const f = s.family;
    const blob = [
      f.buildsOn.en, f.buildsOn.es, f.why.en, f.why.es, f.leadsTo.en, f.leadsTo.es,
      f.readyWhen.en, f.readyWhen.es,
      ...f.say.en, ...f.say.es, ...f.game.how.en, ...f.game.how.es,
    ].join(' ');
    const hit = blob.match(banned);
    assert.equal(hit, null, `${s.id} compares children: "${hit?.[0]}"`);
  }
});

test('the no-screen games really need no screen', () => {
  const screens = /\b(app|website|tablet|screen|online|video|youtube)\b/i;
  for (const s of allSkills) {
    const needs = `${s.family.game.needs.en} ${s.family.game.needs.es}`;
    const hit = needs.match(screens);
    assert.equal(hit, null, `${s.id}'s "no-screen game" needs a screen: "${hit?.[0]}"`);
  }
});
