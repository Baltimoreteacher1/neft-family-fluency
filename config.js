// Everything Joel might want to change lives here. Nothing else in the app
// holds a URL, a class code or a school name.
//
// Changing this file needs a redeploy -- EXCEPT for FORM_URL, which the teacher
// view can override in the browser (Teacher -> Settings). That override is
// stored on the teacher's device only and wins over the value below, so a form
// that gets recreated mid-year does not require a push to main.

export const config = {
  // The Google Form that collects weekly progress codes.
  // Paste the value the Apps Script logs as "FORM_URL". Until then, the
  // "Send to teacher" button stays hidden rather than pointing at nothing.
  FORM_URL: '',

  // The prefill field id, logged by the same script as "FORM_ENTRY_ID".
  // Looks like: entry.123456789
  FORM_ENTRY_ID: '',

  // The class codes offered in the profile setup. Keep them short (<= 4
  // characters) and use only 0-9 and A-Z; the progress code carries 4.
  CLASS_CODES: ['6A', '6B', '6C'],

  // Where the "More from Mr. Neft" link goes.
  HUB_URL: 'https://neft-teacher-app-library.pages.dev',

  SCHOOL_NAME: 'Baltimore City Public Schools',

  // Shown on the printable flyer and the family view.
  TEACHER_NAME: 'Mr. Neft',
};

export default config;
