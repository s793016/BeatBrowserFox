// [INPUT] Firefox's promise-based `browser` namespace.
// [OUTPUT] A `chrome` global the shared extension code can await, plus MV3 names mapped to MV2 ones.
// [POS] Firefox build only; prepended to isolated-world scripts and loaded first in extension pages.
// [PROTOCOL] Never injected into the page's MAIN world.
(() => {
  if (typeof browser === 'undefined' || globalThis.__beatFirefoxCompat) return;
  globalThis.__beatFirefoxCompat = true;
  // In MV2 Firefox, chrome.* is callback-only and browser.* is promise-only; the shared code mostly
  // awaits, but popup.js also passes Chrome-style trailing callbacks. Accept both on the calls it uses.
  const api = Object.create(browser);
  let lastError;
  const both = (target, name) => (...args) => {
    if (typeof args[args.length - 1] !== 'function') return target[name](...args);
    const done = args.pop();
    target[name](...args).then(
      (value) => done(value),
      (error) => { lastError = { message: String(error?.message || error) }; try { done(); } finally { lastError = undefined; } },
    );
  };
  const wrap = (target, names, extra = {}) => new Proxy(target, {
    get(t, key) {
      if (key in extra) return extra[key];
      if (names.includes(key)) return both(t, key);
      const value = Reflect.get(t, key);
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });
  api.runtime = wrap(browser.runtime, ['sendMessage'], { get lastError() { return lastError; } });
  api.storage = wrap(browser.storage, [], { local: wrap(browser.storage.local, ['get', 'set', 'remove']) });
  if (!browser.action && browser.browserAction) api.action = browser.browserAction;
  // The workspace lives in sidebar_action. open() must run inside the click handler, which popup.js already does.
  if (browser.sidebarAction) api.sidePanel = { open: () => browser.sidebarAction.open() };
  try { globalThis.chrome = api; } catch { /* content sandboxes may refuse; callers then keep the original */ }
})();
