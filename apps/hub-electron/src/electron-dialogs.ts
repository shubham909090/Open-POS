import type { BrowserWindow, OpenDialogOptions, OpenDialogReturnValue } from "electron";

export type UpdateFileDialogKind = "update" | "installer";

export interface UpdateDialogApi {
  showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
}

export function updateFileDialogOptions(kind: UpdateFileDialogKind): OpenDialogOptions {
  return {
    title: kind === "installer" ? "Choose current Gaurav POS installer" : "Choose Gaurav POS update package",
    properties: ["openFile"],
    filters: [
      kind === "installer"
        ? { name: "Gaurav POS Installer", extensions: ["exe"] }
        : { name: "Gaurav POS Update", extensions: ["zip"] }
    ]
  };
}

export async function chooseUpdateFile(
  dialogApi: UpdateDialogApi,
  owner: BrowserWindow | null,
  kind: UpdateFileDialogKind
): Promise<string | null> {
  if (owner) {
    if (owner.isMinimized()) owner.restore();
    owner.focus();
  }
  const options = updateFileDialogOptions(kind);
  const result = owner
    ? await dialogApi.showOpenDialog(owner, options)
    : await dialogApi.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
