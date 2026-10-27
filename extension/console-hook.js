// [INPUT] console.* calls, uncaught errors and unhandled rejections in a page the user chose to record.
// [OUTPUT] A bounded in-page ring buffer (window.__beatConsole) that the console tool reads.
// [POS] MAIN world, opt-in per site via console(action:"start"). Works in Chrome and Firefox.
// [PROTOCOL] Always forwards to the original console method; never swallows, alters or blocks output.
(() => {
  if (window.__beatConsole) return;
  const MAX = 500;
  const buf = [];
  let seq = 0;
  // Shallow, size-bounded formatting: React fibers and DOM trees are huge and cyclic.
  const fmt = (v, depth = 0) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string') return depth ? JSON.stringify(v.length > 200 ? v.slice(0, 200) + '…' : v) : v;
    if (typeof v !== 'object' && typeof v !== 'function') return String(v);
    if (typeof v === 'function') return `ƒ ${v.name || 'anonymous'}()`;
    try {
      if (v instanceof Error) return `${v.name}: ${v.message}${depth ? '' : `\n${String(v.stack || '').split('\n').slice(0, 6).join('\n')}`}`;
      if (typeof Node !== 'undefined' && v instanceof Node) {
        return v.nodeType === 1 ? `<${v.nodeName.toLowerCase()}${v.id ? '#' + v.id : ''}${v.classList?.length ? '.' + [...v.classList].slice(0, 3).join('.') : ''}>` : `#${v.nodeName}`;
      }
      if (depth > 1) return Array.isArray(v) ? `Array(${v.length})` : '{…}';
      if (Array.isArray(v)) return `[${v.slice(0, 20).map((x) => fmt(x, depth + 1)).join(', ')}${v.length > 20 ? ', …' : ''}]`;
      const keys = Object.keys(v);
      return `{${keys.slice(0, 20).map((k) => `${k}: ${fmt(v[k], depth + 1)}`).join(', ')}${keys.length > 20 ? ', …' : ''}}`;
    } catch {
      return '[unreadable]';
    }
  };
  const push = (level, args) => {
    let text;
    try { text = args.map((a) => fmt(a)).join(' '); } catch { text = '[unreadable]'; }
    buf.push({ seq: ++seq, t: Date.now(), level, text: text.length > 4000 ? text.slice(0, 4000) + '…' : text });
    if (buf.length > MAX) buf.shift();
  };
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function (...args) {
      push(level, args);
      return original.apply(this, args);
    };
  }
  addEventListener('error', (e) => {
    if (e.target !== window) return;   // resource load errors bubble here too; only script errors count
    push('uncaught', [e.error || e.message, `@ ${e.filename || '?'}:${e.lineno || 0}:${e.colno || 0}`]);
  }, true);
  addEventListener('unhandledrejection', (e) => push('unhandledrejection', [e.reason]));
  Object.defineProperty(window, '__beatConsole', {
    configurable: true,
    value: {
      read: (after = 0) => buf.filter((r) => r.seq > after),
      clear: () => { buf.length = 0; },
      last: () => seq,
      since: performance.timeOrigin,
    },
  });
})();
