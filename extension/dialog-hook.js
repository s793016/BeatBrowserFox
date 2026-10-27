// [INPUT] Page calls to alert/confirm/prompt in a tab the agent has injected into.
// [OUTPUT] A "__beatDialog" DOM event when a native dialog opens and when it closes.
// [POS] MAIN world, Firefox only: stands in for CDP's Page.javascriptDialogOpening.
// [PROTOCOL] Never answers, suppresses or delays a dialog; the native one still opens and the page gets its real result.
(() => {
  if (window.__beatDialogHook) return;
  window.__beatDialogHook = true;
  for (const type of ['alert', 'confirm', 'prompt']) {
    const native = window[type];
    if (typeof native !== 'function') continue;
    window[type] = function (...args) {
      const fire = (state) => document.dispatchEvent(new CustomEvent('__beatDialog', {
        detail: JSON.stringify({ state, type, message: String(args[0] ?? '').slice(0, 500) }),
      }));
      fire('open');
      try { return native.apply(window, args); } finally { fire('closed'); }
    };
  }
})();
