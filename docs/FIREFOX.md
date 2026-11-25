# BeatBrowser for Firefox

[Back to BeatBrowser](../README.md) · [Install (Chrome)](INSTALL.md) · [繁體中文](FIREFOX.zh-TW.md)

The Firefox build lets an MCP agent drive your running Firefox, including your signed-in sessions and
installed add-ons, through the same local bridge as the Chrome extension. It is built from the shared
`extension/` sources; Chrome behavior is unchanged.

Status: experimental. Tested on Firefox 158 (Windows 11) with an isolated test profile.

## How it differs from Chrome

Firefox has no `chrome.debugger` (CDP), so the extension runs on the paths BeatBrowser already uses
when High-fidelity mode is off, plus a few Firefox-specific fallbacks:

- **Input is synthetic.** Clicks, typing and keys are dispatched by the content script, so page
  listeners see `isTrusted === false`. Pages or userscripts that require trusted events will not
  react. This is an accepted limitation; nothing tries to fake `isTrusted`.
- **No background hiding.** Background tabs and windows that are not visible are throttled by Firefox
  (and put into Windows efficiency mode). On a busy machine commands can take seconds.
  Chrome keeps tabs "focused" through CDP; Firefox has no equivalent.
- **Dialogs are detected, never answered.** A small MAIN-world hook (only in tabs the agent works in)
  reports native `alert`/`confirm`/`prompt`. While one is open, page commands return
  `DIALOG_BLOCKING` and the user answers it, as in Chrome.
- **Protected pages.** Firefox refuses injection into `about:` pages, extension pages and Mozilla
  domains such as addons.mozilla.org. Commands there fail fast with `NOT_INTERACTABLE`.

## Tool support

| Tool | Firefox | Notes |
|---|---|---|
| `tabs` | Same | |
| `navigate`, `reload`, `wait` | Same | |
| `snapshot`, `read_text`, `query` | Same | |
| `network`, `fetch` | Same | `reload:true` waits for the document to finish loading first. |
| `eval` | Same on most pages | Runs in the page's own context and awaits a returned Promise (`wait`, default 10 s). No CDP fallback on pages whose CSP forbids eval; use `query` or `network`. |
| `console` | Same | Opt-in per site: records `console.*`, uncaught errors and unhandled rejections from page start-up (`start` with `reload:true`). Userscripts must run in the page context (e.g. Tampermonkey `@sandbox raw`) to be recorded. While recording, DevTools attributes log lines to `console-hook.js`. |
| `screenshot` | Better | `tabs.captureTab` captures background tabs without foregrounding. |
| `upload` (file input) | Different | Bytes are sent instead of a local path; the MCP server caps this at 48 MB. |
| `upload` (drop zone) | Same | |
| `click` (ref/selector) | Different | Synthetic events only; `real:true` falls back and says so. |
| `click` (x, y) | Different | Synthetic events on the element at the point. |
| `click` (x, y, `dragTo`) | Not supported | Needs real pointer input. |
| `type`, `fill`, `select`, `key`, `scroll` | Different | Synthetic events (`isTrusted === false`). |
| `act` | Same | Each step behaves as the tool above. |
| `ask` | Same | Use it for sign-ins, CAPTCHAs and OTPs. |
| Precise input (High-fidelity mode) | Not available | The settings toggle is hidden. |
| Workspace sidebar | Different | `sidebar_action`; opens from the popup's Workspace button or the Firefox sidebar menu. |
| TaskSpace recovery after a background restart | Weaker | No CDP target IDs, so archived pages may come back as missing. |

## Install on Windows

Requirements: Node.js 20+, Git, Firefox 128+.

1. Get the code and build the Firefox extension:

   ```bash
   git clone -b firefox-port https://github.com/s793016/BeatBrowserFox.git BeatBrowser
   cd BeatBrowser
   npm install
   npm run build:firefox
   ```

   The unpacked extension is written to `dist\firefox\`.

2. Configure your agent's MCP server from this checkout:

   ```bash
   node src/cli.js install
   ```

3. Use a separate profile while testing. Run `firefox -P`, create a profile (for example
   `beat-test`) and start Firefox with it. On a new profile, accept the first-run Terms of Use prompt
   and click into the window once; until then Firefox does not load pages for the extension.

4. Load the extension temporarily: open `about:debugging#/runtime/this-firefox`, click
   **Load Temporary Add-on…** and choose `dist\firefox\manifest.json`.

5. Check the connection:

   ```bash
   node src/cli.js doctor --json
   ```

   Look for `"ok": true` and `"extensionOnline": true`.

A temporary add-on is removed whenever Firefox restarts. To keep it installed, choose one of the
options below.

## Firefox and Chrome/Edge side by side

The Firefox build talks only to a bridge on port 18910; the Chrome/Edge extension uses
18899-18903. Run the Firefox bridge with its own config directory and port, and give your agent two
MCP servers so every command names its browser:

```json
{
  "mcpServers": {
    "beat-browser": { "command": "node", "args": ["<checkout>/src/cli.js", "mcp"] },
    "beat-browser-firefox": {
      "command": "node",
      "args": ["<checkout>/src/cli.js", "mcp"],
      "env": { "BEAT_BROWSER_HOME": "<home>/.beat-browser-firefox", "BEAT_BROWSER_PORT": "18910" }
    }
  }
}
```

Check the Firefox side with the same variables set, for example in PowerShell:
`$env:BEAT_BROWSER_HOME="$HOME.beat-browser-firefox"; $env:BEAT_BROWSER_PORT="18910"; node src/cli.js doctor`.

## Keeping it installed

Release Firefox only installs signed add-ons. Two ways around reloading after every restart:

### Option A: Firefox Developer Edition, signing check off

1. Install Firefox Developer Edition and use (or create) a profile there.
2. In `about:config`, set `xpinstall.signatures.required` to `false`.
3. Package the build: `npx web-ext build -s dist/firefox -a dist --overwrite-dest`, then rename the
   ZIP in `dist\` to `.xpi`.
4. In `about:addons`, use the gear menu → **Install Add-on From File…** and pick the `.xpi`.

Trade-off: everything stays local, and you rebuild/reinstall after changes. Only Developer Edition,
Nightly and unbranded builds honor this pref.

### Option B: self-signed through AMO (unlisted)

1. Create AMO API credentials at https://addons.mozilla.org/developers/addon/api/key/.
2. Sign the build without listing it publicly:

   Put the credentials in environment variables for the current shell only, so they stay out of
   files and shell history (PowerShell shown):

   ```powershell
   $env:WEB_EXT_API_KEY = Read-Host 'JWT issuer'
   $env:WEB_EXT_API_SECRET = Read-Host 'JWT secret'
   npm run build:firefox
   npx web-ext sign -s dist/firefox --channel=unlisted --artifacts-dir dist/signed
   ```

   The manifest declares `data_collection_permissions: none`: the extension only talks to the
   bridge on 127.0.0.1. Each later signing needs a higher `version` in `firefox/manifest.json`.
   The add-on ID `beatbrowser-firefox@local` is already registered on AMO by this fork's author,
   so change `browser_specific_settings.gecko.id` in `firefox/manifest.json` to an ID of your own
   (for example `beatbrowser-firefox@<your-domain>`) before your first signing.

3. Install the signed `.xpi` from `about:addons` in release Firefox.

Trade-off: works in your normal Firefox, but every change needs a new version number and a new
signing round, and the code is uploaded to Mozilla for automated review. Do not commit the
credentials.

## Optional performance setting

On a heavily loaded machine, Firefox's Windows efficiency mode for background content processes
makes commands slow. In the profile you use for automation you may set
`dom.ipc.processPriorityManager.backgroundUsesEcoQoS` to `false` in `about:config`. This is a profile
preference; BeatBrowser never changes it for you.

## Slow reconnects after the bridge restarts

The bridge exits with the agent session that started it, so the extension reconnects whenever a new
session starts one. It checks every 5 s with a plain HTTP request and opens the WebSocket only once
the bridge answers, which keeps Firefox's failed-reconnect delay out of the way; a reconnect normally
takes 1–2 s. Firefox also lets only one WebSocket per IP address be connecting at a time. Another
add-on that keeps retrying a WebSocket to `127.0.0.1` on a port where nothing listens therefore holds
that slot for up to 60 s per retry, and the agent can give up with "extension is not connected" while
the toolbar later shows it connected. If reconnects take tens of seconds, disable such add-ons, for
example other browser-automation extensions whose local server is not running.

## Not implemented: trusted input

Two Firefox mechanisms could add trusted input, file-path uploads and dialog handling. Both are
outside this build and would change the trade-offs above:

- **WebDriver BiDi**: start Firefox with `--remote-debugging-port`. Sites can see
  `navigator.webdriver === true`, and the address bar shows the remote-control indicator.
- **WebExtension Experiments**: a privileged API bundled with the add-on. Requires Developer Edition
  or Nightly with signing checks off and `extensions.experiments.enabled`; AMO will not sign it.
