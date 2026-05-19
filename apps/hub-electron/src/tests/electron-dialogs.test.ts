import { describe, expect, it, vi } from "vitest";
import { chooseUpdateFile, updateFileDialogOptions } from "../electron-dialogs.js";

describe("Electron update file dialogs", () => {
  it("parents the update chooser to the Hub window and focuses it first", async () => {
    const owner = {
      isMinimized: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
      isDestroyed: vi.fn().mockReturnValue(false),
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: {
        focus: vi.fn()
      }
    };
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ["C:\\updates\\Gaurav POS Hub.gpos-update.zip"] })
    };

    const selected = await chooseUpdateFile(dialog, owner as never, "update");

    expect(owner.restore).toHaveBeenCalledTimes(1);
    expect(owner.focus).toHaveBeenCalledTimes(2);
    expect(owner.webContents.focus.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(owner, expect.objectContaining({
      title: "Choose Gaurav POS update package"
    }));
    expect(selected).toBe("C:\\updates\\Gaurav POS Hub.gpos-update.zip");
  });

  it("returns null when the picker is cancelled", async () => {
    const owner = {
      isMinimized: vi.fn().mockReturnValue(false),
      isDestroyed: vi.fn().mockReturnValue(false),
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: {
        focus: vi.fn()
      }
    };
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
    };

    await expect(chooseUpdateFile(dialog, owner as never, "installer")).resolves.toBeNull();
    expect(owner.webContents.focus).toHaveBeenCalledTimes(1);
    expect(updateFileDialogOptions("installer").filters).toEqual([{ name: "Gaurav POS Installer", extensions: ["exe"] }]);
  });
});
