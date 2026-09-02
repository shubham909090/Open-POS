import { useIsMutating, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { hubApi, type AlcoholStorageRow } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { EmptyState } from "../ui/empty-state.js";
import { Button } from "../ui/button.js";

export function AlcoholStoragePanel({
  rows,
  invalidate,
  setNotice,
  requestManagerApproval,
}: {
  rows: AlcoholStorageRow[];
  invalidate: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const [search, setSearch] = useState("");
  const busy = useIsMutating({ mutationKey: ["alcoholStock"] }) > 0;
  const reset = useMutation({
    mutationKey: ["alcoholStock"],
    mutationFn: (approval: ManagerApproval) => hubApi.resetAlcoholStock({ masterApproval: approval }),
    onSuccess: async ({ resetCount }) => {
      await invalidate();
      setNotice({ tone: "good", text: `Liquor stock reset to zero for ${resetCount} item(s).` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const visibleRows = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle);
  });
  return (
    <div className="storage-list">
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {rows.length > 8 ? (
            <input className="min-w-0 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search liquor stock" aria-label="Search liquor stock" />
          ) : <span />}
          <Button
            type="button"
            variant="danger"
            disabled={busy || !rows.some((row) => row.sealed_large_count !== 0 || row.open_large_ml !== 0 || row.sealed_small_count !== 0)}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Reset all liquor stock?",
                message: "Set every liquor item's large bottles, open ml, and small bottles to zero. Bills, sales, and stock history will be kept. Pending orders will still deduct stock when settled.",
                defaultReason: "Owner liquor stock reset",
                pinLabel: "Master PIN",
                confirmLabel: "Reset stock to zero",
                approvedBy: "owner",
                danger: true,
              }).catch(() => null);
              if (approval) reset.mutate(approval);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {reset.isPending ? "Resetting..." : "Reset liquor stock"}
          </Button>
        </div>
      ) : null}
      {visibleRows.map((row) => (
        <AlcoholStorageCard
          key={row.id}
          row={row}
          invalidate={invalidate}
          setNotice={setNotice}
          requestManagerApproval={requestManagerApproval}
          busy={busy}
        />
      ))}
      {rows.length === 0 ? (
        <EmptyState
          title="No liquor stock yet"
          description="Add plain liquor from the Items tab first."
        />
      ) : rows.length > 0 && visibleRows.length === 0 ? (
        <EmptyState title="No matching stock" description="Clear search or try another liquor name." />
      ) : null}
    </div>
  );
}

function AlcoholStorageCard({
  row,
  invalidate,
  setNotice,
  requestManagerApproval,
  busy,
}: {
  row: AlcoholStorageRow;
  invalidate: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [large, setLarge] = useState("");
  const [open, setOpen] = useState("");
  const [small, setSmall] = useState("");

  const sensitiveEdit = mode === "set" || [large, open, small].some((value) => Number(value || 0) < 0);

  const adjust = useMutation({
    mutationKey: ["alcoholStock"],
    mutationFn: (approval: ManagerApproval) =>
      hubApi.adjustAlcoholStock(row.id, {
        mode,
        sealedLargeCount: large === "" ? undefined : Number(large),
        openLargeMl: open === "" ? undefined : Number(open),
        sealedSmallCount: small === "" ? undefined : Number(small),
        ...(sensitiveEdit
          ? { masterApproval: { ...approval, approvedBy: "owner" } }
          : { managerApproval: { ...approval, approvedBy: "manager" } }),
      }),
    onSuccess: async () => {
      setLarge("");
      setOpen("");
      setSmall("");
      await invalidate();
      setNotice({ tone: "good", text: "Alcohol stock updated." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <article className="panel storage-card">
      <div className="panel-title">
        <div>
          <h2>{row.name}</h2>
          <span>
            {row.large_bottle_ml} ml large · {row.small_bottle_ml} ml small
          </span>
        </div>
        <strong>{row.total_available_ml} ml</strong>
      </div>
      <div className="stock-metrics">
        <span>
          Large bottles <b>{row.sealed_large_count}</b>
        </span>
        <span>
          Open large <b>{row.open_large_ml} ml</b>
        </span>
        <span>
          Small bottles <b>{row.sealed_small_count}</b>
        </span>
        <span>
          Pending <b>{row.pending_total_ml} ml</b>
        </span>
        <span>
          Expected <b>{row.expected_after_settlement_ml} ml</b>
        </span>
      </div>
      <form
        className="stock-adjust-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const approval = await requestManagerApproval({
            title: sensitiveEdit ? `Master approval for ${row.name}` : `Approve stock edit for ${row.name}`,
            defaultReason: sensitiveEdit ? "Owner liquor stock correction" : "Alcohol stock addition",
            pinLabel: sensitiveEdit ? "Master PIN" : "Manager PIN",
            confirmLabel: "Save stock",
            danger: true,
          }).catch(() => null);
          if (!approval) return;
          adjust.mutate(approval);
        }}
      >
        <label>
          Adjustment
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as "delta" | "set")}
          >
            <option value="delta">Plus / minus</option>
            <option value="set">Set exact</option>
          </select>
        </label>
        <label>
          Large bottles
          <input
            value={large}
            onChange={(event) => setLarge(event.target.value)}
            placeholder="0"
            inputMode="numeric"
          />
        </label>
        <label>
          Open ml
          <input
            value={open}
            onChange={(event) => setOpen(event.target.value)}
            placeholder="0"
            inputMode="numeric"
          />
        </label>
        <label>
          Small bottles
          <input
            value={small}
            onChange={(event) => setSmall(event.target.value)}
            placeholder="0"
            inputMode="numeric"
          />
        </label>
        <button type="submit" disabled={busy || [large, open, small].every((value) => value === "")}>
          {adjust.isPending ? "Saving..." : "Save"}
        </button>
      </form>
    </article>
  );
}
