import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type BackupSummary } from "../../hub-api.js";
import { messageOf } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";

export function BackupPanel({
  backups,
  loading,
  cloudBackupEnabled = false,
  onChanged,
}: {
  backups: BackupSummary[];
  loading: boolean;
  cloudBackupEnabled?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState("");
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [cloudRestoreKind, setCloudRestoreKind] = useState<"order_history" | "menu_catalog" | "alcohol_stock" | "table_layout">("order_history");
  const [cloudRestoreDate, setCloudRestoreDate] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const createBackup = useMutation({
    mutationFn: () => hubApi.createBackup(label.trim() || "manual"),
    onSuccess: async () => {
      setLabel("");
      await onChanged();
    },
  });
  const scheduleRestore = useMutation({
    mutationFn: hubApi.scheduleRestore,
    onSuccess: async () => {
      setRestoreFile(null);
      await onChanged();
    },
  });
  const cloudRestore = useMutation({
    mutationFn: () =>
      hubApi.restoreCloudBackup(
        {
          kind: cloudRestoreKind,
          throughBusinessDate: cloudRestoreKind === "order_history" ? cloudRestoreDate : undefined,
        },
        masterPin
      ),
    onSuccess: async () => {
      setMasterPin("");
      await onChanged();
    },
  });

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Local backups</h2>
        <span>{backups.length} saved</span>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          createBackup.mutate();
        }}
      >
        <label>
          Backup label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="before-menu-change"
          />
        </label>
        <button type="submit" disabled={createBackup.isPending}>
          {createBackup.isPending ? "Creating..." : "Create backup"}
        </button>
      </form>
      {createBackup.error ? (
        <p className="text-sm text-muted bad">{messageOf(createBackup.error)}</p>
      ) : null}
      {scheduleRestore.error ? (
        <p className="text-sm text-muted bad">
          {messageOf(scheduleRestore.error)}
        </p>
      ) : null}
      <div className="record-list">
        {loading ? (
          <p className="text-sm text-muted">Loading backups...</p>
        ) : null}
        {!loading && backups.length === 0 ? (
          <EmptyState
            title="No backups yet"
            description="Create a local backup before major setup changes or before testing a restore."
          />
        ) : null}
        {backups.map((backup) => (
          <article key={backup.fileName} className="record-row">
            <div>
              <strong>{backup.fileName}</strong>
              <span>
                {formatPosDateTime(backup.createdAt)} ·{" "}
                {Math.ceil(backup.sizeBytes / 1024)} KB
              </span>
            </div>
            {restoreFile === backup.fileName ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRestoreFile(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={scheduleRestore.isPending}
                  onClick={() => scheduleRestore.mutate(backup.fileName)}
                >
                  Schedule restore
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="danger-button"
                onClick={() => setRestoreFile(backup.fileName)}
              >
                Restore
              </button>
            )}
          </article>
        ))}
      </div>
      {restoreFile ? (
        <p className="warning-text">
          Restore is scheduled for the next hub restart. Use this only when you
          really want to roll the local DB back.
        </p>
      ) : null}
      <div className="panel-title mt-6">
        <h2>Cloud restore</h2>
        <span>{cloudRestore.isPending ? "Restoring" : "Ready"}</span>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          cloudRestore.mutate();
        }}
      >
        <label>
          Restore
          <select value={cloudRestoreKind} onChange={(event) => setCloudRestoreKind(event.target.value as typeof cloudRestoreKind)}>
            <option value="order_history">Order history</option>
            <option value="menu_catalog">Menu/catalog</option>
            <option value="alcohol_stock">Alcohol stock</option>
            <option value="table_layout">Table layout</option>
          </select>
        </label>
        {cloudRestoreKind === "order_history" ? (
          <label>
            Through date
            <input type="date" value={cloudRestoreDate} onChange={(event) => setCloudRestoreDate(event.target.value)} />
          </label>
        ) : null}
        <label>
          Master PIN
          <input type="password" value={masterPin} onChange={(event) => setMasterPin(event.target.value)} autoComplete="current-password" />
        </label>
        <button
          type="submit"
          className="danger-button"
          disabled={!cloudBackupEnabled || cloudRestore.isPending || !masterPin || (cloudRestoreKind === "order_history" && !cloudRestoreDate)}
        >
          Restore from cloud
        </button>
      </form>
      {!cloudBackupEnabled ? <p className="text-sm text-muted">Cloud Backup is off. Cloud restore is unavailable.</p> : null}
      {cloudRestore.error ? <p className="text-sm text-muted bad">{messageOf(cloudRestore.error)}</p> : null}
      {cloudRestore.data ? (
        <p className="text-sm text-muted">Restored {cloudRestore.data.imported} cloud rows for {cloudRestore.data.kind.replace("_", " ")}.</p>
      ) : null}
    </section>
  );
}
