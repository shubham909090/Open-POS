import { useMutation } from "@tanstack/react-query";
import { DatabaseBackup, Power, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type BackupSummary, type PendingRestoreSummary } from "../../hub-api.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { messageOf } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";

export function BackupPanel({
  backups,
  loading,
  pendingRestore,
  pendingLoading,
  masterPinConfigured,
  requestManagerApproval,
  onChanged,
}: {
  backups: BackupSummary[];
  loading: boolean;
  pendingRestore: PendingRestoreSummary | null;
  pendingLoading: boolean;
  masterPinConfigured: boolean;
  requestManagerApproval: ManagerApprovalRequest;
  onChanged: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState("");
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [deleteFile, setDeleteFile] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const createBackup = useMutation({
    mutationFn: () => hubApi.createBackup(label.trim() || "Manual backup"),
    onMutate: () => setStatusMessage(null),
    onSuccess: async (backup) => {
      setLabel("");
      setStatusMessage(`Created ${backup.label}.`);
      await onChanged();
    },
    onError: () => setStatusMessage(null),
  });
  const scheduleRestore = useMutation({
    mutationFn: (payload: { backup: BackupSummary; masterApproval: ManagerApproval; restartNow: boolean }) =>
      hubApi.scheduleRestore({
        fileName: payload.backup.fileName,
        confirmationText: restoreConfirmation,
        restartNow: payload.restartNow,
        masterApproval: payload.masterApproval,
      }),
    onMutate: () => setStatusMessage(null),
    onSuccess: async (result) => {
      closeRestorePanel();
      setStatusMessage(result.restartNow ? "Restore scheduled and restart requested." : "Restore scheduled for next restart.");
      await onChanged();
    },
    onError: () => setStatusMessage(null),
  });
  const deleteBackup = useMutation({
    mutationFn: (payload: { backup: BackupSummary; masterApproval: ManagerApproval }) =>
      hubApi.deleteBackup(payload.backup.fileName, {
        confirmationText: deleteConfirmation,
        masterApproval: payload.masterApproval,
      }),
    onSuccess: async () => {
      closeDeletePanel();
      setStatusMessage("Backup deleted.");
      await onChanged();
    },
    onMutate: () => setStatusMessage(null),
    onError: () => setStatusMessage(null),
  });
  const cancelPendingRestore = useMutation({
    mutationFn: (masterApproval: ManagerApproval) => hubApi.cancelPendingRestore(masterApproval),
    onMutate: () => setStatusMessage(null),
    onSuccess: async (result) => {
      setStatusMessage(result.canceled ? "Pending restore cancelled." : "No pending restore was scheduled.");
      await onChanged();
    },
    onError: () => setStatusMessage(null),
  });
  const restartPendingRestore = useMutation({
    mutationFn: (masterApproval: ManagerApproval) => hubApi.restartPendingRestore(masterApproval),
    onSuccess: async () => {
      setStatusMessage("Restart requested.");
      await onChanged();
    },
    onMutate: () => setStatusMessage(null),
    onError: () => setStatusMessage(null),
  });

  const selectedRestoreBackup = backups.find((backup) => backup.fileName === restoreFile) ?? null;
  const selectedDeleteBackup = backups.find((backup) => backup.fileName === deleteFile) ?? null;
  const restoreConfirmReady = Boolean(selectedRestoreBackup && restoreConfirmation === selectedRestoreBackup.fileName);
  const deleteConfirmReady = Boolean(selectedDeleteBackup && deleteConfirmation === selectedDeleteBackup.fileName);
  const destructiveBusy = scheduleRestore.isPending || deleteBackup.isPending || cancelPendingRestore.isPending || restartPendingRestore.isPending;
  const restoreBlocked = Boolean(pendingRestore) || destructiveBusy;

  function openRestorePanel(backup: BackupSummary) {
    setRestoreFile(backup.fileName);
    setRestoreConfirmation("");
    closeDeletePanel();
  }

  function closeRestorePanel() {
    setRestoreFile(null);
    setRestoreConfirmation("");
  }

  function openDeletePanel(backup: BackupSummary) {
    setDeleteFile(backup.fileName);
    setDeleteConfirmation("");
    closeRestorePanel();
  }

  function closeDeletePanel() {
    setDeleteFile(null);
    setDeleteConfirmation("");
  }

  async function approveMasterAction(options: { title: string; message: string; defaultReason: string; confirmLabel: string }) {
    return requestManagerApproval({
      ...options,
      pinLabel: "Master PIN",
      approvedBy: "owner",
      danger: true,
    }).catch(() => null);
  }

  async function restoreBackup(backup: BackupSummary, restartNow: boolean) {
    const approval = await approveMasterAction({
      title: restartNow ? "Restore Backup And Restart" : "Schedule Backup Restore",
      message: restartNow
        ? `Hub will restart and restore ${backup.fileName}.`
        : `Hub will restore ${backup.fileName} on the next restart.`,
      defaultReason: restartNow ? "Restore local backup now" : "Schedule local backup restore",
      confirmLabel: restartNow ? "Restore + Restart" : "Schedule Restore",
    });
    if (approval) scheduleRestore.mutate({ backup, restartNow, masterApproval: approval });
  }

  async function deleteSelectedBackup(backup: BackupSummary) {
    const approval = await approveMasterAction({
      title: "Delete Manual Backup",
      message: `${backup.fileName} will be permanently removed.`,
      defaultReason: "Delete manual backup",
      confirmLabel: "Delete Backup",
    });
    if (approval) deleteBackup.mutate({ backup, masterApproval: approval });
  }

  async function cancelPending() {
    const approval = await approveMasterAction({
      title: "Cancel Pending Restore",
      message: "The scheduled restore marker will be removed.",
      defaultReason: "Cancel pending backup restore",
      confirmLabel: "Cancel Restore",
    });
    if (approval) cancelPendingRestore.mutate(approval);
  }

  async function restartPending() {
    const approval = await approveMasterAction({
      title: "Restart Hub Now",
      message: "Hub will restart and apply the pending local backup restore.",
      defaultReason: "Restart pending backup restore",
      confirmLabel: "Restart Hub",
    });
    if (approval) restartPendingRestore.mutate(approval);
  }

  return (
    <section className="panel reports-wide backup-panel">
      <div className="panel-title">
        <h2>Backups</h2>
        <span>{loading ? "Loading" : `${backups.length} manual saved`}</span>
      </div>

      {pendingRestore ? (
        <div className="pending-restore-banner" role="status">
          <div>
            <strong>Restore pending: {pendingRestore.backup.label}</strong>
            <span>{pendingRestore.backup.fileName} · requested {formatPosDateTime(pendingRestore.requestedAt)}</span>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => void restartPending()} disabled={!masterPinConfigured || destructiveBusy}>
              <Power size={18} />
              Restart Hub now
            </button>
            <button type="button" className="danger-button" onClick={() => void cancelPending()} disabled={!masterPinConfigured || destructiveBusy}>
              <XCircle size={18} />
              Cancel pending restore
            </button>
          </div>
        </div>
      ) : pendingLoading ? (
        <p className="small-muted">Checking pending restore...</p>
      ) : null}

      {!masterPinConfigured ? <p className="warning-text">Create Master PIN first.</p> : null}

      <form
        className="inline-form backup-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          createBackup.mutate();
        }}
      >
        <label>
          Backup name
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Before menu price update" maxLength={80} />
        </label>
        <button type="submit" disabled={createBackup.isPending}>
          <DatabaseBackup size={18} />
          {createBackup.isPending ? "Creating..." : "Create backup"}
        </button>
      </form>

      <BackupMutationMessage
        errors={[createBackup.error, scheduleRestore.error, deleteBackup.error, cancelPendingRestore.error, restartPendingRestore.error]}
        success={statusMessage}
      />

      <div className="record-list backup-list">
        {loading ? <p className="small-muted">Loading backups...</p> : null}
        {!loading && backups.length === 0 ? (
          <EmptyState title="No manual backups yet" description="Create one before major setup changes or a risky restore test." />
        ) : null}
        {backups.map((backup) => (
          <article key={backup.fileName} className="record-row backup-row">
            <div className="backup-details">
              <strong>{backup.label}</strong>
              <span>{formatPosDateTime(backup.createdAt)} · {formatBackupSize(backup.sizeBytes)}</span>
              <code>{backup.fileName}</code>
            </div>
            <div className="row-actions backup-row-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openRestorePanel(backup)}
                disabled={!masterPinConfigured || restoreBlocked}
              >
                <RotateCcw size={18} />
                Restore
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => openDeletePanel(backup)}
                disabled={!masterPinConfigured || destructiveBusy || pendingRestore?.backup.fileName === backup.fileName}
              >
                <Trash2 size={18} />
                Delete
              </button>
            </div>

            {selectedRestoreBackup?.fileName === backup.fileName ? (
              <div className="row-edit-form backup-confirmation-panel">
                <strong>Confirm restore</strong>
                <span className="small-muted">Type the exact filename before scheduling restore.</span>
                <code className="backup-confirmation-target">{backup.fileName}</code>
                <label>
                  Filename confirmation
                  <input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} />
                </label>
                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={closeRestorePanel}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!masterPinConfigured || !restoreConfirmReady || scheduleRestore.isPending}
                    onClick={() => void restoreBackup(backup, false)}
                  >
                    Schedule restore
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={!masterPinConfigured || !restoreConfirmReady || scheduleRestore.isPending}
                    onClick={() => void restoreBackup(backup, true)}
                  >
                    Restore + restart now
                  </button>
                </div>
              </div>
            ) : null}

            {selectedDeleteBackup?.fileName === backup.fileName ? (
              <div className="row-edit-form backup-confirmation-panel danger-zone">
                <strong>Confirm permanent delete</strong>
                <span className="small-muted">Type the exact filename before deleting this manual backup.</span>
                <code className="backup-confirmation-target">{backup.fileName}</code>
                <label>
                  Filename confirmation
                  <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                </label>
                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={closeDeletePanel}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={!masterPinConfigured || !deleteConfirmReady || deleteBackup.isPending}
                    onClick={() => void deleteSelectedBackup(backup)}
                  >
                    Delete backup
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function BackupMutationMessage({ errors, success }: { errors: unknown[]; success: string | null }) {
  const error = errors.find(Boolean);
  if (error) return <p className="warning-text">{messageOf(error)}</p>;
  if (success) return <p className="small-muted">{success}</p>;
  return null;
}

function formatBackupSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KB`;
}
