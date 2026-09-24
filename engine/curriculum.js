// Loads the grade index and, lazily, one grade at a time.
//
// Lazy on purpose: a Grade 1 phone should never download Grade 8's curriculum.
// Each grade file is fetched the first time that grade is opened and then held
// in memory for the session; the service worker keeps it for offline use.

const cache = new Map();
let indexPromise = null;

function url(file) {
  // Module-relative, so pages in subdirectories resolve the same files.
  return new URL(`../curriculum/${file}`, import.meta.url);
}

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(url('index.json')).then((r) => {
      if (!r.ok) throw new Error(`Could not load the grade list (${r.status})`);
      return r.json();
    });
  }
  return indexPromise;
}

export async function loadGrade(grade) {
  const n = Number(grade);
  if (cache.has(n)) return cache.get(n);

  const index = await loadIndex();
  const entry = index.grades.find((g) => g.grade === n);
  if (!entry) throw new Error(`No grade ${grade}`);

  const promise = fetch(url(entry.file)).then((r) => {
    if (!r.ok) throw new Error(`Could not load grade ${grade} (${r.status})`);
    return r.json();
  });
  cache.set(n, promise);
  return promise;
}

/** The grades that actually have skills written, for the "Other grades" link. */
export async function availableGrades() {
  const index = await loadIndex();
  return index.grades.map((g) => g.grade);
}

export async function gradeMeta(grade) {
  const index = await loadIndex();
  return index.grades.find((g) => g.grade === Number(grade)) || null;
}

export async function findSkill(grade, skillId) {
  const data = await loadGrade(grade);
  return data.skills.find((s) => s.id === skillId) || null;
}

/** Where a skill lives, searched across grades -- used by old-URL redirects. */
export async function locateSkill(skillId) {
  const index = await loadIndex();
  for (const g of index.grades) {
    let data;
    try {
      data = await loadGrade(g.grade);
    } catch {
      continue; // a grade whose file is not written yet
    }
    if (data.skills.some((s) => s.id === skillId)) return g.grade;
  }
  return null;
}
