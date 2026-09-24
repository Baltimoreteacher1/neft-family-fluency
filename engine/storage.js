// The only module in this app that is allowed to touch localStorage.
//
// Android WebViews with site data blocked throw on localStorage access rather
// than returning null, which would take the whole app down on exactly the
// devices this portal exists to serve. Every read and write goes through here
// and falls back to an in-memory object, so the app degrades to "works for this
// session" instead of "white screen".
//
// Keys are namespaced `nff_v2_`. The previous version used `ewl_`; those keys
// are read once by engine/migrate.js and then left alone -- never deleted, so a
// family who opens an old cached copy of the app still finds their progress.

export const storage = {
  _memory: {},
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      this._memory[key] = value;
    }
  },
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return this._memory[key] ?? def;
    }
  },
};

const NS = 'nff_v2_';

export const KEY = {
  profiles: `${NS}profiles`,
  activeProfile: `${NS}active_profile`,
  settings: `${NS}settings`,
  /** Per-profile progress: one record per skill the child has touched. */
  progress: (profileId) => `${NS}progress_${profileId}`,
  /** Set once the v1 -> v2 migration has succeeded. */
  migrated: `${NS}migrated`,
  /** A verbatim copy of every v1 key, written before anything is converted. */
  backup: `${NS}v1_backup`,

  /** Teacher device only: codes pasted here, and the Google Form overrides. */
  teacherCodes: `${NS}teacher_codes`,
  formUrlOverride: `${NS}form_url_override`,
  formEntryOverride: `${NS}form_entry_override`,
};

/** The v1 keys, read by the migration and never written again. */
export const V1_KEY = {
  profiles: 'ewl_profiles',
  activeProfile: 'ewl_active_profile',
  settings: 'ewl_settings',
  progress: (profileId) => `ewl_progress_${profileId}`,
  teacherCodes: 'ewl_teacher_codes',
  formUrlOverride: 'ewl_form_url_override',
  formEntryOverride: 'ewl_form_entry_override',
  bestScore: (profileId, gameId) => `ewl_best_${profileId}_${gameId}`,
};

/** Remove one key, tolerating a storage that throws. */
export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    delete storage._memory[key];
  }
}

/** Every key currently in storage, for the migration's backup step. */
export function allKeys() {
  try {
    return Object.keys(localStorage);
  } catch (e) {
    return Object.keys(storage._memory);
  }
}
