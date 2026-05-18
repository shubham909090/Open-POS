const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gauravPos", {
  chooseUpdatePackage: (kind = "update") => ipcRenderer.invoke("updates:choose-package", kind)
});
