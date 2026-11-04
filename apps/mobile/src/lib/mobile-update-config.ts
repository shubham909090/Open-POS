export const mobileUpdateConfig = {
  appId: "com.gauravpos.mobile",
  releasesUrl: "https://api.github.com/repos/shubham909090/Open-POS/releases?per_page=30",
  repositoryPath: "/shubham909090/Open-POS/releases/download/",
  metadataFileName: "mobile-update-metadata.json",
  maxApkBytes: 200 * 1024 * 1024,
  maxMetadataBytes: 16_384,
  requestTimeoutMs: 15_000,
  downloadTimeoutMs: 10 * 60_000,
  hashChunkBytes: 256 * 1024,
  hashYieldBytes: 1024 * 1024,
  apkMimeType: "application/vnd.android.package-archive"
};
