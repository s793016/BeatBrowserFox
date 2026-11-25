# BeatBrowser Firefox 版

[回到 BeatBrowser](../README.md) · [English](FIREFOX.md)

Firefox 版讓 MCP agent 透過同一個本機橋接，操作你正在執行的 Firefox，沿用登入狀態和已安裝的附加元件。它由共用的 `extension/` 原始碼建置，Chrome 版行為不變。

狀態：實驗性。在 Windows 11、Firefox 158 的獨立測試設定檔上驗證過。

## 與 Chrome 版的差異

Firefox 沒有 `chrome.debugger`（CDP），所以擴充功能使用 BeatBrowser 原本在高精度模式關閉時就有的路徑，再加上幾個 Firefox 專用的退路：

- **輸入是合成事件。**點擊、輸入、按鍵由 content script 送出，頁面看到的 `isTrusted` 是 `false`。要求 trusted 事件的網頁或 userscript 不會有反應。這是已接受的限制，不會嘗試偽造 `isTrusted`。
- **背景分頁會被降速。**看不見的分頁和視窗會被 Firefox 節流，在 Windows 上還會進入效率模式。機器忙碌時，每個指令可能要好幾秒。Chrome 版用 CDP 讓分頁保持「聚焦」，Firefox 沒有對應功能。
- **對話框只偵測、不回答。**一個在頁面 MAIN world 執行的小 hook（只注入 agent 操作過的分頁）會回報原生 `alert`/`confirm`/`prompt`。對話框開著時，頁面指令會回傳 `DIALOG_BLOCKING`，由使用者處理，跟 Chrome 版一樣。
- **受保護頁面。**Firefox 不允許注入 `about:` 頁、擴充功能頁、addons.mozilla.org 等 Mozilla 網域，這些頁面上的指令會立刻回傳 `NOT_INTERACTABLE`。

## 工具支援對照

| 工具 | Firefox | 說明 |
|---|---|---|
| `tabs` | 相同 | |
| `navigate`、`reload`、`wait` | 相同 | |
| `snapshot`、`read_text`、`query` | 相同 | |
| `network`、`fetch` | 相同 | `reload:true` 會先等頁面載入完成 |
| `eval` | 多數頁面相同 | 在頁面自己的環境執行，會等回傳的 Promise（`wait`，預設 10 秒）。CSP 禁止 eval 的頁面沒有 CDP 退路，請改用 `query` 或 `network` |
| `console` | 相同 | 依網站手動開啟：從頁面載入一開始就記錄 `console.*`、未捕捉錯誤、未處理的 rejection（`start` 加 `reload:true`）。userscript 要在頁面環境執行（例如 Tampermonkey `@sandbox raw`）才收得到。記錄期間 DevTools 會把 log 來源顯示成 `console-hook.js` |
| `screenshot` | 較好 | `tabs.captureTab` 可直接截背景分頁，不用切到前景 |
| `upload`（file input） | 不同 | 傳送檔案內容而非本機路徑，MCP server 上限 48 MB |
| `upload`（拖放區） | 相同 | |
| `click`（ref/selector） | 不同 | 只有合成事件，`real:true` 會退回並註明原因 |
| `click`（座標 x, y） | 不同 | 對該位置的元素送合成事件 |
| `click`（座標拖曳 `dragTo`） | 不支援 | 需要真實指標輸入 |
| `type`、`fill`、`select`、`key`、`scroll` | 不同 | 合成事件（`isTrusted === false`） |
| `act` | 相同 | 每一步的行為同上表 |
| `ask` | 相同 | 登入、CAPTCHA、OTP 交回給使用者 |
| 精準輸入（高精度模式） | 無 | 設定裡的開關已隱藏 |
| 工作區側欄 | 不同 | 改用 `sidebar_action`，從 popup 的「工作區」按鈕或 Firefox 側欄選單開啟 |
| 背景頁重啟後的 TaskSpace 復原 | 較弱 | 沒有 CDP target ID，封存的頁面可能被標為遺失 |

## Windows 安裝步驟

需求：Node.js 20+、Git、Firefox 128+。

1. 取得原始碼並建置 Firefox 擴充功能：

   ```bash
   git clone -b firefox-port https://github.com/s793016/BeatBrowserFox.git BeatBrowser
   cd BeatBrowser
   npm install
   npm run build:firefox
   ```

   解壓後的擴充功能會輸出到 `dist\firefox\`。

2. 從這份原始碼設定 agent 的 MCP server：

   ```bash
   node src/cli.js install
   ```

3. 測試期間使用獨立設定檔。執行 `firefox -P` 建立設定檔（例如 `beat-test`）並用它啟動 Firefox。新設定檔第一次啟動時，要先接受「使用條款」提示，並點一下視窗；在那之前 Firefox 不會替擴充功能載入頁面。

4. 暫時載入擴充功能：開啟 `about:debugging#/runtime/this-firefox`，按「載入暫時性附加元件…」，選 `dist\firefox\manifest.json`。

5. 確認連線：

   ```bash
   node src/cli.js doctor --json
   ```

   看到 `"ok": true` 和 `"extensionOnline": true` 就完成了。

暫時性附加元件在 Firefox 重新啟動後就會消失。要常駐請選下面其中一種方式。

## Firefox 與 Chrome/Edge 並用

Firefox 版只連 18910 埠的橋接；Chrome/Edge 版用 18899–18903。Firefox 的橋接要用獨立的設定目錄與埠號，並在 agent 設定兩個 MCP server，讓每個指令都明確對應一個瀏覽器：

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

檢查 Firefox 這邊時，同樣要設定這兩個環境變數，例如 PowerShell：
`$env:BEAT_BROWSER_HOME="$HOME.beat-browser-firefox"; $env:BEAT_BROWSER_PORT="18910"; node src/cli.js doctor`。

## 常駐安裝

Firefox 正式版只安裝已簽章的附加元件。有兩種方式可以不必每次重啟都重新載入：

### 方式 A：Firefox Developer Edition，關閉簽章檢查

1. 安裝 Firefox Developer Edition，並在其中使用或建立一個設定檔。
2. 在 `about:config` 把 `xpinstall.signatures.required` 設為 `false`。
3. 打包：`npx web-ext build -s dist/firefox -a dist --overwrite-dest`，再把 `dist\` 裡的 ZIP 改名為 `.xpi`。
4. 在 `about:addons` 的齒輪選單選「從檔案安裝附加元件…」，選那個 `.xpi`。

取捨：全部留在本機，改動後要重新建置、重新安裝。只有 Developer Edition、Nightly 和無品牌版會理會這個設定。

### 方式 B：透過 AMO 自行簽章（unlisted）

1. 到 https://addons.mozilla.org/developers/addon/api/key/ 建立 AMO API 金鑰。
2. 以不公開上架的方式簽章：

   把金鑰放進「只在目前視窗有效」的環境變數，不要寫進檔案或留在指令歷史（以 PowerShell 為例）：

   ```powershell
   $env:WEB_EXT_API_KEY = Read-Host 'JWT issuer'
   $env:WEB_EXT_API_SECRET = Read-Host 'JWT secret'
   npm run build:firefox
   npx web-ext sign -s dist/firefox --channel=unlisted --artifacts-dir dist/signed
   ```

   manifest 宣告了 `data_collection_permissions: none`：擴充功能只跟 127.0.0.1 上的橋接通訊。之後每次重新簽章，都要調高 `firefox/manifest.json` 的 `version`。
   附加元件 ID `beatbrowser-firefox@local` 已由這個 fork 的作者在 AMO 登記，第一次簽章前請把 `firefox/manifest.json` 的 `browser_specific_settings.gecko.id` 改成你自己的 ID（例如 `beatbrowser-firefox@<你的網域>`）。

3. 在正式版 Firefox 的 `about:addons` 安裝簽好的 `.xpi`。

取捨：可以裝在平常用的 Firefox，但每次改動都要換新版號、重新簽章，而且程式碼會上傳給 Mozilla 自動審查。不要把金鑰 commit 進 repo。

## 選用的效能設定

機器負載很重時，Firefox 對背景內容程序使用的 Windows 效率模式會讓指令變慢。你可以在自動化用的設定檔中，於 `about:config` 把 `dom.ipc.processPriorityManager.backgroundUsesEcoQoS` 設為 `false`。這是設定檔層級的偏好設定，BeatBrowser 不會替你更改。

## 橋接重啟後重連很慢

橋接會跟著啟動它的 agent 工作階段一起結束，所以每次新的工作階段啟動橋接時，擴充功能都要重新連線。擴充功能每 5 秒用一般 HTTP 請求檢查一次，橋接有回應才開 WebSocket，以避開 Firefox 的失敗重連延遲；正常情況重連只要 1–2 秒。Firefox 對同一個 IP 一次只允許一條 WebSocket 處於連線中，如果有其他附加元件一直用 WebSocket 重試連 `127.0.0.1` 上沒人監聽的埠，每次重試最多會佔住這個名額 60 秒，agent 可能因此回報「extension is not connected」，之後工具列卻又顯示已連線。重連要花數十秒時，請停用這類附加元件，例如本機伺服器沒在執行的其他瀏覽器自動化擴充。

## 未實作：trusted 輸入

Firefox 有兩種機制可以補上 trusted 輸入、以檔案路徑上傳和對話框處理。兩者都不在這個版本中，而且會改變上面的取捨：

- **WebDriver BiDi**：用 `--remote-debugging-port` 啟動 Firefox。網站看得到 `navigator.webdriver === true`，網址列會顯示遠端控制標記。
- **WebExtension Experiments**：隨附加元件提供的特權 API。需要 Developer Edition 或 Nightly，並關閉簽章檢查、開啟 `extensions.experiments.enabled`；AMO 不會簽這種附加元件。
