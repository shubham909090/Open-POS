import { CheckCheck } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { Button } from "../ui/button.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";

export function KdsOperationsCard({
  bootstrap,
  setNotice,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"serve" | "disable" | null>(null);
  const kdsEnabled = bootstrap.setup?.kdsEnabled ?? true;
  const activeKdsUnits = bootstrap.productionUnits.filter(
    (unit) =>
      unit.active && unit.kds_enabled !== false && unit.kds_enabled !== 0,
  ).length;
  const visibleKdsUnits = kdsEnabled ? activeKdsUnits : 0;
  const refreshKds = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["kds"] }),
    ]);
  };

  const markServed = useMutation({
    mutationFn: hubApi.markAllKdsServed,
    onSuccess: async (result) => {
      setConfirm(null);
      await refreshKds();
      setNotice({
        tone: "good",
        text: `${result.markedServed} KDS tickets marked served.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const updateKds = useMutation({
    mutationFn: (enabled: boolean) => hubApi.updateKdsSettings(enabled),
    onSuccess: async (result) => {
      setConfirm(null);
      await refreshKds();
      setNotice({
        tone: "good",
        text: result.enabled
          ? "KDS turned on."
          : `KDS turned off. ${result.markedServed} tickets marked served.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const busy = markServed.isPending || updateKds.isPending;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Kitchen display</h2>
          <span>Live preparation queues for your kitchen and counters.</span>
        </div>
      </div>
      <div className="settings-info-row">
        <div>
          <h3>Enable kitchen display</h3>
          <p>
            {visibleKdsUnits} counters visible. Turning this off also marks
            current display tickets served.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Enable kitchen display"
          aria-checked={kdsEnabled}
          className="settings-switch"
          onClick={() =>
            kdsEnabled ? setConfirm("disable") : updateKds.mutate(true)
          }
          disabled={busy}
        >
          <span />
        </button>
      </div>
      <div className="settings-info-row">
        <div>
          <h3>Clear the preparation queue</h3>
          <p>
            Mark queued, preparing and ready display tickets served. Orders and
            payments stay unchanged.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirm("serve")}
          disabled={busy}
        >
          <CheckCheck size={16} />
          Mark all served
        </Button>
      </div>
      <ConfirmationDialog
        open={confirm === "serve"}
        title="Mark all KDS tickets served?"
        message="This marks every queued, preparing, and ready KDS ticket as served. Orders, bills, and payments stay unchanged."
        confirmLabel={markServed.isPending ? "Marking..." : "Mark all served"}
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => markServed.mutate()}
      />
      <ConfirmationDialog
        open={confirm === "disable"}
        title="Turn KDS off?"
        message="This turns KDS off and marks current KDS tickets served. KOT/BOT printing stays unchanged."
        confirmLabel={updateKds.isPending ? "Turning off..." : "Turn off"}
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => updateKds.mutate(false)}
      />
    </section>
  );
}
