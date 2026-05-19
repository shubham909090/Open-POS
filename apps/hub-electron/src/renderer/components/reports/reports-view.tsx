import { Fragment, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type BillPrinterSlot, type CloseSummary, type DailyReportDetail, type MenuItem } from "../../hub-api.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import { alcoholMovementSourceLabel, alcoholMovementDeltaText } from "../../lib/format.js";
import { Dialog } from "../ui/dialog.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";
import { BillPrinterChooser } from "../orders/bill-printer-chooser.js";

const REPORT_PAGE_SIZE = 8;
const DETAIL_PAGE_SIZE = 6;
const PAYMENT_METHODS = ["cash", "upi", "card", "online"] as const;
type HistoryBill = NonNullable<CloseSummary["billSummaries"]>[number];
type HistoryPaymentMethod = (typeof PAYMENT_METHODS)[number];
const PAYMENT_METHOD_LABELS: Record<HistoryPaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online"
};
type HistoryEditItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string | null;
  menuItemVariantId?: string | null;
  saleGroupId?: string;
  productionUnitId?: string | null;
  name: string;
  quantity: number;
  unitPricePaise: number;
};

export function ReportsView() {
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [closedLimit, setClosedLimit] = useState(REPORT_PAGE_SIZE);
  const [stockLimit, setStockLimit] = useState(REPORT_PAGE_SIZE);
  const currentSummary = useQuery({
    queryKey: ["currentBusinessDaySummary"],
    queryFn: hubApi.currentBusinessDaySummary,
  });
  const dailyReports = useQuery({
    queryKey: ["dailyReports"],
    queryFn: hubApi.dailyReports,
  });
  const alcoholStockMovements = useQuery({
    queryKey: ["alcoholStockMovements"],
    queryFn: hubApi.alcoholStockMovements,
  });
  const dailyReportDetail = useQuery({
    queryKey: ["dailyReport", expandedReportId],
    queryFn: () => hubApi.dailyReport(expandedReportId ?? ""),
    enabled: Boolean(expandedReportId),
  });
  const summary = currentSummary.data;
  const closedReports = dailyReports.data ?? [];
  const stockMovements = alcoholStockMovements.data ?? [];

  return (
    <div className="reports-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Current business day</h2>
          <span>
            {summary?.businessDay.business_date ?? "6 AM IST boundary"}
          </span>
        </div>
        {summary ? (
          <>
            <div className="report-metrics">
              <Metric
                label="Sales"
                value={formatInr(summary.finalSalesPaise)}
                className="report-metric sales"
              />
              <Metric
                label="Cash"
                value={formatInr(summary.cashPaymentsPaise)}
                className="report-metric cash"
              />
              <Metric
                label="Non-cash"
                value={formatInr(summary.nonCashPaymentsPaise)}
                className="report-metric noncash"
              />
              <Metric label="Bills" value={String(summary.billCount)} className="report-metric bills" />
            </div>
            <ReportDetailPanels summary={summary} />
          </>
        ) : (
          <EmptyState
            title="Report loading"
            description="The hub creates business days automatically at 6:00 AM IST."
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Closed day reports</h2>
          <span>{closedReports.length} saved</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table closed-report-table">
            <thead>
              <tr>
                <th>Business day</th>
                <th>Bills</th>
                <th>Sales</th>
                <th>Payments</th>
                <th>Finalized</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {closedReports.slice(0, closedLimit).map((report) => (
                <Fragment key={report.pos_day_id}>
                  <tr>
                    <td className="strong-cell">{report.business_date}</td>
                    <td>{report.bill_count}</td>
                    <td>{formatInr(report.final_sales_paise)}</td>
                    <td>{formatInr(report.total_payments_paise)}</td>
                    <td>{formatPosDateTime(report.finalized_at)}</td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="secondary-button compact"
                        onClick={() => setExpandedReportId(expandedReportId === report.pos_day_id ? null : report.pos_day_id)}
                      >
                        {expandedReportId === report.pos_day_id ? "Hide" : "Open"}
                      </button>
                    </td>
                  </tr>
                  {expandedReportId === report.pos_day_id ? (
                    <tr>
                      <td colSpan={6} className="report-table-detail">
                        {dailyReportDetail.isLoading ? (
                          <p className="plain-state">Loading report...</p>
                        ) : dailyReportDetail.data ? (
                          <ReportDetailPanels summary={dailyReportDetail.data} />
                        ) : (
                          <p className="warning-text">Report detail could not load.</p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!dailyReports.data?.length ? (
            <EmptyState
              title="No finalized reports yet"
              description="Reports finalize automatically after the 6 AM boundary once that day's tables are settled or cancelled."
            />
          ) : null}
          {closedReports.length > closedLimit ? (
            <button type="button" className="load-more-button" onClick={() => setClosedLimit((limit) => limit + REPORT_PAGE_SIZE)}>
              Load more reports
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel reports-wide">
        <div className="panel-title">
          <h2>Alcohol stock movements</h2>
          <span>{stockMovements.length} recent</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table stock-movement-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Source</th>
                <th>Movement</th>
                <th>Large</th>
                <th>Open ml</th>
                <th>Small</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {stockMovements.slice(0, stockLimit).map((movement) => (
                <tr key={movement.id}>
                  <td className="strong-cell">{movement.item_name}</td>
                  <td>{alcoholMovementSourceLabel(movement.source_type)}</td>
                  <td>{alcoholMovementDeltaText(movement)}</td>
                  <td>{movement.balance_sealed_large}</td>
                  <td>{movement.balance_open_large_ml}</td>
                  <td>{movement.balance_sealed_small}</td>
                  <td>{formatPosDateTime(movement.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!alcoholStockMovements.data?.length ? (
            <EmptyState
              title="No alcohol stock history yet"
              description="Stock sales, settlements, manual edits, and negative-stock events will appear here."
            />
          ) : null}
          {stockMovements.length > stockLimit ? (
            <button type="button" className="load-more-button" onClick={() => setStockLimit((limit) => limit + REPORT_PAGE_SIZE)}>
              Load more movements
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReportDetailPanels({ summary }: { summary: CloseSummary | DailyReportDetail }) {
  const queryClient = useQueryClient();
  const [billLimit, setBillLimit] = useState(DETAIL_PAGE_SIZE);
  const [itemLimit, setItemLimit] = useState(DETAIL_PAGE_SIZE);
  const [editingBill, setEditingBill] = useState<HistoryBill | null>(null);
  const [editItems, setEditItems] = useState<HistoryEditItem[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<"amount" | "percent">("amount");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editTip, setEditTip] = useState("0");
  const [editPayments, setEditPayments] = useState<Record<HistoryPaymentMethod, string>>({ cash: "0", upi: "0", card: "0", online: "0" });
  const [editPaymentReference, setEditPaymentReference] = useState("");
  const [search, setSearch] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [historyPrintBillId, setHistoryPrintBillId] = useState<string | null>(null);
  const [historyEditPrintBill, setHistoryEditPrintBill] = useState<HistoryBill | null>(null);
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: hubApi.bootstrap });
  const historyReprint = useMutation({
    mutationFn: (input: { billId: string; printerSlot: BillPrinterSlot }) =>
      hubApi.historyReprintBill(input.billId, `history-reprint-${input.billId}-${Date.now()}`, input.printerSlot)
  });
  const historyEdit = useMutation({
    mutationFn: (input: { bill: HistoryBill; printerSlot: BillPrinterSlot }) =>
      hubApi.historyEditBill(
        input.bill.billId,
        {
          masterApproval: { pin: masterPin, reason: "Owner history edit", approvedBy: "owner" },
          discountType: editDiscountType,
          discountValue: editDiscountType === "percent" ? Number(editDiscount || 0) : Math.round(Number(editDiscount || 0) * 100),
          tipPaise: Math.round(Number(editTip || 0) * 100),
          payments: input.bill.isNc
            ? undefined
            : PAYMENT_METHODS
                .map((method) => ({ method, amountPaise: Math.round(Number(editPayments[method] || 0) * 100), reference: editPaymentReference.trim() || undefined }))
                .filter((payment) => payment.amountPaise > 0),
          items: editItems
            .filter((item) => item.quantity > 0)
            .map((item) =>
              item.menuItemId
                ? {
                    orderItemId: item.orderItemId,
                    menuItemId: item.menuItemId,
                    menuItemVariantId: item.menuItemVariantId ?? undefined,
                    quantity: item.quantity,
                  }
                : {
                    orderItemId: item.orderItemId,
                    openName: item.name,
                    openPricePaise: item.unitPricePaise,
                    saleGroupId: item.saleGroupId ?? "sg-food",
                    productionUnitId: item.productionUnitId ?? null,
                    quantity: item.quantity,
                  }
            ),
        },
        `history-edit-${input.bill.billId}-${Date.now()}`,
        input.printerSlot
      ),
    onSuccess: async () => {
      setEditingBill(null);
      setEditItems([]);
      setSearch("");
      setMasterPin("");
      setEditPayments({ cash: "0", upi: "0", card: "0", online: "0" });
      setEditPaymentReference("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["currentBusinessDaySummary"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReports"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReport"] }),
      ]);
    },
    onError: (error) => setEditError(error instanceof Error ? error.message : "Could not edit history bill."),
  });
  const bills = [...(summary.billSummaries ?? [])].sort((left, right) => (right.billNumber ?? 0) - (left.billNumber ?? 0));
  const groups = summary.groupSummaries ?? [];
  const items = summary.itemSummaries ?? [];
  const payments = getPaymentTotals(summary, bills);
  const menuItems = bootstrap.data?.menuItems.filter((item) => item.active) ?? [];
  const searchedMenu = search.trim()
    ? menuItems
        .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 6)
    : [];
  const searchedMenuIds = searchedMenu.map((item) => item.id).join("|");
  const editTotal = editItems.reduce((total, item) => total + Math.max(0, item.quantity) * item.unitPricePaise, 0);
  const editDiscountPaise = editDiscountType === "percent" ? Math.round((editTotal * Math.min(100, Number(editDiscount || 0))) / 100) : Math.round(Number(editDiscount || 0) * 100);
  const editTipPaise = Math.round(Number(editTip || 0) * 100);
  const editFinalTotal = Math.max(0, editTotal - editDiscountPaise + editTipPaise);
  const editPaymentTotalPaise = PAYMENT_METHODS.reduce((total, method) => total + Math.round(Number(editPayments[method] || 0) * 100), 0);
  const editPaymentRemainingPaise = Math.max(0, editFinalTotal - editPaymentTotalPaise);
  const editPaymentOverPaise = Math.max(0, editPaymentTotalPaise - editFinalTotal);
  const historyPaymentExact = Boolean(editingBill?.isNc) || editPaymentTotalPaise === editFinalTotal;
  const canSaveEdit = Boolean(editingBill && masterPin.trim().length >= 4 && editItems.some((item) => item.quantity > 0) && historyPaymentExact && !historyEdit.isPending);
  const openHistoryEdit = (bill: HistoryBill) => {
    setEditingBill(bill);
    setEditError(null);
    setMasterPin("");
    setSearch("");
    setEditDiscountType("amount");
    setEditDiscount(String((bill.discountPaise ?? 0) / 100));
    setEditTip(String((bill.tipPaise ?? 0) / 100));
    const nextPayments: Record<HistoryPaymentMethod, string> = { cash: "0", upi: "0", card: "0", online: "0" };
    for (const payment of bill.payments ?? []) {
      if (PAYMENT_METHODS.includes(payment.method as HistoryPaymentMethod)) {
        const method = payment.method as HistoryPaymentMethod;
        nextPayments[method] = String((Number(nextPayments[method] || 0) * 100 + payment.amountPaise) / 100);
      }
    }
    setEditPayments(nextPayments);
    setEditPaymentReference(bill.payments?.find((payment) => payment.reference)?.reference ?? "");
    setEditItems(
      (bill.items ?? []).map((item, index) => ({
        key: item.orderItemId ?? `${bill.billId}-${index}`,
        orderItemId: item.orderItemId,
        menuItemId: item.menuItemId,
        menuItemVariantId: item.menuItemVariantId,
        saleGroupId: item.saleGroupId,
        productionUnitId: item.productionUnitId,
        name: item.name,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
      }))
    );
  };
  const updateEditQty = (key: string, delta: number) => {
    setEditItems((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.orderItemId || item.quantity > 0)
    );
  };
  const addMenuItem = useCallback((item: MenuItem, variant?: NonNullable<MenuItem["variants"]>[number]) => {
    const variantId = variant?.id ?? item.variants?.find((candidate) => candidate.kind === "default" && candidate.active)?.id ?? undefined;
    const price = variant?.price_paise ?? item.variants?.find((candidate) => candidate.id === variantId)?.price_paise ?? item.price_paise;
    const name = variant && variant.kind !== "default" ? `${item.name} ${variant.label}` : item.name;
    const existingKey = `new-${item.id}-${variantId ?? "default"}`;
    setEditItems((current) => {
      const existing = current.find((entry) => entry.key === existingKey || (!entry.orderItemId && entry.menuItemId === item.id && entry.menuItemVariantId === variantId));
      if (existing) return current.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry));
      return [
        ...current,
        {
          key: existingKey,
          menuItemId: item.id,
          menuItemVariantId: variantId,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name,
          quantity: 1,
          unitPricePaise: price,
        },
      ];
    });
  }, []);
  const addKeyboardHistoryItem = useCallback(
    (item: MenuItem) => {
      const variant = (item.variants ?? []).find((candidate) => Boolean(candidate.active) && candidate.kind !== "default");
      addMenuItem(item, variant);
    },
    [addMenuItem]
  );
  const historySearchKeyboard = useKeyboardListNavigation({
    items: searchedMenu,
    enabled: Boolean(search.trim()),
    resetKey: `${search}|${searchedMenuIds}`,
    onCommit: addKeyboardHistoryItem
  });
  const fillHistoryPaymentFull = (method: HistoryPaymentMethod) => {
    setEditPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(editFinalTotal / 100) });
  };
  const fillHistoryPaymentRemaining = (method: HistoryPaymentMethod) => {
    setEditPayments((current) => {
      const otherTotal = PAYMENT_METHODS
        .filter((candidate) => candidate !== method)
        .reduce((total, candidate) => total + Math.round(Number(current[candidate] || 0) * 100), 0);
      return { ...current, [method]: String(Math.max(0, editFinalTotal - otherTotal) / 100) };
    });
  };
  const fillHistoryPaymentRemainingOnFocus = (method: HistoryPaymentMethod) => {
    setEditPayments((current) => {
      if (Number(current[method] || 0) > 0) return current;
      const otherTotal = PAYMENT_METHODS
        .filter((candidate) => candidate !== method)
        .reduce((total, candidate) => total + Math.round(Number(current[candidate] || 0) * 100), 0);
      if (otherTotal <= 0) return current;
      return { ...current, [method]: String(Math.max(0, editFinalTotal - otherTotal) / 100) };
    });
  };

  return (
    <div className="report-detail-grid">
      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Payments</strong>
          <span>{formatInr(payments.total)} collected</span>
        </div>
        <ReportTable
          columns={["Method", "Amount"]}
          rows={[
            ["Cash", formatInr(payments.cash)],
            ["UPI", formatInr(payments.upi)],
            ["Card", formatInr(payments.card)],
            ["Online", formatInr(payments.online)],
          ]}
        />
      </section>

      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Sale & tax categories</strong>
          <span>{groups.length} categories</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Qty</th>
                <th>Tax</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.saleGroupId}>
                  <td className="strong-cell">{group.name}</td>
                  <td>{group.quantity}</td>
                  <td>{formatInr(group.taxPaise)}</td>
                  <td>{formatInr(group.finalSalesPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!groups.length ? <p className="plain-state">No category totals yet.</p> : null}
        </div>
      </section>

      <section className="report-detail-card report-history-panel">
        <div className="mini-title">
          <strong>Order History</strong>
          <span>
            showing {Math.min(billLimit, bills.length)} of {bills.length} bills
          </span>
        </div>
        <div className="report-table-wrap bill-history-list">
          <table className="data-table bill-history-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Breakup</th>
                <th>Settled</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bills.slice(0, billLimit).map((bill) => (
                <tr key={bill.billId}>
                  <td className="strong-cell">
                    #{bill.billNumber ?? bill.billId}
                    {bill.modified ? <small className="modified-pill">Modified</small> : bill.revisionNumber ? <small>rev {bill.revisionNumber}</small> : null}
                    {bill.isNc ? <small className="nc-pill">NC</small> : null}
                    {bill.discountPaise > 0 ? <small className="discount-pill">Discount</small> : null}
                  </td>
                  <td>{bill.tableName}</td>
                  <td><span className={`bill-status ${bill.status}`}>{bill.status}</span></td>
                  <td className="wrap-cell history-item-lines">{bill.items?.length ? bill.items.map((item) => <span key={item.orderItemId}>{item.quantity} x {item.name}</span>) : "No item detail"}</td>
                  <td>
                    <strong>{formatInr(bill.finalTotalPaise)}</strong>
                    {bill.discountPaise > 0 ? <small className="history-discount-text">Discount {formatInr(bill.discountPaise)}</small> : null}
                  </td>
                  <td>{formatInr(bill.paidPaise)}</td>
                  <td className="wrap-cell">
                    <div className="history-breakup">
                      <span>Subtotal {formatInr(bill.subtotalPaise ?? Math.max(0, bill.totalPaise - (bill.taxPaise ?? 0)))}</span>
                      <span>Tax {formatInr(bill.taxPaise ?? 0)}</span>
                      <span>Discount {formatInr(bill.discountPaise)}</span>
                      <span>Tip {formatInr(bill.tipPaise)}</span>
                      {bill.payments.length ? <span>{bill.payments.map((payment) => payment.method).join(", ")}</span> : null}
                    </div>
                  </td>
                  <td>{bill.settledAt ? formatPosDateTime(bill.settledAt) : "Not settled"}</td>
                  <td className="action-cell">
                    <div className="history-actions">
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={historyReprint.isPending}
                        onClick={() => setHistoryPrintBillId(bill.billId)}
                      >
                        {historyReprint.isPending ? "Printing..." : "Print"}
                      </button>
                      {bill.status === "paid" || bill.isNc ? (
                        <button type="button" className="secondary-button compact" onClick={() => openHistoryEdit(bill)}>
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!bills.length ? <p className="plain-state">No bills recorded yet.</p> : null}
          {bills.length > billLimit ? (
            <button type="button" className="load-more-button compact" onClick={() => setBillLimit((limit) => limit + DETAIL_PAGE_SIZE)}>
              Load more bills
            </button>
          ) : null}
        </div>
      </section>

      {editingBill ? (
        <Dialog open onOpenChange={(open) => { if (!open) setEditingBill(null); }} title={`Edit Bill #${editingBill.billNumber ?? editingBill.billId}`} size="wide">
          <div className="history-edit-modal">
            <div className="history-edit-summary" aria-label="Edited bill summary">
              <div>
                <span>Subtotal</span>
                <strong>{formatInr(editTotal)}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>{formatInr(editDiscountPaise)}</strong>
              </div>
              <div>
                <span>Tip</span>
                <strong>{formatInr(editTipPaise)}</strong>
              </div>
              <div className="final">
                <span>Final total</span>
                <strong>{formatInr(editFinalTotal)}</strong>
              </div>
            </div>
            <div className="history-edit-workbench">
              <section className="history-edit-money">
                <div className="mini-title">
                  <strong>Money</strong>
                  <span>Payment total {formatInr(editPaymentTotalPaise)}</span>
                </div>
                <div className="adjust-grid">
                  <label>
                    Discount
                    <span className="split-input">
                      <select value={editDiscountType} onChange={(event) => setEditDiscountType(event.target.value as "amount" | "percent")}>
                        <option value="amount">Rs</option>
                        <option value="percent">%</option>
                      </select>
                      <input aria-label="History discount amount" value={editDiscount} onChange={(event) => setEditDiscount(event.target.value)} inputMode="decimal" />
                    </span>
                  </label>
                  <label>
                    Tip
                    <input aria-label="History tip amount" value={editTip} onChange={(event) => setEditTip(event.target.value)} inputMode="decimal" />
                  </label>
                </div>
                {!editingBill.isNc ? (
                  <>
                    <div className="quick-payments history-payment-actions">
                      {PAYMENT_METHODS.map((method) => (
                        <button key={method} type="button" onClick={() => fillHistoryPaymentFull(method)}>
                          Full {PAYMENT_METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>
                    <div className="payment-grid history-payment-grid">
                      {PAYMENT_METHODS.map((method) => (
                        <label key={method}>
                          <span>{PAYMENT_METHOD_LABELS[method]}</span>
                          <div className="payment-field-row">
                            <input
                              aria-label={`History ${PAYMENT_METHOD_LABELS[method]} amount`}
                              value={editPayments[method]}
                              onFocus={() => fillHistoryPaymentRemainingOnFocus(method)}
                              onChange={(event) => setEditPayments((current) => ({ ...current, [method]: event.target.value }))}
                              inputMode="decimal"
                            />
                            <button type="button" className="secondary-button compact rest-button" onClick={() => fillHistoryPaymentRemaining(method)} aria-label={`Fill remaining into history ${method}`}>
                              Rest
                            </button>
                          </div>
                        </label>
                      ))}
                    </div>
                    <label>
                      Payment note
                      <input value={editPaymentReference} onChange={(event) => setEditPaymentReference(event.target.value)} placeholder="UPI ref, card slip, or owner note" />
                    </label>
                    <div className={`history-money-status ${historyPaymentExact ? "good" : "bad"}`}>
                      <span>Payment total <b>{formatInr(editPaymentTotalPaise)}</b></span>
                      <strong>
                        {historyPaymentExact
                          ? "Payment exact"
                          : editPaymentRemainingPaise > 0
                            ? `${formatInr(editPaymentRemainingPaise)} remaining`
                            : `${formatInr(editPaymentOverPaise)} over`}
                      </strong>
                    </div>
                  </>
                ) : (
                  <p className="plain-state">NC bills do not carry collected payment rows.</p>
                )}
              </section>
              <section className="history-edit-items-panel">
                <div className="mini-title">
                  <strong>Items</strong>
                  <span>{editItems.filter((item) => item.quantity > 0).length} active lines</span>
                </div>
                <div className="history-edit-items">
                  {editItems.map((item) => (
                    <div key={item.key} className="history-edit-row">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{formatInr(item.unitPricePaise)} each</span>
                      </div>
                      <div className="history-edit-qty">
                        <button type="button" className="secondary-button compact" onClick={() => updateEditQty(item.key, -1)}>-</button>
                        <strong>{item.quantity}</strong>
                        <button type="button" className="secondary-button compact" onClick={() => updateEditQty(item.key, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                  {!editItems.length ? <p className="plain-state">No items left. Add at least one item before saving.</p> : null}
                </div>
                <label>
                  Search item to add
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={historySearchKeyboard.onKeyDown}
                    placeholder="Type dish or liquor name"
                  />
                </label>
                {searchedMenu.length ? (
                  <div className="history-edit-search">
                    {searchedMenu.map((item, index) => {
                      const variants = (item.variants ?? []).filter((variant) => variant.active && variant.kind !== "default");
                      return (
                        <div
                          key={item.id}
                          className={`history-edit-search-row${historySearchKeyboard.activeIndex === index ? " keyboard-active" : ""}`}
                          onMouseEnter={() => historySearchKeyboard.setActiveIndex(index)}
                        >
                          <strong>{item.name}</strong>
                          <div className="history-edit-actions">
                            {variants.length ? (
                              variants.map((variant) => (
                                <button type="button" className="secondary-button compact" key={variant.id} onClick={() => addMenuItem(item, variant)}>
                                  {variant.label} {formatInr(variant.price_paise)}
                                </button>
                              ))
                            ) : (
                              <button type="button" className="secondary-button compact" onClick={() => addMenuItem(item)}>
                                + {formatInr(item.price_paise)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            </div>
            <label>
              Master PIN
              <input value={masterPin} onChange={(event) => setMasterPin(event.target.value)} type="password" autoComplete="current-password" />
            </label>
            {editError ? <p className="warning-text">{editError}</p> : null}
            <div className="history-edit-footer">
              <button type="button" className="secondary-button" onClick={() => setEditingBill(null)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!canSaveEdit} onClick={() => setHistoryEditPrintBill(editingBill)}>
                {historyEdit.isPending ? "Saving..." : "Save + Print"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      <BillPrinterChooser
        open={Boolean(historyPrintBillId)}
        title="Print bill where?"
        busy={historyReprint.isPending}
        onClose={() => setHistoryPrintBillId(null)}
        onChoose={(printerSlot) => {
          if (!historyPrintBillId) return;
          const billId = historyPrintBillId;
          setHistoryPrintBillId(null);
          historyReprint.mutate({ billId, printerSlot });
        }}
      />
      <BillPrinterChooser
        open={Boolean(historyEditPrintBill)}
        title="Print edited bill where?"
        busy={historyEdit.isPending}
        onClose={() => setHistoryEditPrintBill(null)}
        onChoose={(printerSlot) => {
          if (!historyEditPrintBill) return;
          const bill = historyEditPrintBill;
          setHistoryEditPrintBill(null);
          historyEdit.mutate({ bill, printerSlot });
        }}
      />

      <section className="report-detail-card item-summary-panel">
        <div className="mini-title">
          <strong>Item summary</strong>
          <span>{items.length} items</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table item-summary-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Group</th>
                <th>Sold</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, itemLimit).map((item) => (
                <tr key={item.menuItemId}>
                  <td className="strong-cell">{item.name}</td>
                  <td>{item.saleGroupName}</td>
                  <td>{item.quantity}</td>
                  <td>{formatInr(item.grossSalesPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <p className="plain-state">No item totals yet.</p> : null}
          {items.length > itemLimit ? (
            <button type="button" className="load-more-button compact" onClick={() => setItemLimit((limit) => limit + DETAIL_PAGE_SIZE)}>
              Load more items
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReportTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="report-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((cell, index) => (
                <td key={`${cell}-${index}`} className={index === 0 ? "strong-cell" : ""}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getPaymentTotals(summary: CloseSummary | DailyReportDetail, bills: NonNullable<CloseSummary["billSummaries"]>) {
  if ("totalPaymentsPaise" in summary) {
    return {
      cash: summary.cashPaymentsPaise,
      upi: summary.upiPaymentsPaise,
      card: summary.cardPaymentsPaise,
      online: summary.onlinePaymentsPaise,
      total: summary.totalPaymentsPaise,
    };
  }
  const totals = { cash: 0, upi: 0, card: 0, online: 0, total: 0 };
  for (const bill of bills) {
    for (const payment of bill.payments) {
      if (payment.method === "cash") totals.cash += payment.amountPaise;
      if (payment.method === "upi") totals.upi += payment.amountPaise;
      if (payment.method === "card") totals.card += payment.amountPaise;
      if (payment.method === "online") totals.online += payment.amountPaise;
      totals.total += payment.amountPaise;
    }
  }
  return totals;
}
