// Service worker: the app must work with the network off.
//
// Strategy is cache-first for everything in the shell, because every asset here
// is versioned by this file's CACHE_VERSION rather than by a hash in its name.
// That is the trade: one constant to remember, no build step to forget.
//
// ---------------------------------------------------------------------------
// BUMP CACHE_VERSION whenever any cached file changes, or returning families
// keep the old app forever. This is the single most common way to ship a fix
// that nobody receives.
// ---------------------------------------------------------------------------

const CACHE_VERSION = 'v4';
const CACHE = `ewl-fluency-${CACHE_VERSION}`;

// Everything needed to run offline from a cold start. The curriculum and both
// language files are included deliberately: a family that installs the app on
// school wifi and opens it at home must find its questions already here.
// Canonical paths only. Cloudflare Pages 308-redirects "/index.html" to "/",
// and a service worker may not hand a redirected response to a navigation --
// doing so fails the navigation outright. So the directory form is what gets
// cached, and requests for the .html form are normalised in the fetch handler.
const SHELL = [
  './',
  'app.css',
  'app.js',
  'config.js',
  'manifest.webmanifest',
  'curriculum/skills.json',
  'i18n/en.json',
  'i18n/es.json',
  'engine/rng.js',
  'engine/storage.js',
  'engine/i18n.js',
  'engine/dom.js',
  'engine/mastery.js',
  'engine/progress.js',
  'engine/progressCode.js',
  'engine/setBuilder.js',
  'engine/hints.js',
  'engine/qr.js',
  'engine/generators/multFact.js',
  'engine/generators/divFact.js',
  'engine/generators/extendedMult.js',
  'engine/generators/extendedDiv.js',
  'engine/generators/longDivision.js',
  'views/profiles.js',
  'views/levels.js',
  'views/week.js',
  'views/learn.js',
  'views/practice.js',
  'views/procedure.js',
  'views/play.js',
  'views/check.js',
  'views/runner.js',
  'views/keypad.js',
  'family/',
  'family/family.js',
  // The week cards are NOT listed here -- they are derived from the curriculum
  // at install time, so adding week 9 stays a JSON-only change.
  'teacher/',
  'teacher/teacher.js',
  'qr',
  'qr.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-maskable.png',
];

/**
 * The family cards, one per week in the curriculum. Reading the curriculum
 * here rather than listing the cards keeps "add a week by editing JSON" true:
 * a week added to skills.json is precached on the next service-worker install
 * without anyone remembering to edit this file.
 */
async function familyCards() {
  try {
    const res = await fetch('curriculum/skills.json', { cache: 'reload' });
    if (!res.ok) return [];
    const curriculum = await res.json();
    return curriculum.weeks.map(
      (w) => `family/week-${String(w.week).padStart(2, '0')}.json`,
    );
  } catch {
    // Offline during install is possible; the fetch handler caches these on
    // demand, so a missing precache costs one online visit, not the feature.
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const shell = SHELL.concat(await familyCards());
      // addAll is all-or-nothing: one 404 and the whole install fails, leaving
      // families with no offline app and no clue why. Cache individually and
      // report what is missing instead.
      await Promise.all(
        shell.map(async (url) => {
          try {
            const request = new Request(url, { cache: 'reload' });
            const response = await fetch(request);
            if (!response.ok) throw new Error(`${response.status} for ${url}`);
            await putClean(cache, new Request(url), response);
          } catch (err) {
            console.warn(`[sw] could not cache ${url}`, err);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

/**
 * Store a response with no redirect flag on it.
 *
 * A response that arrived via a redirect is tainted for navigations: returning
 * one from a service worker throws and the page fails to load. Rebuilding it
 * from its own body and headers produces an identical response that is safe to
 * serve. This is not paranoia -- Pages redirects every "/x.html" to "/x".
 */
async function putClean(cache, request, response) {
  if (!response || !response.ok) return;
  if (!response.redirected) {
    await cache.put(request, response.clone());
    return;
  }
  const body = await response.clone().blob();
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  );
}

/** Map "/index.html" onto "/", which is what is actually cached. */
function canonical(request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/index.html')) {
    url.pathname = url.pathname.slice(0, -'index.html'.length);
    return new Request(url, { headers: request.headers });
  }
  return request;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never touch anything off-origin. There should be nothing off-origin at
  // all, and if something appears, it must not be served from our cache.
  if (url.origin !== self.location.origin) return;

  const lookup = canonical(request);

  event.respondWith(
    (async () => {
      const cached = await caches.match(lookup, { ignoreSearch: true });
      if (cached) {
        // Refresh in the background so the next open is current, but never
        // make the family wait for the network to see a page they already have.
        event.waitUntil(refresh(lookup));
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await putClean(cache, lookup, response);
        }
        // A redirected response is fine to RETURN to the browser -- it is only
        // storing and replaying one that breaks. Hand back the original.
        return response;
      } catch (err) {
        // Offline and not cached: fall back to the app shell for navigations
        // so the family sees the app rather than the browser's error page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});

async function refresh(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await putClean(cache, request, response);
    }
  } catch {
    // Offline is the normal case here, not an error worth surfacing.
  }
}
