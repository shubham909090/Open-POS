import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { chooseUpdateFile, restoreRendererFocus, type UpdateFileDialogKind } from "./electron-dialogs.js";
import { startHub } from "./runtime.js";
import { runSqliteSelfTest } from "./self-test.js";

let mainWindow: BrowserWindow | null = null;

const selfTestOnly = process.argv.includes("--self-test-sqlite");
if (selfTestOnly) {
  try {
    runSqliteSelfTest();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
} else {
  ipcMain.handle("updates:choose-package", async (_event, kindRaw?: string) => {
    const kind: UpdateFileDialogKind = kindRaw === "installer" ? "installer" : "update";
    try {
      return await chooseUpdateFile(dialog, mainWindow, kind);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Unable to open update file picker");
    }
  });
  ipcMain.handle("app:repair-focus", () => {
    if (mainWindow) restoreRendererFocus(mainWindow);
    return { ok: true };
  });
}

async function createWindow() {
  const hub = await startHub({
    requestRestart: () => {
      app.relaunch();
      app.exit(0);
    }
  });

  const preloadPath = fileURLToPath(new URL("../preload.cjs", import.meta.url));
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Gaurav POS Hub",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  await mainWindow.loadURL(hub.url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (!selfTestOnly) {
  app.whenReady().then(() => {
    void createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow) void createWindow();
});
