import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  ipcMain.handle("updates:choose-package", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Gaurav POS update package",
      properties: ["openFile"],
      filters: [{ name: "Gaurav POS Update", extensions: ["zip"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}

async function createWindow() {
  const hub = await startHub({
    requestRestart: () => {
      app.relaunch();
      app.exit(0);
    }
  });

  const preloadPath = fileURLToPath(new URL("./preload.js", import.meta.url));
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Gaurav POS Hub",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      ...(existsSync(preloadPath) ? { preload: preloadPath } : {})
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
