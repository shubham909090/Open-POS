import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { File, FileHandle } from "expo-file-system";
import { mobileUpdateConfig as config } from "./mobile-update-config";

type ReadableApk = Pick<File, "size"> & {
  open(): Pick<FileHandle, "readBytes" | "close" | "size">;
};

export async function hashMobileApk(file: ReadableApk, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new Error("Update download cancelled.");
  const size = file.size;
  if (!Number.isSafeInteger(size) || size <= 0 || size > config.maxApkBytes) throw new Error("The APK download size is invalid.");
  const handle = file.open();
  const hash = sha256.create();
  let read = 0;
  let sinceYield = 0;
  try {
    if (handle.size !== size) throw new Error("The APK download changed. Please download it again.");
    while (read < size) {
      if (signal.aborted) throw new Error("Update download cancelled.");
      const requested = Math.min(config.hashChunkBytes, size - read);
      const chunk = handle.readBytes(requested);
      if (!chunk.byteLength || chunk.byteLength > requested) throw new Error("The APK download is incomplete. Please download it again.");
      if (signal.aborted) throw new Error("Update download cancelled.");
      hash.update(chunk);
      read += chunk.byteLength;
      sinceYield += chunk.byteLength;
      // Keep one small buffer live and let React process input/cancel while a
      // large APK is verified. Never send the entire APK across the JS bridge.
      if (sinceYield >= config.hashYieldBytes) {
        sinceYield = 0;
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    if (signal.aborted) throw new Error("Update download cancelled.");
    if (handle.size !== size) throw new Error("The APK download changed. Please download it again.");
    return bytesToHex(hash.digest());
  } finally {
    hash.destroy();
    handle.close();
  }
}
