import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gauravPos", {
  chooseUpdatePackage: () => ipcRenderer.invoke("updates:choose-package") as Promise<string | null>
});

