import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { chooseUpdateFile, restoreRendererFocus, type UpdateFileDialogKind } from "./electron-dialogs.js";
import { startHub } from "./runtime.js";
import { runSqliteSelfTest } from "./self-test.js";
import { createElectronOnlineUpdater } from "./update/electron-online-updater.js";

let mainWindow: BrowserWindow | null = null;
let hubPromise: ReturnType<typeof startHub> | null = null;
let onlineUpdater: ReturnType<typeof createElectronOnlineUpdater> | null = null;
let quitAllowed = false;
let shutdownPromise: Promise<void> | null = null;

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
  const hub = await getHub();

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

function getHub(): ReturnType<typeof startHub> {
  onlineUpdater ??= createElectronOnlineUpdater();
  hubPromise ??= startHub({
    onlineUpdater,
    requestExit: () => {
      app.quit();
    },
    requestRestart: () => {
      app.relaunch();
      app.quit();
    }
  });
  return hubPromise;
}

async function stopHub(): Promise<void> {
  if (!hubPromise) return;
  const hub = await hubPromise;
  await hub.stop();
}

if (!selfTestOnly) {
  app.whenReady().then(() => {
    void createWindow();
  });
}

app.on("before-quit", (event) => {
  if (selfTestOnly || quitAllowed) return;
  event.preventDefault();
  shutdownPromise ??= stopHub().catch((error) => {
    console.error("Failed to stop Gaurav POS Hub cleanly", error);
  });
  void shutdownPromise.finally(() => {
    quitAllowed = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow) void createWindow();
});
