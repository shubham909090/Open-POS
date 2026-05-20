import { formatInr } from "@gaurav-pos/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { hubApi, type BillAdjustmentPayload, type BillPrinterSlot, type MenuItem, type TableOrder } from "../../hub-api.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { useOperationKeys } from "../../hooks/use-operation-keys.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";
import { BillPrinterChooser } from "./bill-printer-chooser.js";
import { BillRevisionEditor } from "./bill-revision-editor.js";

type SettlePayload = {
  discountType: "amount" | "percent";
  discountValue: number;
  tipPaise: number;
  payments: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
};

function isHotkeyTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input,select,textarea,button,a,[contenteditable='true'],[role='button']"));
}

export function BillingPanel({
  tableOrder,
  menuItems,
  sentTotal,
  generateBill,
  generating,
  onSettled,
  setNotice,
  requestManagerApproval
}: {
  tableOrder?: TableOrder | null;
  menuItems: MenuItem[];
  sentTotal: number;
  generateBill: (adjustments: BillAdjustmentPayload) => void;
  generating: boolean;
  onSettled: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discount, setDiscount] = useState("0");
  const [tip, setTip] = useState("0");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [reference, setReference] = useState("");
  const [payments, setPayments] = useState({ cash: "0", upi: "0", card: "0", online: "0" });
  const [pendingReprintApproval, setPendingReprintApproval] = useState<ManagerApproval | null>(null);
  const [reprintApprovalOpen, setReprintApprovalOpen] = useState(false);
  const [pendingNcApproval, setPendingNcApproval] = useState<ManagerApproval | null>(null);
  const operationKeys = useOperationKeys();
  const pendingScopes = useRef<Record<string, unknown>>({});
  const bill = tableOrder?.bill;
  const existingPaid = bill?.paid_paise ?? (tableOrder?.payments ?? []).reduce((total, payment) => total + payment.amount_paise, 0);
  const billBaseTotal = bill?.total_paise ?? sentTotal;
  const discountPaise = discountType === "percent"
    ? Math.round((billBaseTotal * Math.min(100, Number(discount || 0))) / 100)
    : Math.round(Number(discount || 0) * 100);
  const tipPaise = Math.round(Number(tip || 0) * 100);
  const finalTotal = Math.max(0, billBaseTotal - discountPaise + tipPaise);
  const newPaid = Object.values(payments).reduce((total, value) => total + Math.round(Number(value || 0) * 100), 0);
  const remaining = Math.max(0, finalTotal - existingPaid - newPaid);
  const overpaid = Math.max(0, existingPaid + newPaid - finalTotal);
  const changeDuePaise = Math.max(0, Math.round(Number(receivedAmount || 0) * 100) - Math.max(0, finalTotal - existingPaid));

  const billAdjustments = useCallback(
    (): BillAdjustmentPayload => ({
      discountType,
      discountValue: discountType === "percent" ? Number(discount || 0) : discountPaise,
      tipPaise
    }),
    [discountType, discount, discountPaise, tipPaise]
  );

  const settle = useMutation({
    mutationFn: (payload: SettlePayload) => {
      if (!bill) throw new Error("Generate the bill before taking payment.");
      const scope = { billId: bill.id, existingPaid, payload };
      pendingScopes.current["bill-settle"] = scope;
      return hubApi.settleBill(bill.id, payload, operationKeys.keyFor("bill-settle", scope));
    },
    onSuccess: async () => {
      if (pendingScopes.current["bill-settle"]) operationKeys.clear("bill-settle", pendingScopes.current["bill-settle"]);
      await onSettled();
      await queryClient.invalidateQueries({ queryKey: ["dailyReports"] });
      setPayments({ cash: "0", upi: "0", card: "0", online: "0" });
      setReference("");
      setNotice({ tone: "good", text: "Bill punched. Table state refreshed from the hub." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  function requestSettle() {
    if (!bill) {
      setNotice({ tone: "bad", text: "Generate the bill before taking payment." });
      return;
    }
    const rows = (Object.entries(payments) as Array<[keyof typeof payments, string]>)
      .map(([method, value]) => ({ method, amountPaise: Math.round(Number(value || 0) * 100), reference: reference || undefined }))
      .filter((row) => row.amountPaise > 0);
    if (rows.length === 0) {
      setNotice({ tone: "bad", text: "Enter at least one payment." });
      return;
    }
    if (remaining > 0) {
      setNotice({ tone: "bad", text: "Payment is less than the bill balance." });
      return;
    }
    if (overpaid > 0) {
      setNotice({ tone: "bad", text: `Payment is ${formatInr(overpaid)} more than the bill balance.` });
      return;
    }
    const payload = { discountType, discountValue: discountType === "percent" ? Number(discount || 0) : discountPaise, tipPaise, payments: rows };
    settle.mutate(payload);
  }
  const canPunchBill = Boolean(bill && !settle.isPending && newPaid > 0 && remaining === 0 && overpaid === 0);
  const reprintBill = useMutation({
    mutationFn: (input: { approval: ManagerApproval; printerSlot: BillPrinterSlot }) => {
      if (!bill) throw new Error("Generate the bill first.");
      const payload = { managerApproval: input.approval, ...billAdjustments() };
      const scope = { billId: bill.id, payload, printerSlot: input.printerSlot };
      pendingScopes.current["bill-reprint"] = scope;
      return hubApi.reprintBill(bill.id, payload, operationKeys.keyFor("bill-reprint", scope), input.printerSlot);
    },
    onSuccess: () => {
      if (pendingScopes.current["bill-reprint"]) operationKeys.clear("bill-reprint", pendingScopes.current["bill-reprint"]);
      setNotice({ tone: "good", text: "Reprint queued after manager approval." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const canRequestReprint = Boolean(bill && !reprintBill.isPending && !reprintApprovalOpen && !pendingReprintApproval && !pendingNcApproval);
  const requestReprint = useCallback(async () => {
    if (!canRequestReprint) return;
    setReprintApprovalOpen(true);
    const approval = await requestManagerApproval({
      title: "Approve bill reprint",
      defaultReason: "Bill reprint",
      confirmLabel: reprintBill.isPending ? "Queueing..." : "Reprint bill"
    }).catch(() => null);
    setReprintApprovalOpen(false);
    if (approval) setPendingReprintApproval(approval);
  }, [canRequestReprint, reprintBill.isPending, requestManagerApproval]);
  const markNc = useMutation({
    mutationFn: (input: { approval: ManagerApproval; printerSlot: BillPrinterSlot }) => {
      if (!bill) throw new Error("Generate the bill first.");
      const payload = { managerApproval: input.approval, ...billAdjustments() };
      const scope = { billId: bill.id, payload, printerSlot: input.printerSlot };
      pendingScopes.current["bill-nc"] = scope;
      return hubApi.markBillNc(bill.id, payload, operationKeys.keyFor("bill-nc", scope), input.printerSlot);
    },
    onSuccess: async () => {
      if (pendingScopes.current["bill-nc"]) operationKeys.clear("bill-nc", pendingScopes.current["bill-nc"]);
      await onSettled();
      setNotice({ tone: "good", text: "NC bill printed and excluded from sales totals." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  function fillFull(method: keyof typeof payments) {
    setPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(Math.max(0, finalTotal - existingPaid) / 100) });
  }

  function fillRemaining(method: keyof typeof payments) {
    const otherTotal = (Object.entries(payments) as Array<[keyof typeof payments, string]>)
      .filter(([key]) => key !== method)
      .reduce((total, [, value]) => total + Math.round(Number(value || 0) * 100), 0);
    const rest = Math.max(0, finalTotal - existingPaid - otherTotal);
    setPayments((current) => ({ ...current, [method]: String(rest / 100) }));
  }

  function fillRemainingOnFocus(method: keyof typeof payments) {
    if (Number(payments[method] || 0) > 0) return;
    const otherTotal = (Object.entries(payments) as Array<[keyof typeof payments, string]>)
      .filter(([key]) => key !== method)
      .reduce((total, [, value]) => total + Math.round(Number(value || 0) * 100), 0);
    if (otherTotal <= 0) return;
    const rest = Math.max(0, finalTotal - existingPaid - otherTotal);
    setPayments((current) => ({ ...current, [method]: String(rest / 100) }));
  }

  const paymentEntries = (["cash", "upi", "card", "online"] as const)
    .map((method) => ({ method, paise: Math.round(Number(payments[method] || 0) * 100) }))
    .filter((entry) => entry.paise > 0);

  useEffect(() => {
    if (!canPunchBill) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "F8") return;
      event.preventDefault();
      requestSettle();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canPunchBill, discountType, discountPaise, tipPaise, payments, reference, remaining, overpaid]);

  useEffect(() => {
    if (!canRequestReprint) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "Enter") return;
      if (isHotkeyTypingTarget(event.target)) return;
      event.preventDefault();
      void requestReprint();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRequestReprint, requestReprint]);

  useEffect(() => {
    if (!bill) return;
    setDiscountType("amount");
    setDiscount(String((bill.discount_paise ?? 0) / 100));
    setTip(String((bill.tip_paise ?? 0) / 100));
  }, [bill?.id]);

  if (!tableOrder?.order) {
    return <EmptyState title="No active order" description="Add dishes and send them before generating a bill." />;
  }

  const adjustmentControls = (
    <section className="bill-adjustments">
      <div className="mini-title">
        <strong>Bill adjustments</strong>
        <span>Discount {formatInr(discountPaise)} · tip {formatInr(tipPaise)}</span>
      </div>
      <div className="adjust-grid">
        <label>
          Discount
          <span className="split-input">
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "amount" | "percent")}>
              <option value="amount">Rs</option>
              <option value="percent">%</option>
            </select>
            <input aria-label="Discount amount" value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" />
          </span>
        </label>
        <label>
          Tip
          <input aria-label="Tip amount" value={tip} onChange={(event) => setTip(event.target.value)} inputMode="decimal" />
        </label>
      </div>
    </section>
  );

  if (!bill) {
    return (
      <div className="bill-start bill-start-with-adjustments">
        <div className="bill-metrics">
          <Metric label="Current table total" value={formatInr(sentTotal)} />
          <Metric label="Discount" value={formatInr(discountPaise)} />
          <Metric label="Final bill" value={formatInr(finalTotal)} />
        </div>
        {adjustmentControls}
        <button type="button" disabled={sentTotal <= 0 || generating} onClick={() => generateBill(billAdjustments())}>
          {generating ? "Generating..." : "Generate bill"}
        </button>
      </div>
    );
  }

  return (
    <div className="billing-panel">
      <div className="bill-metrics">
        <Metric label="Bill total" value={formatInr(finalTotal)} />
        <Metric label="Already paid" value={formatInr(existingPaid)} />
        <Metric label="Balance" value={formatInr(Math.max(0, finalTotal - existingPaid))} />
      </div>
      {bill.revision_number ? <p className="text-sm text-muted">Bill revision {bill.revision_number}{bill.is_nc ? ` · NC: ${bill.nc_reason ?? ""}` : ""}</p> : null}
      {adjustmentControls}
      <section className="bill-payment-section">
        <div className="mini-title">
          <strong>Payment</strong>
          <span>{formatInr(remaining)} left</span>
        </div>
        <div className="quick-pay">
          <button type="button" onClick={() => fillFull("cash")}>Full cash</button>
          <button type="button" onClick={() => fillFull("upi")}>Full UPI</button>
          <button type="button" onClick={() => fillFull("card")}>Full card</button>
          <button type="button" onClick={() => fillFull("online")}>Full online</button>
        </div>
        <div className="payment-grid">
          {(["cash", "upi", "card", "online"] as const).map((method) => (
            <label key={method}>
              {method.toUpperCase()}
              <span className="payment-input-row">
                <input value={payments[method]} onFocus={() => fillRemainingOnFocus(method)} onChange={(event) => setPayments((current) => ({ ...current, [method]: event.target.value }))} inputMode="decimal" />
                <button type="button" className="fill-rest-btn" onClick={() => fillRemaining(method)} disabled={remaining <= 0} aria-label={`Fill remaining into ${method}`}>Rest</button>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className={`change-helper ${changeDuePaise > 0 ? "good" : ""}`}>
        <div className="mini-title">
          <strong>Change</strong>
          <span>Balance {formatInr(Math.max(0, finalTotal - existingPaid))}</span>
        </div>
        <div className="change-helper-row">
          <label>
            Received amount
            <input aria-label="Received amount" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} inputMode="decimal" placeholder="0" />
          </label>
          <strong>{`Return ${formatInr(changeDuePaise)}`}</strong>
        </div>
      </section>
      <label>
        Payment note
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UPI ref, card slip, or captain note" />
      </label>
      {paymentEntries.length > 1 ? (
        <div className="split-summary" aria-label="Split payment breakdown">
          Split: {paymentEntries.map((entry) => `${entry.method.toUpperCase()} ${formatInr(entry.paise)}`).join(" + ")}
        </div>
      ) : null}
      <button type="button" className="punch-button" disabled={!canPunchBill} onClick={requestSettle}>
        <span>{settle.isPending ? "Punching..." : `Punch bill · ${remaining > 0 ? `${formatInr(remaining)} left` : "paid"}`}</span>
        <kbd>F8</kbd>
      </button>
      {overpaid > 0 ? <p className="text-sm text-muted">Payment is {formatInr(overpaid)} more than the balance.</p> : null}
      <div className="reprint-action-row">
        <button
          type="button"
          className="secondary-button reprint-bill-button"
          disabled={!canRequestReprint}
          onClick={() => { void requestReprint(); }}
        >
          <span>{reprintBill.isPending ? "Queueing..." : "Reprint bill"}</span>
          <kbd>Enter</kbd>
        </button>
      </div>
      <BillRevisionEditor
        tableOrder={tableOrder}
        menuItems={menuItems}
        existingPaid={existingPaid}
        onSettled={onSettled}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
      />
      <button
        type="button"
        className="danger-link"
        disabled={markNc.isPending}
        onClick={async () => {
          const approval = await requestManagerApproval({
            title: "Approve NC bill",
            defaultReason: "NC bill",
            message: "NC bills print normally, but their money is excluded from sales totals.",
            confirmLabel: markNc.isPending ? "Marking..." : "Mark NC bill",
            danger: true
          }).catch(() => null);
          if (approval) setPendingNcApproval(approval);
        }}
      >
        {markNc.isPending ? "Marking NC..." : "Mark NC bill"}
      </button>
      <BillPrinterChooser
        open={Boolean(pendingReprintApproval)}
        title="Reprint bill where?"
        busy={reprintBill.isPending}
        onClose={() => setPendingReprintApproval(null)}
        onChoose={(printerSlot) => {
          if (!pendingReprintApproval) return;
          const approval = pendingReprintApproval;
          setPendingReprintApproval(null);
          reprintBill.mutate({ approval, printerSlot });
        }}
      />
      <BillPrinterChooser
        open={Boolean(pendingNcApproval)}
        title="Print NC bill where?"
        busy={markNc.isPending}
        onClose={() => setPendingNcApproval(null)}
        onChoose={(printerSlot) => {
          if (!pendingNcApproval) return;
          const approval = pendingNcApproval;
          setPendingNcApproval(null);
          markNc.mutate({ approval, printerSlot });
        }}
      />
    </div>
  );
}
