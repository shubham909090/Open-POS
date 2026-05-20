import { type Dispatch, type KeyboardEventHandler, type SetStateAction } from "react";
import { formatInr } from "@gaurav-pos/shared";
import { type MenuItem } from "../../hub-api.js";
import { Dialog } from "../ui/dialog.js";
import { type HistoryBill } from "./report-history-table.js";

const PAYMENT_METHODS = ["cash", "upi", "card", "online"] as const;
type HistoryPaymentMethod = (typeof PAYMENT_METHODS)[number];
const PAYMENT_METHOD_LABELS: Record<HistoryPaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online",
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

type HistorySearchKeyboard = {
  activeIndex: number;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  setActiveIndex: (index: number) => void;
};

function ReportHistoryEditModal({
  bill,
  editItems,
  editDiscountType,
  editDiscount,
  editTip,
  editPayments,
  editPaymentReference,
  search,
  masterPin,
  editError,
  searchedMenu,
  historySearchKeyboard,
  editTotal,
  editDiscountPaise,
  editTipPaise,
  editFinalTotal,
  editPaymentTotalPaise,
  editPaymentRemainingPaise,
  editPaymentOverPaise,
  historyPaymentExact,
  canSaveEdit,
  historyEditPending,
  setEditDiscountType,
  setEditDiscount,
  setEditTip,
  setEditPayments,
  setEditPaymentReference,
  setSearch,
  setMasterPin,
  onClose,
  onSavePrint,
  updateEditQty,
  addMenuItem,
  fillHistoryPaymentFull,
  fillHistoryPaymentRemaining,
  fillHistoryPaymentRemainingOnFocus,
}: {
  bill: HistoryBill;
  editItems: HistoryEditItem[];
  editDiscountType: "amount" | "percent";
  editDiscount: string;
  editTip: string;
  editPayments: Record<HistoryPaymentMethod, string>;
  editPaymentReference: string;
  search: string;
  masterPin: string;
  editError: string | null;
  searchedMenu: MenuItem[];
  historySearchKeyboard: HistorySearchKeyboard;
  editTotal: number;
  editDiscountPaise: number;
  editTipPaise: number;
  editFinalTotal: number;
  editPaymentTotalPaise: number;
  editPaymentRemainingPaise: number;
  editPaymentOverPaise: number;
  historyPaymentExact: boolean;
  canSaveEdit: boolean;
  historyEditPending: boolean;
  setEditDiscountType: Dispatch<SetStateAction<"amount" | "percent">>;
  setEditDiscount: Dispatch<SetStateAction<string>>;
  setEditTip: Dispatch<SetStateAction<string>>;
  setEditPayments: Dispatch<SetStateAction<Record<HistoryPaymentMethod, string>>>;
  setEditPaymentReference: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setMasterPin: Dispatch<SetStateAction<string>>;
  onClose: () => void;
  onSavePrint: () => void;
  updateEditQty: (key: string, delta: number) => void;
  addMenuItem: (item: MenuItem, variant?: NonNullable<MenuItem["variants"]>[number]) => void;
  fillHistoryPaymentFull: (method: HistoryPaymentMethod) => void;
  fillHistoryPaymentRemaining: (method: HistoryPaymentMethod) => void;
  fillHistoryPaymentRemainingOnFocus: (method: HistoryPaymentMethod) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={`Edit Bill #${bill.billNumber ?? bill.billId}`} size="wide">
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
            {!bill.isNc ? (
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
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={historySearchKeyboard.onKeyDown} placeholder="Type dish or liquor name" />
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
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" disabled={!canSaveEdit} onClick={onSavePrint}>
            {historyEditPending ? "Saving..." : "Save + Print"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export { PAYMENT_METHODS, ReportHistoryEditModal };
export type { HistoryEditItem, HistoryPaymentMethod };
