export interface BackupSummary {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UpdatePackageManifest {
  schemaVersion: 1;
  appId: string;
  productName: string;
  version: string;
  platform: "win32";
  arch: "x64";
  electronVersion: string;
  dbSchemaVersion: number;
  minSourceDbSchemaVersion: number;
  createdAt: string;
  installer: { fileName: string; sha256: string; sizeBytes: number };
  sqliteNative: { fileName: string; sha256: string; sizeBytes: number; format: "pe32plus-x64" };
}

export interface CachedUpdatePackage {
  version: string;
  packagePath: string;
  installerPath: string;
  manifest: UpdatePackageManifest;
  cachedAt: string;
  preUpdateBackupFileName?: string;
  preUpdateBackupPath?: string;
  preparedAt?: string;
}

export interface AppUpdateStatus {
  appVersion: string;
  dbSchemaVersion: number;
  activeOrderCount: number;
  baselineRegistered: boolean;
  rollbackAvailable: boolean;
  current?: CachedUpdatePackage;
  pending?: CachedUpdatePackage;
  previous?: CachedUpdatePackage;
  recoveryScriptPath?: string;
}

export interface ValidatedUpdatePackage {
  ok: true;
  packagePath: string;
  packageFileName: string;
  manifest: UpdatePackageManifest;
}

export interface GithubUpdateCheckResult {
  status: "up_to_date" | "update_available" | "unavailable";
  currentVersion: string;
  latestVersion?: string;
  message?: string;
  release?: {
    tagName: string;
    title: string;
    url: string;
    publishedAt?: string;
    notes: string;
  };
  asset?: {
    name: string;
    sizeBytes: number;
    downloadUrl: string;
  };
  installRequest?: GithubUpdateInstallRequest;
}

export interface GithubUpdateInstallRequest {
  tagName: string;
  assetName: string;
  expectedVersion: string;
}
