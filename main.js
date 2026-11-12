// Ventana de escritorio de Formas y Filtros (Electron).
const { app, BrowserWindow, protocol, net, session } = require("electron");
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL("app://formas/index.html");
});
app.on("window-all-closed", () => app.quit());
