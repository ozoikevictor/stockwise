const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require("electron");
const { createServer, request: httpRequest } = require("node:http");
const fs = require("node:fs");
const { request: httpsRequest } = require("node:https");
const { onlineTarget } = require("./online-target.cjs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { openBackend } = require(app.isPackaged
  ? path.join(process.resourcesPath, "backend/backend.cjs")
  : "../../backend/dist/backend.cjs");

// Some Windows graphics drivers paint a window but stop delivering usable input.
// Use Chromium's software renderer while the desktop build is being validated.
app.disableHardwareAcceleration();

let mainWindow, backend, server, origin;
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.focus();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", focusMainWindow);
  app.whenReady().then(start).catch((error) => { dialog.showErrorBox("StockWise could not start", error.message); app.quit(); });
}
async function start() {
  const folder = app.getPath("userData");
  fs.mkdirSync(folder, { recursive: true });
  backend = openBackend(path.join(folder, "stockwise.sqlite"));
  const configFile = path.join(folder, "online-server.json");
  let onlineServer = onlineTarget(process.env.STOCKWISE_ONLINE_URL || "https://stockwise-online.onrender.com");
  if (fs.existsSync(configFile)) onlineServer = onlineTarget(JSON.parse(fs.readFileSync(configFile, "utf8")).url);
  ipcMain.handle("stockwise:online-config", async (event, value) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Untrusted request.");
    if (value !== undefined) {
      const next = onlineTarget(value);
      const temporary = configFile + ".tmp";
      fs.writeFileSync(temporary, JSON.stringify({url:next}), {mode:0o600});
      fs.renameSync(temporary, configFile);
      onlineServer = next;
    }
    return onlineServer;
  });
  ipcMain.handle("stockwise:offline-data", async (event, value) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Untrusted offline request.");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encrypted storage is unavailable. Offline sales cannot be saved.");
    const file = path.join(folder, "online-cache-" + createHash("sha256").update(onlineServer).digest("hex") + ".bin");
    if (value === undefined) return fs.existsSync(file) ? JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) : null;
    const text = JSON.stringify(value);
    if (text.length > 20000000 || value?.version !== 1) throw new Error("Invalid offline records or offline storage is full.");
    // Keep the last complete version for recovery; replace only after a full write.
    const temporary = file + ".tmp";
    fs.writeFileSync(temporary, safeStorage.encryptString(text));
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.renameSync(temporary, file);
  });
  const backupFolder = path.join(folder, "backups");
  fs.mkdirSync(backupFolder, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const autoBackup = path.join(backupFolder, `stockwise-${today}.sqlite`);
  if (!fs.existsSync(autoBackup)) backend.automaticBackup(autoBackup);
  if (!app.isPackaged && process.argv.includes("--dev")) origin = "http://127.0.0.1:5174";
  else {
    const root = path.resolve(__dirname, "../dist-desktop");
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon" };
    server = createServer((req, res) => {
      try {
        if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
        // Target is validated and saved through the main-process settings API.
        if (pathname.startsWith("/online-api/")) {
          if (!["GET", "POST", "PATCH", "OPTIONS"].includes(req.method)) { res.writeHead(405).end(); return; }
          const headers = { "content-type": req.headers["content-type"] || "application/json" };
          if (req.headers.authorization) headers.authorization = req.headers.authorization;
          const target = new URL(onlineServer);
          const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, path: "/api/" + pathname.slice("/online-api/".length), method: req.method, headers, timeout: 15000 }, response => {
            res.writeHead(response.statusCode || 502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            response.pipe(res);
          });
          upstream.on("timeout", () => upstream.destroy(new Error("Online server timed out")));
          upstream.on("error", () => { if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Cannot reach your online server. Check your internet connection and server address." })); else res.destroy(); });
          req.on("aborted", () => upstream.destroy());
          req.pipe(upstream);
          return;
        }
        let filename = path.resolve(root, `.${pathname}`);
        if (filename !== root && !filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) filename = path.join(root, "index.html");
        res.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'");
        fs.createReadStream(filename).pipe(res);
      } catch { res.writeHead(400).end(); }
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  ipcMain.on("stockwise:request", (event, command, args) => {
    try {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Untrusted request.");
      if (typeof command !== "string" || !Array.isArray(args)) throw new Error("Invalid request.");
      if (command === "backupDatabase") {
        const destination = dialog.showSaveDialogSync(mainWindow, { title: "Save StockWise backup to a USB drive", defaultPath: `StockWise-${Date.now()}.sqlite`, filters: [{ name: "SQLite backup", extensions: ["sqlite"] }] });
        focusMainWindow();
        if (destination) backend.backup(destination);
        event.returnValue = { ...backend.request("snapshot"), result: !!destination };
      } else event.returnValue = backend.request(command, args);
    } catch (error) { event.returnValue = { ok: false, error: error.message }; }
  });
  ipcMain.handle("stockwise:print", async (event, saleId) => {
    let printWindow;
    try {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Untrusted print request.");
      const reply = backend.receipt(saleId);
      printWindow = new BrowserWindow({ show: false, parent: mainWindow, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reply)}`);
      await new Promise((resolve, reject) => printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => success ? resolve() : reject(new Error(reason || "Printing cancelled."))));
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
    finally { printWindow?.destroy(); focusMainWindow(); }
  });
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 650, title: "StockWise", icon: path.join(__dirname, "stockwise.ico"), show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("will-navigate", (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.once("ready-to-show", () => {
    if (!process.argv.includes("--smoke-test")) { mainWindow.show(); focusMainWindow(); }
  });
  mainWindow.on("restore", focusMainWindow);
  if (!app.isPackaged) {
    const diagnosticFile = path.resolve(__dirname, "../desktop-input-diagnostics.log");
    const diagnostic = (name, detail = {}) => {
      fs.appendFileSync(diagnosticFile, JSON.stringify({ at: new Date().toISOString(), event: name, ...detail }) + "\n");
    };
    diagnostic("start", { version: app.getVersion(), electron: process.versions.electron, softwareRendering: true });
    ipcMain.on("stockwise:input-status", (event, status) => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
      if (status && typeof status === "object" && JSON.stringify(status).length < 10000) diagnostic("renderer-input", status);
    });
    mainWindow.webContents.on("preload-error", (_event, _file, error) => diagnostic("preload-error", { message: error.message }));
    mainWindow.webContents.on("render-process-gone", (_event, detail) => diagnostic("renderer-exit", { reason: detail.reason }));
    mainWindow.on("unresponsive", () => diagnostic("unresponsive"));
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") { event.preventDefault(); mainWindow.webContents.toggleDevTools(); }
    });
  }
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(origin);
}
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => { backend?.close(); server?.close(); });



