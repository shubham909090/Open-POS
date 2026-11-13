import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudDownload } from "lucide-react";
import { useContext } from "react";

import { hubApi } from "../../hub-api.js";
import type { OnlineUpdateStateStatus } from "../../hub-api-types.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { SettingsPageActiveContext } from "../setup/setup-card.js";
import { useHubStore } from "../../store.js";

const unsentUpdateMessage = "Send or discard unsent items before updating.";
function unsentQuantity(drafts: ReturnType<typeof useHubStore.getState>["drafts"]) {
  return Object.values(drafts).reduce((total, items) => total + Object.values(items).reduce((count, item) => count + Math.max(0, item.quantity), 0), 0);
}

export function AppUpdatePanel({ setNotice }: { setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const active = useContext(SettingsPageActiveContext);
  const unsentItems = useHubStore((state) => unsentQuantity(state.drafts));
  const updateStatus = useQuery({
    queryKey: ["app-update-status"],
    queryFn: hubApi.updateStatus,
    enabled: active,
  });
  const installOnlineUpdate = useMutation({
    mutationFn: () => {
      if (unsentQuantity(useHubStore.getState().drafts) > 0) throw new Error(unsentUpdateMessage);
      return hubApi.installOnlineUpdate();
    },
    onMutate: () => useHubStore.getState().setUpdating(true),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["app-update-status"] });
      if ("installing" in result) {
        setNotice({
          tone: "good",
          text: `Update downloaded. Backup created: ${result.backup.fileName}. Installing now.`,
        });
      } else {
        useHubStore.getState().setUpdating(false);
        setNotice({
          tone: "good",
          text: `Hub is up to date: ${result.currentVersion}`,
        });
      }
    },
    onError: (error) => {
      useHubStore.getState().setUpdating(false);
      setNotice({ tone: "bad", text: messageOf(error) });
    },
  });

  const status = updateStatus.data;
  const online = status?.online;
  const activeOrderCount = status?.activeOrderCount ?? 0;
  const busy =
    installOnlineUpdate.isPending ||
    online?.status === "checking" ||
    online?.status === "downloading" ||
    online?.status === "installing";
  const updateDisabled = busy || !status || online?.enabled === false || unsentItems > 0;
  const rollbackReady = Boolean(
    status && (status.rollbackAvailable || status.baselineRegistered),
  );
  const unavailable = updateStatus.isError && !status;
  const pendingLabel = unavailable ? "Status unavailable" : "Loading";
  const onlineReady = online?.enabled && online.status !== "error";
  const rollbackCardClass = status
    ? rollbackReady
      ? "update-status-card ready"
      : "update-status-card warning"
    : "update-status-card";
  const rollbackBadgeClass = status
    ? rollbackReady
      ? "record-status active"
      : "record-status warning"
    : "record-status disabled";

  return (
    <section className="panel app-update-panel">
      <p className="update-version">{status ? `App ${status.appVersion} · DB ${status.dbSchemaVersion}` : unavailable ? "Update status unavailable" : "Loading update status…"}</p>
      {!unavailable ? <div className="update-status-grid">
        <article
          className={
            onlineReady
              ? "update-status-card ready"
              : "update-status-card warning"
          }
        >
          <div>
            <strong>Online updater</strong>
            <span>
              {online
                ? onlineStatusText(
                    online.status,
                    online.availableVersion,
                    online.downloadPercent,
                  )
                : pendingLabel}
            </span>
          </div>
          <span
            className={
              onlineReady ? "record-status active" : "record-status warning"
            }
          >
            {online ? online.status === "error" ? "Needs attention" : online.enabled ? "Ready" : "Unavailable" : pendingLabel}
          </span>
        </article>
        <article
          className={
            !status ? "update-status-card" : activeOrderCount === 0
              ? "update-status-card ready"
              : "update-status-card warning"
          }
        >
          <div>
            <strong>Running orders</strong>
            <span>{status ? `${activeOrderCount} must be closed before update install` : "Waiting for the hub status"}</span>
          </div>
          <span
            className={
              !status ? "record-status disabled" : activeOrderCount === 0
                ? "record-status active"
                : "record-status warning"
            }
          >
            {status ? activeOrderCount === 0 ? "Clear" : "Blocked" : pendingLabel}
          </span>
        </article>
        <article className={rollbackCardClass}>
          <div>
            <strong>Rollback</strong>
            <span>{status ? rollbackStatusText(status) : pendingLabel}</span>
          </div>
          <span className={rollbackBadgeClass}>
            {status ? (rollbackReady ? "Ready" : "Backup only") : pendingLabel}
          </span>
        </article>
      </div> : null}
      <div className="update-action-card github-update-card">
        {unsentItems > 0 ? <p className="warning-text" role="status">{unsentUpdateMessage} {unsentItems} unsent item{unsentItems === 1 ? "" : "s"}.</p> : null}
        <div className="update-action-row">
          <button
            type="button"
            className="primary-button"
            data-update-trigger
            disabled={updateDisabled}
            onClick={() => {
              if (unsentQuantity(useHubStore.getState().drafts) > 0) {
                setNotice({ tone: "bad", text: unsentUpdateMessage });
                return;
              }
              if (updateDisabled) return;
              if (activeOrderCount > 0) {
                setNotice({
                  tone: "bad",
                  text: `Close or settle ${activeOrderCount} running order(s) before updating.`,
                });
                return;
              }
              installOnlineUpdate.mutate();
            }}
          >
            <CloudDownload size={18} /> {busy ? "Updating..." : "Update app"}
          </button>
        </div>
        {online?.message ? (
          <p className="warning-text">{online.message}</p>
        ) : null}
      </div>
      {updateStatus.error ? (
        <div role="alert" className="settings-info-row">
          <p className="warning-text">{messageOf(updateStatus.error)}</p>
          <button
            type="button"
            className="secondary-button"
            disabled={updateStatus.isFetching}
            onClick={() => void updateStatus.refetch()}
          >
            Retry status check
          </button>
        </div>
      ) : null}
    </section>
  );
}

function rollbackStatusText(status?: {
  rollbackAvailable: boolean;
  baselineRegistered: boolean;
}): string {
  if (!status) return "Loading";
  if (status.rollbackAvailable) return "Installer rollback available";
  if (status.baselineRegistered) return "Baseline ready for next update";
  return "First update creates DB backup only";
}

function onlineStatusText(
  status: OnlineUpdateStateStatus,
  availableVersion: string | null,
  downloadPercent: number | null,
): string {
  if (status === "checking") return "Checking latest release";
  if (status === "available")
    return availableVersion
      ? `Update ${availableVersion} available`
      : "Update available";
  if (status === "downloading")
    return `Downloading${downloadPercent === null ? "" : ` ${downloadPercent}%`}`;
  if (status === "downloaded") return "Downloaded";
  if (status === "installing") return "Installing";
  if (status === "up_to_date") return "Up to date";
  if (status === "error") return "Needs attention";
  if (status === "disabled") return "Unavailable";
  return "Ready";
}
