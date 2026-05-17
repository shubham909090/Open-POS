import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type CloseSummary, type DailyReportDetail, type MenuItem } from "../../hub-api.js";
import { alcoholMovementSourceLabel, alcoholMovementDeltaText } from "../../lib/format.js";
import { Dialog } from "../ui/dialog.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";

const REPORT_PAGE_SIZE = 8;
const DETAIL_PAGE_SIZE = 6;
type HistoryBill = NonNullable<CloseSummary["billSummaries"]>[number];
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
  const [search, setSearch] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: hubApi.bootstrap });
  const historyReprint = useMutation({
    mutationFn: (billId: string) => hubApi.historyReprintBill(billId, `history-reprint-${billId}-${Date.now()}`)
  });
  const historyEdit = useMutation({
    mutationFn: (bill: HistoryBill) =>
      hubApi.historyEditBill(
        bill.billId,
        {
          masterApproval: { pin: masterPin, reason: "Owner history edit", approvedBy: "owner" },
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
        `history-edit-${bill.billId}-${Date.now()}`
      ),
    onSuccess: async () => {
      setEditingBill(null);
      setEditItems([]);
      setSearch("");
      setMasterPin("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["currentBusinessDaySummary"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReports"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReport"] }),
      ]);
    },
    onError: (error) => setEditError(error instanceof Error ? error.message : "Could not edit history bill."),
  });
  const bills = summary.billSummaries ?? [];
  const groups = summary.groupSummaries ?? [];
  const items = summary.itemSummaries ?? [];
  const payments = getPaymentTotals(summary, bills);
  const menuItems = bootstrap.data?.menuItems.filter((item) => item.active) ?? [];
  const searchedMenu = search.trim()
    ? menuItems
        .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 6)
    : [];
  const editTotal = editItems.reduce((total, item) => total + Math.max(0, item.quantity) * item.unitPricePaise, 0);
  const canSaveEdit = Boolean(editingBill && masterPin.trim().length >= 4 && editItems.some((item) => item.quantity > 0) && !historyEdit.isPending);
  const openHistoryEdit = (bill: HistoryBill) => {
    setEditingBill(bill);
    setEditError(null);
    setMasterPin("");
    setSearch("");
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
  const addMenuItem = (item: MenuItem, variant?: NonNullable<MenuItem["variants"]>[number]) => {
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
                    {bill.modified ? <small>Modified</small> : bill.revisionNumber ? <small>rev {bill.revisionNumber}</small> : null}
                    {bill.isNc ? <small>NC</small> : null}
                  </td>
                  <td>{bill.tableName}</td>
                  <td><span className={`bill-status ${bill.status}`}>{bill.status}</span></td>
                  <td className="wrap-cell">{bill.items?.length ? bill.items.map((item) => `${item.quantity} x ${item.name}`).join(", ") : "No item detail"}</td>
                  <td>{formatInr(bill.finalTotalPaise)}</td>
                  <td>{formatInr(bill.paidPaise)}</td>
                  <td className="wrap-cell">
                    Subtotal {formatInr(bill.subtotalPaise ?? Math.max(0, bill.totalPaise - (bill.taxPaise ?? 0)))} · tax {formatInr(bill.taxPaise ?? 0)} · discount {formatInr(bill.discountPaise)} · tip {formatInr(bill.tipPaise)}
                    {bill.payments.length ? ` · ${bill.payments.map((payment) => payment.method).join(", ")}` : ""}
                  </td>
                  <td>{bill.settledAt ? formatPosDateTime(bill.settledAt) : "Not settled"}</td>
                  <td className="action-cell">
                    <div className="history-actions">
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={historyReprint.isPending}
                        onClick={() => historyReprint.mutate(bill.billId)}
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
        <Dialog open onOpenChange={(open) => { if (!open) setEditingBill(null); }} title={`Edit Bill #${editingBill.billNumber ?? editingBill.billId}`} danger>
          <div className="history-edit-modal">
            <div className="mini-title">
              <strong>{formatInr(editTotal)} edited total</strong>
              <span>Full updated bill prints after save</span>
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
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type dish or liquor name" />
            </label>
            {searchedMenu.length ? (
              <div className="history-edit-search">
                {searchedMenu.map((item) => {
                  const variants = (item.variants ?? []).filter((variant) => variant.active && variant.kind !== "default");
                  return (
                    <div key={item.id} className="history-edit-search-row">
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
            <label>
              Master PIN
              <input value={masterPin} onChange={(event) => setMasterPin(event.target.value)} type="password" autoComplete="current-password" />
            </label>
            {editError ? <p className="warning-text">{editError}</p> : null}
            <div className="history-edit-footer">
              <button type="button" className="secondary-button" onClick={() => setEditingBill(null)}>Cancel</button>
              <button type="button" className="danger-button" disabled={!canSaveEdit} onClick={() => historyEdit.mutate(editingBill)}>
                {historyEdit.isPending ? "Saving..." : "Save + Print"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

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
