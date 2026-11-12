// Ventana de escritorio de Formas y Filtros (Electron).
const { app, BrowserWindow, protocol, net, session, ipcMain } = require("electron");
const vcam = require("./vcam");
const path = require("path");
const { pathToFileURL } = require("url");

const WEB = path.join(__dirname, "web");
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

app.whenReady().then(() => {
  // Sirve los archivos de la carpeta web/ como app://formas/...
  protocol.handle("app", (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === "/") p = "/index.html";
    const file = path.normalize(path.join(WEB, p));
    if (!file.startsWith(WEB)) return new Response("Prohibido", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Solo se concede cámara y pantalla completa.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media" || perm === "fullscreen"));

  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 480, minHeight: 480,
    backgroundColor: "#0b0b10", autoHideMenuBar: true, title: "Formas y Filtros",
    icon: path.join(WEB, "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") },
  });
  win.loadURL("app://formas/index.html");
});

ipcMain.handle("vcam:start", async (_e, w, h, fps) => {
  try { return await vcam.start(w, h, fps); }
  catch (err) { return { ok: false, error: "No se pudo iniciar la cámara virtual: " + err.message }; }
});
ipcMain.on("vcam:frame", (_e, data) => { try { vcam.write(data); } catch {} });
ipcMain.handle("vcam:stop", () => { vcam.stop(); return true; });
app.on("before-quit", () => vcam.stop());
app.on("window-all-closed", () => app.quit());
