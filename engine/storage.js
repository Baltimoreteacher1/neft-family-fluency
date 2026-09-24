// The only module in this app that is allowed to touch localStorage.
//
// Android WebViews with site data blocked throw on localStorage access rather
// than returning null, which would take the whole app down on exactly the
// devices this portal exists to serve. Every read and write goes through here
// and falls back to an in-memory object, so the app degrades to "works for this
// session" instead of "white screen".
//
// Every key is prefixed `ewl_`.

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

export const KEY = {
  profiles: 'ewl_profiles',
  activeProfile: 'ewl_active_profile',
  settings: 'ewl_settings',
  /** Per-profile progress: attempts, days practised, badges, missed facts. */
  progress: (profileId) => `ewl_progress_${profileId}`,
  /** Teacher view: codes pasted on this device. */
  teacherCodes: 'ewl_teacher_codes',
  /** Teacher view: a FORM_URL override, so a form change needs no redeploy. */
  formUrlOverride: 'ewl_form_url_override',
  /** Best game scores, per profile + game. */
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
