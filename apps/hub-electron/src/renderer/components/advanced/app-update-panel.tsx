import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, PackageCheck, RotateCcw, Upload } from "lucide-react";
import { useState } from "react";
import { formatPosDateTime } from "@gaurav-pos/shared";

import { hubApi } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";

export function AppUpdatePanel({
  setNotice,
  requestManagerApproval,
}: {
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const [packagePath, setPackagePath] = useState("");
  const [chooserStatus, setChooserStatus] = useState("");
  const updateStatus = useQuery({ queryKey: ["app-update-status"], queryFn: hubApi.updateStatus });
  const validatePackage = useMutation({
    mutationFn: hubApi.validateUpdatePackage,
    onSuccess: (result) => {
      setNotice({ tone: "good", text: `Update package valid: ${result.manifest.version}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const registerBaseline = useMutation({
    mutationFn: hubApi.registerUpdateBaseline,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["app-update-status"] });
      setNotice({ tone: "good", text: `Rollback baseline registered: ${result.version}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const registerInstallerBaseline = useMutation({
    mutationFn: hubApi.registerInstallerBaseline,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["app-update-status"] });
      setNotice({ tone: "good", text: `Current installer baseline registered: ${result.version}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const installUpdate = useMutation({
    mutationFn: ({ path, pin }: { path: string; pin: string }) => hubApi.installUpdate(path, pin),
    onSuccess: (result) => {
      setNotice({ tone: "good", text: `Backup created: ${result.backup.fileName}. Installer opening now.` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const githubLatest = useMutation({
    mutationFn: hubApi.githubUpdateLatest,
    onSuccess: (result) => {
      if (result.status === "update_available") setNotice({ tone: "good", text: `GitHub update available: ${result.latestVersion}` });
      else if (result.status === "up_to_date") setNotice({ tone: "good", text: `Hub is up to date: ${result.currentVersion}` });
      else setNotice({ tone: "bad", text: result.message ?? "No GitHub update is available." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const installGithubUpdate = useMutation({
    mutationFn: ({ pin, request }: { pin: string; request: NonNullable<NonNullable<typeof githubResult>["installRequest"]> }) => {
      if (!request) throw new Error("Check GitHub for an update before installing.");
      return hubApi.installGithubUpdate(request, pin);
    },
    onSuccess: (result) => {
      setNotice({ tone: "good", text: `GitHub update downloaded. Backup created: ${result.backup.fileName}. Installer opening now.` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const rollbackUpdate = useMutation({
    mutationFn: hubApi.rollbackUpdate,
    onSuccess: () => {
      setNotice({ tone: "good", text: "Rollback restore scheduled. Previous installer opening now." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const busy = validatePackage.isPending || registerBaseline.isPending || registerInstallerBaseline.isPending || installUpdate.isPending || githubLatest.isPending || installGithubUpdate.isPending || rollbackUpdate.isPending;
  const status = updateStatus.data;
  const githubResult = githubLatest.data;
  const chosenPath = packagePath.trim();
  const chosenPathLower = chosenPath.toLowerCase();
  const isUpdatePackagePath = chosenPathLower.endsWith(".gpos-update.zip");
  const isInstallerPath = chosenPathLower.endsWith(".exe");
  const pickerAvailable = Boolean(window.gauravPos?.chooseUpdatePackage);

  async function choosePackage(kind: "update" | "installer" = "update"): Promise<string | null> {
    if (!window.gauravPos?.chooseUpdatePackage) {
      setChooserStatus("File picker unavailable. Paste the path manually.");
      return null;
    }
    setChooserStatus("Opening file picker...");
    try {
      const selected = await window.gauravPos.chooseUpdatePackage(kind);
      if (selected) {
        setPackagePath(selected);
        setChooserStatus("");
        return selected;
      }
      setChooserStatus("");
      setNotice({ tone: "bad", text: kind === "installer" ? "No installer selected." : "No package selected." });
    } catch (error) {
      setChooserStatus("");
      setNotice({ tone: "bad", text: messageOf(error) });
    }
    return null;
  }

  return (
    <section className="panel app-update-panel">
      <div className="panel-title">
        <div>
          <h2>App updates</h2>
          <span>{status ? `App ${status.appVersion} · DB ${status.dbSchemaVersion}` : "Loading update status"}</span>
        </div>
      </div>
      <div className="update-status-grid">
        <article className={status?.baselineRegistered ? "update-status-card ready" : "update-status-card warning"}>
          <div>
            <strong>Rollback baseline</strong>
            <span>{status?.baselineRegistered ? `Ready: ${status.current?.version}` : "Register the current .gpos-update.zip or installer .exe before installing newer builds"}</span>
          </div>
          <span className={status?.baselineRegistered ? "record-status active" : "record-status warning"}>
            {status?.baselineRegistered ? "Ready" : "Missing"}
          </span>
        </article>
        <article className={(status?.activeOrderCount ?? 0) === 0 ? "update-status-card ready" : "update-status-card warning"}>
          <div>
            <strong>Running orders</strong>
            <span>{status?.activeOrderCount ?? 0} must be closed before update install</span>
          </div>
          <span className={(status?.activeOrderCount ?? 0) === 0 ? "record-status active" : "record-status warning"}>
            {(status?.activeOrderCount ?? 0) === 0 ? "Clear" : "Blocked"}
          </span>
        </article>
        {status?.previous ? (
          <article className={status.rollbackAvailable ? "update-status-card ready" : "update-status-card warning"}>
            <div>
              <strong>Rollback package</strong>
              <span>{status.previous.version} · backup {status.previous.preUpdateBackupFileName ?? "missing"}</span>
            </div>
            <span className={status.rollbackAvailable ? "record-status active" : "record-status warning"}>
              {status.rollbackAvailable ? "Available" : "Incomplete"}
            </span>
          </article>
        ) : null}
      </div>
      <div className="update-action-card github-update-card">
        <div>
          <strong>GitHub release update</strong>
          <p className="soft-note">Primary update path. Hub downloads the latest stable Open-POS release package, validates DB and SQLite binaries, backs up the database, then opens the installer.</p>
        </div>
        <div className="update-action-row">
          <button type="button" className="primary-button" disabled={busy} onClick={() => githubLatest.mutate()}>
            <CloudDownload size={18} /> {githubLatest.isPending ? "Checking GitHub..." : "Check GitHub for update"}
          </button>
          <button
            type="button"
            className="utility-action"
            disabled={busy || githubResult?.status !== "update_available" || !githubResult.installRequest}
            onClick={async () => {
              if (!status?.baselineRegistered) {
                setNotice({ tone: "bad", text: "Register the current version as rollback baseline before installing updates." });
                return;
              }
              if ((status?.activeOrderCount ?? 0) > 0) {
                setNotice({ tone: "bad", text: `Close or settle ${status?.activeOrderCount ?? 0} running order(s) before installing update.` });
                return;
              }
              const installRequest = githubResult?.installRequest;
              if (!installRequest) {
                setNotice({ tone: "bad", text: "Check GitHub for an update before installing." });
                return;
              }
              const approval = await requestManagerApproval({
                title: "Install GitHub update",
                defaultReason: "Install GitHub update",
                message: `The hub will download ${githubResult?.latestVersion ?? "the latest release"}, create a database backup, open the installer, and close this app.`,
                confirmLabel: installGithubUpdate.isPending ? "Installing..." : "Install GitHub update",
                danger: true
              }).catch(() => null);
              if (approval) installGithubUpdate.mutate({ pin: approval.pin, request: installRequest });
            }}
          >
            Install GitHub update
          </button>
        </div>
        {githubResult ? (
          <div className={`github-update-result ${githubResult.status}`}>
            <strong>
              {githubResult.status === "update_available"
                ? `GitHub update available: ${githubResult.latestVersion}`
                : githubResult.status === "up_to_date"
                  ? `Hub is up to date: ${githubResult.currentVersion}`
                  : "GitHub update unavailable"}
            </strong>
            {githubResult.asset ? <span>{githubResult.asset.name} · {formatFileSize(githubResult.asset.sizeBytes)}</span> : null}
            {githubResult.release ? (
              <span>
                {githubResult.release.title}
                {githubResult.release.publishedAt ? ` · ${formatPosDateTime(githubResult.release.publishedAt)}` : ""}
                {" · "}
                <a href={githubResult.release.url} target="_blank" rel="noreferrer">Open release</a>
              </span>
            ) : null}
            {githubResult.release?.notes ? <p className="github-release-notes">{githubResult.release.notes}</p> : null}
            {githubResult.message ? <p className="github-release-notes">{githubResult.message}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="update-package-card">
        <label>
          <span>Update package or current installer</span>
          <input value={packagePath} onChange={(event) => setPackagePath(event.target.value)} placeholder="Paste .gpos-update.zip or current installer .exe path" />
        </label>
        <div className="update-picker-actions">
          <button type="button" onClick={() => void choosePackage()}>
            <Upload size={16} /> Choose package
          </button>
          <button type="button" className="secondary-button" onClick={() => void choosePackage("installer")}>
            Choose installer
          </button>
        </div>
      </div>
      {chooserStatus ? <p className="soft-note">{chooserStatus}</p> : null}
      {!pickerAvailable ? <p className="soft-note">File picker unavailable. Paste the path manually.</p> : null}
      <div className="update-action-groups">
        <div className="update-action-card">
          <strong>Local fallback and baseline</strong>
          <div className="update-action-row">
            <button type="button" className="utility-action" disabled={!isUpdatePackagePath || busy} onClick={() => validatePackage.mutate(chosenPath)}>
              <PackageCheck size={18} /> Validate
            </button>
            <button type="button" className="utility-action" disabled={!isUpdatePackagePath || busy} onClick={() => registerBaseline.mutate(chosenPath)}>
              Register package baseline
            </button>
            <button type="button" className="utility-action" disabled={!isInstallerPath || busy} onClick={() => registerInstallerBaseline.mutate(chosenPath)}>
              Register current installer baseline
            </button>
          </div>
        </div>
        <div className="update-action-card danger">
          <strong>Install or rollback</strong>
          <div className="update-action-row">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={async () => {
                let path = chosenPath;
                if (!path) {
                  path = (await choosePackage())?.trim() ?? "";
                }
                if (!path) {
                  setNotice({ tone: "bad", text: "Choose a .gpos-update.zip package first." });
                  return;
                }
                if (!path.toLowerCase().endsWith(".gpos-update.zip")) {
                  setNotice({ tone: "bad", text: "Install update requires a .gpos-update.zip package. Use the installer only for baseline registration." });
                  return;
                }
                if (!status?.baselineRegistered) {
                  setNotice({ tone: "bad", text: "Register the current version as rollback baseline before installing updates. Use the current .gpos-update.zip or the current installer .exe." });
                  return;
                }
                if ((status?.activeOrderCount ?? 0) > 0) {
                  setNotice({ tone: "bad", text: `Close or settle ${status?.activeOrderCount ?? 0} running order(s) before installing update.` });
                  return;
                }
                const approval = await requestManagerApproval({
                  title: "Install app update",
                  defaultReason: "Install app update",
                  message: "The hub will create a database backup, open the installer, and close this app.",
                  confirmLabel: installUpdate.isPending ? "Installing..." : "Install update",
                  danger: true
                }).catch(() => null);
                if (approval) installUpdate.mutate({ path, pin: approval.pin });
              }}
            >
              Install update
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={busy || !status?.rollbackAvailable}
              onClick={async () => {
                const approval = await requestManagerApproval({
                  title: "Rollback app update",
                  defaultReason: "Rollback app update",
                  message: "The hub will restore the pre-update database backup and open the previous installer.",
                  confirmLabel: rollbackUpdate.isPending ? "Rolling back..." : "Rollback",
                  danger: true
                }).catch(() => null);
                if (approval) rollbackUpdate.mutate(approval.pin);
              }}
            >
              <RotateCcw size={18} /> Rollback
            </button>
          </div>
        </div>
      </div>
      {updateStatus.error ? <p className="warning-text">{messageOf(updateStatus.error)}</p> : null}
    </section>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${Math.round(sizeBytes / 1024 / 1024)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}
