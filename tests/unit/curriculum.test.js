// Curriculum metadata: shape, standards, both languages, and the grade accents.
//
// The arithmetic lives in generators.test.js, which samples every generator at
// every stage. This file checks the things around the maths -- the parts that
// break silently rather than loudly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GENERATORS } from '../../generators/index.js';

const here = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(here('../../curriculum/index.json'), 'utf8'));

const written = index.grades.filter((g) => existsSync(here(`../../curriculum/${g.file}`)));
const grades = written.map((g) => ({
  meta: g,
  data: JSON.parse(readFileSync(here(`../../curriculum/${g.file}`), 'utf8')),
}));
const allSkills = grades.flatMap(({ meta, data }) =>
  data.skills.map((s) => ({ ...s, grade: meta.grade })),
);

test('all eight grades are written', () => {
  assert.equal(grades.length, 8, `only ${grades.length} grade files exist`);
});

test('every skill has an id, a standard, both languages and three stages', () => {
  const ids = new Set();
  for (const skill of allSkills) {
    assert.ok(skill.id, 'a skill has no id');
    assert.ok(!ids.has(skill.id), `duplicate skill id ${skill.id}`);
    ids.add(skill.id);

    assert.ok(skill.ccss, `${skill.id} has no standard`);
    for (const lang of ['en', 'es']) {
      assert.ok(skill.title?.[lang], `${skill.id} has no ${lang} title`);
      assert.ok(skill.strategy?.[lang], `${skill.id} has no ${lang} strategy`);
    }
    assert.equal(skill.stages?.length, 3, `${skill.id} must have exactly 3 stages`);
    for (const [i, stage] of skill.stages.entries()) {
      assert.ok(stage.label?.en && stage.label?.es, `${skill.id} stage ${i} has no label`);
      assert.ok(stage.params, `${skill.id} stage ${i} has no params`);
    }
  }
});

test('grade files agree with the index', () => {
  for (const { meta, data } of grades) {
    assert.equal(data.grade, meta.grade, `${meta.file} says grade ${data.grade}`);
    assert.equal(data.schemaVersion, 2, `${meta.file} is not schema 2`);
  }
});

test('every skill names a registered generator', () => {
  for (const skill of allSkills) {
    assert.ok(
      GENERATORS[skill.generator],
      `${skill.id} names missing generator "${skill.generator}"`,
    );
  }
});

test('skill ids carry their own grade, so a misfiled skill is visible', () => {
  for (const skill of allSkills) {
    assert.ok(
      skill.id.startsWith(`g${skill.grade}-`),
      `${skill.id} is filed under grade ${skill.grade}`,
    );
  }
});

test('every grade accent passes AA against the dark background', () => {
  // The accents exist so a child can recognise their grade. One that fails
  // contrast is decoration that costs somebody the ability to read the screen.
  const BG = [0x14, 0x16, 0x1a]; // --paper in dark mode
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  for (const g of index.grades) {
    const hex = g.accent.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const c = ratio(rgb, BG);
    // 3:1 is the AA bar for large text and UI components, which is what these
    // accents are used for (headings, rings, borders).
    assert.ok(
      c >= 3,
      `grade ${g.grade} accent ${g.accent} is only ${c.toFixed(2)}:1 on the dark background`,
    );
  }
});

test('each grade has a distinct accent', () => {
  const seen = new Set(index.grades.map((g) => g.accent.toLowerCase()));
  assert.equal(seen.size, index.grades.length, 'two grades share an accent colour');
});
