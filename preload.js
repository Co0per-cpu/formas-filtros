const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vcam", {
  start: (w, h, fps) => ipcRenderer.invoke("vcam:start", w, h, fps),
  frame: (data) => ipcRenderer.send("vcam:frame", data),
  stop: () => ipcRenderer.invoke("vcam:stop"),
});
