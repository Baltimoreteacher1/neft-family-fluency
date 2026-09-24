# SETUP.md

Everything that needs a human, in order. Most of it is already done — the site is
live and working. What is left is the Google Form, which is the only piece that
needs your Google account.

**Live site:** https://neft-family-fluency.pages.dev
**Repo:** https://github.com/Baltimoreteacher1/neft-family-fluency

---

## Already done for you

| | |
| --- | --- |
| ✅ | Repo created, public, default branch `main` |
| ✅ | Cloudflare Pages project `neft-family-fluency` created and **deployed** |
| ✅ | Site verified live: full journey, badge, progress code, offline, flyer, teacher decode |
| ✅ | 71 unit tests + 12 end-to-end tests passing |

**Not done yet:** the Google Form (needs your login), and Git auto-deploy
(needs a dashboard click). Both are below.

---

## Your 3-minute checklist

Only the steps that need your logins. In order.

### 1 — Create the Google Form (about 2 minutes)

1. Open **https://script.google.com** → **New project**.
2. Delete the sample code. Open `setup/progress-form.gs` from this repo, copy
   **the whole file**, paste it in, and press **Save** (⌘S).
3. In the function dropdown at the top, choose **`setupProgressForm`**, then click
   **Run**.
4. Google will ask for permission — click **Review permissions** → choose your
   account → **Advanced** → **Go to Untitled project (unsafe)** → **Allow**.
   (That warning appears for every personal Apps Script; it is your own script
   creating a Form and a Sheet in your own Drive.)
5. Open **Execution log** at the bottom. You will see:

   ```
   FORM_URL:       https://docs.google.com/forms/d/e/XXXXXXXX/viewform
   FORM_ENTRY_ID:  entry.123456789
   Responses Sheet: https://docs.google.com/spreadsheets/d/YYYYYYYY/edit
   ```

**Copy those two values.** You need them in step 2.

> While you are there, run **`testDecoder`** once. It should log `ALL PASS`. That
> confirms the Sheet decodes codes exactly the way the app encodes them.

### 2 — Put the two values into the site

Edit **`config.js`** in the repo, lines 11 and 15:

```js
FORM_URL: 'https://docs.google.com/forms/d/e/XXXXXXXX/viewform',
FORM_ENTRY_ID: 'entry.123456789',
```

Then, from the repo folder:

```bash
git add config.js && git commit -m "config: point at the live progress form" && git push
npx wrangler pages deploy . --project-name neft-family-fluency --branch main
```

**Or skip the redeploy entirely:** open
https://neft-family-fluency.pages.dev/teacher/, scroll to **Google Form URL
override**, and paste the form's **pre-filled link** (Form → ⋮ → *Get pre-filled
link* → type anything → *Get link*). That carries both values, and the override
is stored on your device. Use this if the form ever changes mid-year.

### 3 — Turn on auto-deploy from GitHub (about 1 minute, optional)

Right now the site is deployed, but a `git push` will not update it until you
connect the repo once.

1. Go to **https://dash.cloudflare.com** → **Workers & Pages** → **neft-family-fluency**.
2. **Settings** → **Builds & deployments** → **Connect to Git**.
3. Choose GitHub → **Baltimoreteacher1/neft-family-fluency**.
4. Production branch: **main**. Framework preset: **None**.
   Build command: **leave blank**. Build output directory: **`/`**.
5. **Save**.

From then on, push to `main` = deploy.

### 4 — Check the Spanish (whenever you have time, not urgent)

Every Spanish string was machine-translated and is tagged `"reviewed": false` at
the top of `i18n/es.json`. It is readable and safe to ship, but a fluent speaker
should look at it before you send the flyer home. The list below is what to check.

<details>
<summary><b>Spanish strings needing a human check</b> (154 keys in <code>i18n/es.json</code> + 8 family cards)</summary>

Highest value first — these are the ones families actually read:

| Where | What |
| --- | --- |
| `family.okYourWayBody` | The "it's OK if you do it your way" paragraph. The most important sentence in the app. |
| `profiles.privacyNote` | The privacy promise. Must be unambiguous. |
| `profiles.studentNumberHint` | "Your teacher's list number. Not your name." |
| `check.sendBody` | Explains that the code carries no name. |
| `family/week-01…08.json` → `why`, `say`, `game.how` | The whole family-facing guidance, 8 weeks × 3 blocks. |
| `check.focusAccuracy`, `check.badgeNotYet` | The "not yet, and that's fine" wording. Tone matters more than literal accuracy here. |
| `procedure.*` | Long-division step prompts. |

Accents are deliberately omitted throughout (plain ASCII) so the text renders
identically on every old Android font. Add them if you prefer — nothing depends
on their absence.

When it has been checked, set `"reviewed": true` at the top of `i18n/es.json`.

</details>

---

## Handing it to families

Print the flyer: **https://neft-family-fluency.pages.dev/qr**

Pick the class code at the top, then **Print**. One sheet gives you the English
and Spanish halves, each with a QR code that opens the site *with that class code
already selected*. Nothing to type.

The class codes offered are `6A`, `6B`, `6C` — change them in `config.js`
(`CLASS_CODES`) if yours differ. Keep them to 4 characters of A–Z and 0–9.

---

## How the weekly monitoring works

1. A student finishes the **Friday Check** and taps **Send to teacher**.
2. That opens your Google Form with the code already filled in. They press Submit.
3. The code lands in the response Sheet. The **Dashboard** tab decodes it
   automatically — class, student number, week, accuracy, days practised, median
   time, badge, top three missed facts.
4. Red means accuracy under 70% or fewer than 3 days. Green means a badge.

A code looks like `53500-0W174-02G00-00000-00000-00VM`. It contains a class code
and a list number — **no name, no email, nothing identifying**. You are the only
person who can map number 14 to a child, and that mapping never touches this
system.

If a family cannot use the form, they can read you the code and you can paste it
into the **Teacher view** at `/teacher/`, which decodes it on your device and
exports CSV.

---

## If something goes wrong

**The "Send to teacher" button is missing.** `FORM_URL` or `FORM_ENTRY_ID` is
still blank. Do step 1 and 2. The button is hidden rather than dead on purpose —
a button that goes nowhere is worse than no button.

**The Sheet shows blanks or an error in the Status column.** The code was
mistyped or truncated. The checksum catches this; ask for it again. Run
`testDecoder` in Apps Script to confirm the decoder itself is fine.

**A change did not reach families.** Bump `CACHE_VERSION` in `sw.js` and redeploy.
The service worker caches the whole app, so without that bump returning families
keep the old version. This is the most common way to ship a fix nobody receives.

**Students see an old week.** Same cause as above.

**You want to change a mastery threshold.** `curriculum/skills.json` →
`defaults.mastery`. No code change, and the tests pin the boundaries at exactly
90%/3000ms and 85%.

---

## Commands

```bash
npm test          # 71 unit tests (math, progress code, mastery, data-driven)
npm run test:e2e  # 12 end-to-end tests at 360×740
npm run serve     # http://localhost:8127

npx wrangler pages deploy . --project-name neft-family-fluency --branch main
```
