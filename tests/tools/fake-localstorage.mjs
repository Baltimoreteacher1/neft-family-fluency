// A localStorage stand-in for node tests.
//
// The migration is the one piece of this app that can lose a child's work, so
// it is tested against the real storage API rather than a mocked wrapper --
// including the case where storage throws, which is what an Android WebView
// with site data blocked actually does.

export function installLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).filter(([k]) => !k.startsWith('$')));
  const api = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  // Object.keys(localStorage) has to work: engine/storage.js allKeys() uses it.
  const proxy = new Proxy(api, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (target, prop) =>
      prop in target ? target[prop] : store.get(String(prop)),
  });
  globalThis.localStorage = proxy;
  return proxy;
}

/** A storage that throws on every access, like a locked-down WebView. */
export function installThrowingLocalStorage() {
  const boom = () => {
    throw new DOMException('denied', 'SecurityError');
  };
  globalThis.localStorage = new Proxy(
    { getItem: boom, setItem: boom, removeItem: boom, key: boom, length: 0 },
    { ownKeys: boom, get: (t, p) => (p in t ? t[p] : boom) },
  );
}

export function uninstallLocalStorage() {
  delete globalThis.localStorage;
}
