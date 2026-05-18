import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  version?: string;
  build?: { appId?: string; productName?: string };
  devDependencies?: { electron?: string };
}

export function readAppMetadata(): { version: string; appId: string; productName: string; electronVersion: string } {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const metadata = JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;
  return {
    version: metadata.version ?? "0.0.0",
    appId: metadata.build?.appId ?? "in.gaurav.pos.hub",
    productName: metadata.build?.productName ?? "Gaurav POS Hub",
    electronVersion: metadata.devDependencies?.electron?.replace(/^[^\d]*/, "") ?? "0.0.0"
  };
}

