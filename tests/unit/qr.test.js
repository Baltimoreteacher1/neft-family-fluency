// The QR encoder is hand-written, because this app makes no third-party
// requests and a QR image API would send a child's progress code to someone
// else's server.
//
// Hand-written means it must be proved, not eyeballed: every case below is
// rendered to a bitmap and read back with jsQR, an independent decoder. A grid
// that "looks like a QR code" and does not scan is the exact failure this test
// exists to catch. jsQR is a devDependency and never ships to the browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { qrMatrix, qrSvgString } from '../../engine/qr.js';

/** Render a matrix to an RGBA bitmap the way a camera would see it. */
function rasterise(matrix, scale = 4, quiet = 4) {
  const n = matrix.length;
  const dim = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((r + quiet) * scale + dy) * dim + (c + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, dim };
}

function roundTrip(text) {
  const { data, dim } = rasterise(qrMatrix(text));
  const out = jsQR(data, dim, dim);
  return out ? out.data : null;
}

const CASES = [
  ['a progress code', '535000W3JW0RW0072102M381EG4DS'],
  ['a maxed-out progress code', '6FZZZZZZZ4ZZYFZZZTZZZZQZZZZYF'],
  ['the site URL', 'https://neft-family-fluency.pages.dev'],
  ['the flyer URL with a class code', 'https://neft-family-fluency.pages.dev/?class=6A'],
  ['a single character', 'X'],
  ['mixed case and digits', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnop'],
  ['a payload long enough to need version 7 version-info bits', 'A'.repeat(120)],
];

for (const [name, text] of CASES) {
  test(`a real decoder reads back ${name}`, () => {
    assert.equal(roundTrip(text), text);
  });
}

test('every progress-code vector produces a scannable QR', () => {
  const vectors = JSON.parse(
    readFileSync(new URL('../vectors.json', import.meta.url), 'utf8'),
  );
  for (const v of vectors.vectors) {
    assert.equal(roundTrip(v.code), v.code, `vector "${v.name}" did not scan`);
  }
});

test('a payload beyond version 10 fails loudly rather than silently', () => {
  assert.throws(() => qrMatrix('A'.repeat(500)), /too long/);
});

test('the SVG string form contains a path and no external reference', () => {
  const svg = qrSvgString('535000W3JW0RW0072102M381EG4DS');
  assert.match(svg, /<path d="M/);
  assert.ok(!svg.includes('http://') || svg.includes('www.w3.org'));
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), 'the SVG must not reference any external host');
});
