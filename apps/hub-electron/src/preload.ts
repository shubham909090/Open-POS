import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gauravPos", {
  chooseUpdatePackage: (kind: "update" | "installer" = "update") => ipcRenderer.invoke("updates:choose-package", kind) as Promise<string | null>,
  repairFocus: () => ipcRenderer.invoke("app:repair-focus") as Promise<{ ok: true }>
});
