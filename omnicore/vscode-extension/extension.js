// Estensione VS Code Omnicore — bridge HTTP verso `npm run serve`.
// Plain JS, zero dipendenze: `vscode` lo fornisce l'host, fetch è built-in.
// Comandi: chat (webview streaming SSE), ask (input veloce), sendSelection.
const vscode = require("vscode");

function cfg() {
  const c = vscode.workspace.getConfiguration("omnicore");
  return {
    url: String(c.get("url") || "http://127.0.0.1:8100").replace(/\/$/, ""),
    token: String(c.get("token") || ""),
  };
}

function headers() {
  const { token } = cfg();
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = "Bearer " + token;
  return h;
}

async function api(path, body) {
  const r = await fetch(cfg().url + path, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401) throw new Error("non autorizzato: imposta omnicore.token come OMNICORE_API_TOKEN del server");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

function webviewHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font:13px system-ui;background:transparent;color:var(--vscode-editor-foreground);margin:0;padding:8px}
#log{white-space:pre-wrap;margin-bottom:8px}.row{display:flex;gap:6px}
input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:6px}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:6px 12px;cursor:pointer}
.tools{color:var(--vscode-descriptionForeground);font-family:monospace;font-size:12px}</style></head>
<body><div id="log"></div><div class="tools" id="tools"></div>
<div class="row"><input id="t" placeholder="chiedi a Omnicore… (confermo: … per eseguire)"><button id="b">►</button></div>
<script>const vscodeApi = acquireVsCodeApi();
const log = document.getElementById('log'), tools = document.getElementById('tools');
document.getElementById('b').onclick = send;
document.getElementById('t').onkeydown = e => { if (e.key === 'Enter') send(); };
function send(){ const t = document.getElementById('t').value.trim(); if(!t) return;
document.getElementById('t').value=''; log.textContent += '\\n> ' + t + '\\n'; tools.textContent='';
vscodeApi.postMessage({ text: t }); }
window.addEventListener('message', e => { const m = e.data;
if (m.token) log.textContent += m.token;
if (m.tool) tools.textContent += m.tool + '\\n';
if (m.done) log.textContent += '\\n'; });<\/script></body></html>`;
}

let panel = null;

function openChat(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return panel;
  }
  panel = vscode.window.createWebviewPanel("omnicoreChat", "Omnicore", vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = webviewHtml();
  panel.onDidDispose(() => (panel = null), null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      await streamToPanel(panel, String(msg.text || ""));
    } catch (e) {
      panel.webview.postMessage({ token: "\\n[errore: " + String((e && e.message) || e).slice(0, 200) + "]" });
    }
  }, null, context.subscriptions);
  return panel;
}

async function streamToPanel(target, text) {
  const { url } = cfg();
  const r = await fetch(url + "/api/chat/stream", { method: "POST", headers: headers(), body: JSON.stringify({ text }) });
  if (r.status === 401) throw new Error("non autorizzato: imposta omnicore.token");
  if (!r.ok || !r.body) throw new Error("http " + r.status);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\\n\\n");
    buf = parts.pop();
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      let e;
      try {
        e = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (e.event === "token") target.webview.postMessage({ token: e.text || "" });
      else if (e.event === "tool_start") target.webview.postMessage({ tool: "… " + e.name + " …" });
      else if (e.event === "tool_end") target.webview.postMessage({ tool: "… " + e.name + " " + (e.ok ? "ok" : "KO") });
      else if (e.event === "result") target.webview.postMessage({ done: true });
    }
  }
}

/**
 * @param {import("vscode").ExtensionContext} context
 */
function activate(context) {
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.text = "$(hubot) omnicore";
  bar.tooltip = "Omnicore: stato cervello";
  bar.command = "omnicore.chat";
  bar.show();
  context.subscriptions.push(
    bar,
    vscode.commands.registerCommand("omnicore.chat", () => openChat(context)),
    vscode.commands.registerCommand("omnicore.ask", async () => {
      const text = await vscode.window.showInputBox({ prompt: "Chiedi a Omnicore (confermo: … per eseguire)" });
      if (!text) return;
      try {
        const res = await api("/api/chat", { text });
        const doc = await vscode.workspace.openTextDocument({ content: String(res.reply || JSON.stringify(res)), language: "markdown" });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      } catch (e) {
        vscode.window.showErrorMessage("Omnicore: " + String((e && e.message) || e).slice(0, 200));
      }
    }),
    vscode.commands.registerCommand("omnicore.sendSelection", async () => {
      const ed = vscode.window.activeTextEditor;
      const sel = ed ? ed.document.getText(ed.selection) : "";
      if (!sel.trim()) {
        vscode.window.showWarningMessage("Omnicore: nessuna selezione attiva");
        return;
      }
      const file = ed ? ed.document.fileName : "?";
      const p = openChat(context);
      p.webview.postMessage({ token: "\\n[file " + file + " selezionato]\\n" });
      await streamToPanel(p, "Contesto da " + file + ":\n```\n" + sel.slice(0, 4000) + "\n```\nSpiegalo brevemente.");
    }),
  );
  // Stato cervello (best-effort, mai bloccante).
  fetch(cfg().url + "/api/doctor", { headers: headers() })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.active) bar.text = "$(hubot) omnicore:" + j.active;
    })
    .catch(() => {});
}

function deactivate() {}

module.exports = { activate, deactivate };
