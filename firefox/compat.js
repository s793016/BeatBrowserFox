// [INPUT] Firefox's promise-based `browser` namespace.
// [OUTPUT] A `chrome` global the shared extension code can await, plus MV3 names mapped to MV2 ones.
// [POS] Firefox build only; prepended to isolated-world scripts and loaded first in extension pages.
// [PROTOCOL] Never injected into the page's MAIN world.
(() => {
  if (typeof browser === 'undefined' || globalThis.__beatFirefoxCompat) return;
  globalThis.__beatFirefoxCompat = true;
  // In MV2 Firefox, chrome.* is callback-only; the shared code awaits every call.
  const api = Object.create(browser);
  if (!browser.action && browser.browserAction) api.action = browser.browserAction;
  // The workspace lives in sidebar_action. open() must run inside the click handler, which popup.js already does.
  if (browser.sidebarAction) api.sidePanel = { open: () => browser.sidebarAction.open() };
  try { globalThis.chrome = api; } catch { /* content sandboxes may refuse; callers then keep the original */ }
})();
