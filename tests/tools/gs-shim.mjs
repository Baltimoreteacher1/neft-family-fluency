// Loads setup/progress-form.gs into Node so the Apps Script decoder can be
// tested against the same vectors as engine/progressCode.js.
//
// The .gs file is plain ES5 and its decoder touches no Google services, so it
// runs as-is in a VM context once the Apps Script globals it references at
// PARSE time exist. Nothing here stubs the decoder itself -- if it were
// reimplemented here, the test would prove nothing.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadAppsScript(path) {
  const source = readFileSync(path, 'utf8');

  // Minimal stand-ins for the services the setup functions reference. The
  // decoder never calls them; they exist so the file evaluates.
  const logs = [];
  const sandbox = {
    Logger: {
      log: (...args) => {
        const [fmt, ...rest] = args;
        let i = 0;
        logs.push(
          typeof fmt === 'string' && rest.length
            ? fmt.replace(/%s/g, () => String(rest[i++]))
            : String(fmt),
        );
      },
    },
    FormApp: {},
    SpreadsheetApp: {},
    DriveApp: {},
    PropertiesService: {},
    console,
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: path });

  return { context, sandbox, logs };
}
