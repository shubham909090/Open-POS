import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudDownload } from "lucide-react";

import { hubApi } from "../../hub-api.js";
import type { OnlineUpdateStateStatus } from "../../hub-api-types.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";

export function AppUpdatePanel({ setNotice }: { setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const updateStatus = useQuery({ queryKey: ["app-update-status"], queryFn: hubApi.updateStatus });
  const installOnlineUpdate = useMutation({
    mutationFn: hubApi.installOnlineUpdate,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["app-update-status"] });
      if ("installing" in result) {
        setNotice({ tone: "good", text: `Update downloaded. Backup created: ${result.backup.fileName}. Installing now.` });
      } else {
        setNotice({ tone: "good", text: `Hub is up to date: ${result.currentVersion}` });
      }
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const status = updateStatus.data;
  const online = status?.online;
  const activeOrderCount = status?.activeOrderCount ?? 0;
  const busy = installOnlineUpdate.isPending || online?.status === "checking" || online?.status === "downloading" || online?.status === "installing";
  const updateDisabled = busy || online?.enabled === false;

  return (
    <section className="panel app-update-panel">
      <div className="panel-title">
        <div>
          <h2>App updates</h2>
          <span>{status ? `App ${status.appVersion} · DB ${status.dbSchemaVersion}` : "Loading update status"}</span>
        </div>
      </div>
      <div className="update-status-grid">
        <article className={online?.enabled ? "update-status-card ready" : "update-status-card warning"}>
          <div>
            <strong>Online updater</strong>
            <span>{online ? onlineStatusText(online.status, online.availableVersion, online.downloadPercent) : "Loading"}</span>
          </div>
          <span className={online?.enabled ? "record-status active" : "record-status warning"}>
            {online?.enabled ? "Ready" : "Unavailable"}
          </span>
        </article>
        <article className={activeOrderCount === 0 ? "update-status-card ready" : "update-status-card warning"}>
          <div>
            <strong>Running orders</strong>
            <span>{activeOrderCount} must be closed before update install</span>
          </div>
          <span className={activeOrderCount === 0 ? "record-status active" : "record-status warning"}>
            {activeOrderCount === 0 ? "Clear" : "Blocked"}
          </span>
        </article>
      </div>
      <div className="update-action-card github-update-card">
        <div className="update-action-row">
          <button
            type="button"
            className="primary-button"
            disabled={updateDisabled}
            onClick={() => {
              if (activeOrderCount > 0) {
                setNotice({ tone: "bad", text: `Close or settle ${activeOrderCount} running order(s) before updating.` });
                return;
              }
              installOnlineUpdate.mutate();
            }}
          >
            <CloudDownload size={18} /> {busy ? "Updating..." : "Update app"}
          </button>
        </div>
        {online?.message ? <p className="warning-text">{online.message}</p> : null}
      </div>
      {updateStatus.error ? <p className="warning-text">{messageOf(updateStatus.error)}</p> : null}
    </section>
  );
}

function onlineStatusText(status: OnlineUpdateStateStatus, availableVersion: string | null, downloadPercent: number | null): string {
  if (status === "checking") return "Checking latest release";
  if (status === "available") return availableVersion ? `Update ${availableVersion} available` : "Update available";
  if (status === "downloading") return `Downloading${downloadPercent === null ? "" : ` ${downloadPercent}%`}`;
  if (status === "downloaded") return "Downloaded";
  if (status === "installing") return "Installing";
  if (status === "up_to_date") return "Up to date";
  if (status === "error") return "Needs attention";
  if (status === "disabled") return "Unavailable";
  return "Ready";
}
