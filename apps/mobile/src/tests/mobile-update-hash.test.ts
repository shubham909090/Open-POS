import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashMobileApk } from "../lib/mobile-update-hash";
import { mobileUpdateConfig as config } from "../lib/mobile-update-config";

function readable(bytes: Uint8Array<ArrayBuffer>, reportedSize = bytes.byteLength) {
  let offset = 0;
  const handle = {
    size: reportedSize,
    readBytes: vi.fn((length: number) => {
      const chunk = bytes.subarray(offset, offset + length);
      offset += chunk.byteLength;
      return chunk;
    }),
    close: vi.fn()
  };
  return { file: { size: reportedSize, open: vi.fn(() => handle) }, handle };
}

describe("bounded-memory APK SHA-256", () => {
  it("matches Node SHA-256 across multiple chunks and a short final chunk", async () => {
    const bytes = Uint8Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, index) => index % 251);
    const { file, handle } = readable(bytes);
    const expected = createHash("sha256").update(bytes).digest("hex");
    await expect(hashMobileApk(file, new AbortController().signal)).resolves.toBe(expected);
    expect(handle.readBytes).toHaveBeenCalledTimes(13);
    expect(handle.readBytes.mock.calls.every(([length]) => length <= config.hashChunkBytes)).toBe(true);
    expect(handle.readBytes).toHaveBeenLastCalledWith(17);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("yields for cancellation after at most one MiB and always releases the file", async () => {
    const { file, handle } = readable(new Uint8Array(8 * 1024 * 1024));
    const controller = new AbortController();
    const cancel = setTimeout(() => controller.abort(), 0);
    try {
      await expect(hashMobileApk(file, controller.signal)).rejects.toThrow("cancelled");
      expect(handle.readBytes).toHaveBeenCalledTimes(config.hashYieldBytes / config.hashChunkBytes);
      expect(handle.close).toHaveBeenCalledOnce();
    } finally { clearTimeout(cancel); }
  });

  it("rejects truncated files and closes their handle", async () => {
    const { file, handle } = readable(new Uint8Array(10), 4096);
    await expect(hashMobileApk(file, new AbortController().signal)).rejects.toThrow("incomplete");
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects an already canceled operation or oversized APK without opening it", async () => {
    const { file } = readable(new Uint8Array(1));
    const controller = new AbortController();
    controller.abort();
    await expect(hashMobileApk(file, controller.signal)).rejects.toThrow("cancelled");
    expect(file.open).not.toHaveBeenCalled();
    file.size = config.maxApkBytes + 1;
    await expect(hashMobileApk(file, new AbortController().signal)).rejects.toThrow("size is invalid");
    expect(file.open).not.toHaveBeenCalled();
  });

  it("releases the handle when native file reading fails", async () => {
    const { file, handle } = readable(new Uint8Array(10));
    handle.readBytes.mockImplementation(() => { throw new Error("File read failed"); });
    await expect(hashMobileApk(file, new AbortController().signal)).rejects.toThrow("File read failed");
    expect(handle.close).toHaveBeenCalledOnce();
  });
});
