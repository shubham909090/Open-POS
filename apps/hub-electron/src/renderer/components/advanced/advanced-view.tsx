import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CloudDownload, Printer } from "lucide-react";
import { formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";

function SaleGroupRow({
  group,
  setNotice,
  onSaved,
}: {
  group: Bootstrap["saleGroups"][number];
  setNotice: NoticeSetter;
  onSaved: () => Promise<unknown>;
}) {
  const [ticketLabel, setTicketLabel] = useState<"KOT" | "BOT">(
    group.ticket_label,
  );
  const [taxText, setTaxText] = useState(() => {
    try {
      return (
        JSON.parse(group.tax_components_json) as Array<{
          name: string;
          rateBps: number;
        }>
      )
        .map((component) => `${component.name}:${component.rateBps / 100}`)
        .join(", ");
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);

  function parseTaxComponents() {
    return taxText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, percent] = part.split(":").map((value) => value.trim());
        return {
          name: name ?? "",
          rateBps: Math.round(Number(percent || 0) * 100),
        };
      })
      .filter(
        (component) => component.name && Number.isFinite(component.rateBps),
      );
  }

  return (
    <article className="record-row">
      <div>
        <strong>{group.name}</strong>
        <span>
          {group.kind} · {ticketLabel} · tax/report category
        </span>
      </div>
      <form
        className="row-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          hubApi
            .updateSaleGroup(group.id, {
              ticketLabel,
              taxComponents: parseTaxComponents(),
            })
            .then(onSaved)
            .then(() => setNotice({ tone: "good", text: "Tax group saved." }))
            .catch((error) =>
              setNotice({ tone: "bad", text: messageOf(error) }),
            )
            .finally(() => setSaving(false));
        }}
      >
        <label>
          Ticket
          <select
            value={ticketLabel}
            onChange={(event) =>
              setTicketLabel(event.target.value as "KOT" | "BOT")
            }
          >
            <option value="KOT">KOT</option>
            <option value="BOT">BOT</option>
          </select>
        </label>
        <label>
          Taxes
          <input
            value={taxText}
            onChange={(event) => setTaxText(event.target.value)}
            placeholder="CGST:2.5, SGST:2.5"
          />
        </label>
        <button type="submit" disabled={saving}>
          Save
        </button>
      </form>
    </article>
  );
}

export function AdvancedView({
  bootstrap,
  setNotice,
  requestManagerApproval,
  onLocked,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onLocked: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState("");
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBackups, setResetBackups] = useState(false);

  const pullCloud = useMutation({
    mutationFn: hubApi.pullCloud,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      setNotice({
        tone: result.failed ? "bad" : "good",
        text: `Cloud updates applied: ${result.applied}${result.failed ? `, failed: ${result.failed}` : ""}`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const requeueSync = useMutation({
    mutationFn: hubApi.requeueFailedSync,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      setNotice({
        tone: "good",
        text: `Sync events requeued: ${result.requeued}`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const prints = useMutation({
    mutationFn: hubApi.processPrints,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({
        tone: "good",
        text: `Print queue checked. Printed ${result.printed}, failed ${result.failed}.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const resolveCommandFailure = useMutation({
    mutationFn: hubApi.resolveCloudCommandFailure,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({
        tone: result.resolved ? "good" : "bad",
        text: result.resolved
          ? "Cloud command warning marked resolved."
          : "That warning was already gone.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const savePin = useMutation({
    mutationFn: (currentPin: string) =>
      hubApi.setManagerPin({ currentPin, newPin, updatedBy: "admin" }),
    onSuccess: async () => {
      setNewPin("");
      await onLocked();
      setNotice({
        tone: "good",
        text: "Manager PIN changed. Unlock setup again with the new PIN.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const fullReset = useMutation({
    mutationFn: (approval: ManagerApproval) =>
      hubApi.fullReset({
        managerApproval: approval,
        confirmationText: resetPhrase,
        includeBackups: resetBackups,
      }),
    onSuccess: () => {
      setNotice({
        tone: "good",
        text: "Full reset scheduled. The hub will restart now.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <div className="advanced-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Manager approval</h2>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            New manager PIN
            <input
              value={newPin}
              onChange={(event) => setNewPin(event.target.value)}
              type="password"
            />
          </label>
          <button
            type="button"
            disabled={newPin.length < 4 || savePin.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Change Manager PIN",
                defaultReason: "Manager PIN changed",
                message:
                  "After this is saved, setup will lock and must be unlocked with the new PIN.",
                confirmLabel: savePin.isPending ? "Saving..." : "Save new PIN",
                danger: true,
              }).catch(() => null);
              if (approval) savePin.mutate(approval.pin);
            }}
          >
            Save PIN
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Sale & Tax Categories</h2>
        </div>
        <div className="record-list">
          {bootstrap.saleGroups.map((group) => (
            <SaleGroupRow
              key={group.id}
              group={group}
              setNotice={setNotice}
              onSaved={() =>
                queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
              }
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Support tools</h2>
        </div>
        <div className="support-tool-actions utility-actions">
          <button
            type="button"
            className="utility-action"
            onClick={() => pullCloud.mutate()}
            disabled={pullCloud.isPending}
          >
            <CloudDownload size={18} /> Get cloud updates
          </button>
          <button
            type="button"
            className="utility-action"
            onClick={() => requeueSync.mutate()}
            disabled={requeueSync.isPending}
          >
            Retry failed sync
          </button>
          <button
            type="button"
            className="utility-action"
            onClick={() => prints.mutate()}
            disabled={prints.isPending}
          >
            <Printer size={18} /> Run print queue
          </button>
        </div>
        {bootstrap.syncStatus.commandFailures?.length ? (
          <div className="record-list compact-list">
            <p className="soft-note">
              These cloud setup updates failed on this hub. Fix the setup in the
              cloud portal, send a new update, then mark the old warning
              resolved.
            </p>
            {bootstrap.syncStatus.commandFailures.map((failure) => (
              <article key={failure.commandId} className="record-row">
                <div>
                  <strong>{failure.type}</strong>
                  <span>
                    {failure.error} ·{" "}
                    {formatPosDateTime(failure.failedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    resolveCommandFailure.mutate(failure.commandId)
                  }
                  disabled={resolveCommandFailure.isPending}
                >
                  Mark resolved
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Recent print jobs</h2>
        </div>
        <div className="record-list">
          {bootstrap.printJobs.map((job) => (
            <article key={job.id} className="record-row">
              <div>
                <strong>{job.target_type}</strong>
                <span>
                  {job.status} · attempts {job.attempts}
                  {job.last_error ? ` · ${job.last_error}` : ""}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel danger-zone">
        <div className="panel-title">
          <h2>Danger zone</h2>
          <span>Reset this hub PC</span>
        </div>
        <p className="warning-text">
          Full reset removes the local restaurant database from this PC. Use
          this only when you want to start setup from zero.
        </p>
        <div className="reset-options">
          <label>
            Type RESET HUB
            <input
              value={resetPhrase}
              onChange={(event) => setResetPhrase(event.target.value)}
              placeholder="RESET HUB"
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={resetBackups}
              onChange={(event) => setResetBackups(event.target.checked)}
            />
            Also delete local backup files
          </label>
          <button
            type="button"
            className="danger-button"
            disabled={resetPhrase !== "RESET HUB" || fullReset.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Full reset hub",
                defaultReason: "Full reset hub",
                message: resetBackups
                  ? "This will delete local data and local backup files, then restart the hub."
                  : "This will delete local data, keep backup files, then restart the hub.",
                confirmLabel: fullReset.isPending
                  ? "Resetting..."
                  : "Reset hub",
                danger: true,
              }).catch(() => null);
              if (approval) fullReset.mutate(approval);
            }}
          >
            Reset hub
          </button>
        </div>
      </section>
    </div>
  );
}
