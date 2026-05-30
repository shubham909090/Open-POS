import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { OnlineAppUpdater, OnlineUpdateCheckResult } from "./app-update-service.js";
import { compareVersions } from "./github-update-source.js";
import { ONLINE_UPDATE_METADATA, type OnlineUpdateMetadata } from "./update-package.js";

const GITHUB_OWNER = "shubham909090";
const GITHUB_REPO = "Open-POS";

export function createElectronOnlineUpdater(): OnlineAppUpdater {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  return {
    async checkForUpdates(): Promise<OnlineUpdateCheckResult> {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      return {
        updateAvailable: Boolean(version && compareVersions(version, app.getVersion()) > 0),
        version
      };
    },
	    async downloadUpdate(): Promise<void> {
	      await autoUpdater.downloadUpdate();
	    },
	    async readUpdateMetadata(version: string): Promise<OnlineUpdateMetadata> {
	      const releaseResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/hub-v${encodeURIComponent(version)}`, {
	        headers: {
	          Accept: "application/vnd.github+json",
	          "User-Agent": "Gaurav-POS-Hub-Updater"
	        }
	      });
	      if (!releaseResponse.ok) throw new Error(`Could not read online update metadata: ${releaseResponse.status} ${releaseResponse.statusText}`);
	      const release = await releaseResponse.json() as { assets?: Array<{ name?: string; browser_download_url?: string }> };
	      const metadataAsset = release.assets?.find((asset) => asset.name === ONLINE_UPDATE_METADATA);
	      if (!metadataAsset?.browser_download_url) throw new Error(`Release hub-v${version} is missing ${ONLINE_UPDATE_METADATA}`);
	      const metadataResponse = await fetch(metadataAsset.browser_download_url, {
	        headers: {
	          Accept: "application/octet-stream",
	          "User-Agent": "Gaurav-POS-Hub-Updater"
	        }
	      });
	      if (!metadataResponse.ok) throw new Error(`Could not download online update metadata: ${metadataResponse.status} ${metadataResponse.statusText}`);
	      return await metadataResponse.json() as OnlineUpdateMetadata;
	    },
	    quitAndInstall(): void {
	      autoUpdater.quitAndInstall(true, true);
	    },
    onDownloadProgress(handler): void {
      autoUpdater.on("download-progress", (progress) => handler(progress.percent));
    }
  };
}
