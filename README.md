# Neft Family Fluency

A free, week-by-week math fluency portal that families use at home. No accounts,
no names, no app store — open the link, pick an avatar, practice five minutes a day.

**Live:** https://neft-family-fluency.pages.dev
**MVP strand:** multiplication & division facts → multi-digit division (8 weeks).
Long-term goal: a Grade 1–8 skill ladder.

Built by Mr. Neft, Grade 6 math, Baltimore City Public Schools.
See [`SETUP.md`](SETUP.md) for the few steps that need a human.

---

## What it does

| View | For | What it is |
| --- | --- | --- |
| `/` | students | profile picker → level map → this week's four activities → badge |
| `/family/` | grown-ups | why the strategy works, what to say, a no-screen dice game, printable, EN/ES |
| `/teacher/` | you | paste progress codes → class table → CSV. Local only. |
| `/qr` | you | printable flyer, EN + ES on one sheet, with a QR to the site |

**The weekly loop:** Mon *Learn* (animated strategy explainer) · Tue/Thu *Practice*
(spiral-mixed, 3-level hints) · Wed *Play* (beat your own best) · Fri *Check*
(20 items → badge). The goal is practising **3 of 5 days**. Streaks never reset punitively.

**Mastery:** fact weeks need ≥90% accuracy *and* a median ≤3s; procedure weeks need
≥85% with no time pressure. Both thresholds live in `curriculum/skills.json`, not in code.

---

## Adding Week 9 — JSON only

This is a design constraint, not an aspiration, and
[`tests/unit/dataDriven.test.js`](tests/unit/dataDriven.test.js) enforces it.

1. Add an entry to **`curriculum/skills.json`**:

   ```json
   {
     "week": 9,
     "level": 9,
     "mode": "fact",
     "title": { "en": "Squares to 12", "es": "Cuadrados hasta 12" },
     "strategy": { "id": "skip-count-double", "en": "A number times itself", "es": "Un numero por si mismo" },
     "skills": [
       {
         "id": "w9-squares",
         "generator": "multFact",
         "params": { "factors": [11, 12], "others": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "commute": true },
         "strategyTag": "skip-count-double"
       }
     ],
     "game": { "id": "raceTrack", "params": { "seconds": 60 } }
   }
   ```

2. Add **`family/week-09.json`** — copy an existing card and rewrite the text.
   Both `en` and `es` are required; the tests check.

3. Bump `CACHE_VERSION` in **`sw.js`** so returning families get the new week.

4. `npm test && npm run test:e2e`, then push.

That is the whole procedure. The level map, the spiral mixer, the family view,
the offline cache and the progress code all read the week count from the
curriculum — there is no number 8 written anywhere for you to find.

**A new *kind* of maths** needs one more thing: a generator in
`engine/generators/`, a pure `(rng, params) → { prompt, answer, … }`. It is picked
up by name from `skills.json` and immediately covered by the 1,000-sample
verification test.

---

## Development

```bash
npm install
npm test          # 71 unit tests
npm run test:e2e  # 9 Playwright tests at 360×740
npm run serve     # http://localhost:8127
```

Chromium is preinstalled — **do not run `playwright install`**.

### What the tests actually check

- **Math verification** — every generator, 1,000 seeded samples, each answer checked
  against the arithmetic it claims. 9,000 problems per run.
- **The progress code** — 500 round-trips, and a single mistyped character caught by
  the checksum.
- **Both decoders agree** — `setup/progress-form.gs` is loaded into a VM and *executed*,
  so the Apps Script decoder and `engine/progressCode.js` are proved identical rather
  than assumed to be. `tests/vectors.json` is the contract.
- **The QR encoder** — hand-written (no image API), so every code is rasterised and read
  back with an independent decoder.
- **Hints never reveal the answer** to the question on screen.
- **Offline** — the app runs with the network disabled, and the first visit is
  ~143KB against a 300KB budget, with zero third-party requests.

---

## Architecture

```
index.html              app shell: profile picker → level map → week view
config.js               every setting you might change
curriculum/skills.json  scope & sequence + mastery criteria  ← the curriculum
engine/rng.js           seeded PRNG (mulberry32)
engine/storage.js       the storage wrapper (the only localStorage caller)
engine/generators/      one pure function per skill type
engine/mastery.js       accuracy/speed rules + the spiral mixer
engine/progressCode.js  29-character progress code + checksum
engine/qr.js            self-contained QR encoder
i18n/en.json es.json    every family-facing string
family/week-XX.json     "How to help this week" + the dice game
teacher/                paste codes → class table (local only)
setup/progress-form.gs  Apps Script: Form + Sheet + DECODE_PROGRESS()
```

Plain HTML/CSS/vanilla JS as ES modules. No framework, no build step, no CDN,
no external fonts, no third-party requests. The repo root *is* the deployed site.

See [`CLAUDE.md`](CLAUDE.md) for the constraints every change has to respect.

---

## Privacy

There are no accounts, no logins and no analytics. A profile is an avatar and a
nickname, stored on the device. A progress code carries a class code and a list
number — never a name, never an email — so the teacher view and the Google Sheet
*cannot* show who a student is. That mapping exists only on your own roster.

## License

Code: MIT. Instructional content: © Mr. Neft. See [`LICENSE`](LICENSE).
