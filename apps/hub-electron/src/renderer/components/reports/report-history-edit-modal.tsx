import { type Dispatch, type KeyboardEventHandler, type SetStateAction, type PointerEvent } from "react";
import { formatInr } from "@gaurav-pos/shared";
import { type MenuItem } from "../../hub-api.js";
import { DiscountTypeControl, PaymentFields } from "../orders/payment-fields.js";
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
  setItemElement: (index: number, element: HTMLElement | null) => void;
  onPointerMove: (index: number, event: PointerEvent<HTMLElement>) => void;
};

function ReportHistoryEditModal({
  bill,
  editItems,
  editDiscountType,
  editDiscount,
  editTip,
  editPayments,
  editPaymentReference,
  editCustomerName,
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
  setEditCustomerName,
  setSearch,
  setMasterPin,
  onClose,
  onSave,
  onSavePrint,
  updateEditQty,
  addMenuItem,
  fillHistoryPaymentRemaining,
}: {
  bill: HistoryBill;
  editItems: HistoryEditItem[];
  editDiscountType: "amount" | "percent";
  editDiscount: string;
  editTip: string;
  editPayments: Record<HistoryPaymentMethod, string>;
  editPaymentReference: string;
  editCustomerName: string;
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
  setEditCustomerName: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setMasterPin: Dispatch<SetStateAction<string>>;
  onClose: () => void;
  onSave: () => void;
  onSavePrint: () => void;
  updateEditQty: (key: string, delta: number) => void;
  addMenuItem: (item: MenuItem, variant?: NonNullable<MenuItem["variants"]>[number]) => void;
  fillHistoryPaymentRemaining: (method: HistoryPaymentMethod) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={`Edit bill #${bill.billNumber ?? bill.billId}`} size="wide" className="history-edit-dialog">
      <div className="history-edit-modal">
        <div className="history-edit-summary" aria-label="Edited bill summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatInr(editTotal)}</strong>
          </div>
          {editDiscountPaise > 0 ? <div>
            <span>Discount</span>
            <strong>{formatInr(editDiscountPaise)}</strong>
          </div> : null}
          {editTipPaise > 0 ? <div>
            <span>Tip</span>
            <strong>{formatInr(editTipPaise)}</strong>
          </div> : null}
          <div className="final">
            <span>Final total</span>
            <strong>{formatInr(editFinalTotal)}</strong>
          </div>
        </div>
        <div className="history-edit-workbench">
          <section className="history-edit-money">
            <div className="mini-title">
              <strong>Payment and adjustments</strong>
            </div>
            <label>
              Bill name
              <input
                aria-label="History bill name"
                value={editCustomerName}
                onChange={(event) => setEditCustomerName(event.target.value.slice(0, 80))}
                placeholder="Customer name, optional"
              />
            </label>
            <div className="adjust-grid">
              <label>
                Discount
                <span className="split-input">
                  <DiscountTypeControl value={editDiscountType} onChange={setEditDiscountType} label="History discount type" />
                  <input aria-label="History discount amount" value={editDiscount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditDiscount(event.target.value)} inputMode="decimal" />
                </span>
              </label>
              <label>
                Tip
                <input aria-label="History tip amount" value={editTip} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditTip(event.target.value)} inputMode="decimal" />
              </label>
            </div>
            {!bill.isNc ? (
              <>
                <PaymentFields payments={editPayments} setPayments={setEditPayments} fillRemaining={fillHistoryPaymentRemaining} labelPrefix="History " />
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
                    <button type="button" className="secondary-button compact" aria-label={`Reduce ${item.name}`} onClick={() => updateEditQty(item.key, -1)}>−</button>
                    <strong>{item.quantity}</strong>
                    <button type="button" className="secondary-button compact" aria-label={`Add ${item.name}`} onClick={() => updateEditQty(item.key, 1)}>+</button>
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
                      ref={(element) => historySearchKeyboard.setItemElement(index, element)}
                      className={`history-edit-search-row${historySearchKeyboard.activeIndex === index ? " keyboard-active" : ""}`}
                      onPointerMove={(event) => historySearchKeyboard.onPointerMove(index, event)}
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
        {editError ? <p className="warning-text" role="alert">{editError}</p> : null}
        <div className="history-edit-footer">
          <label className="history-master-pin">
            Master PIN
            <input aria-label="Master PIN" data-autofocus value={masterPin} onChange={(event) => setMasterPin(event.target.value)} type="password" inputMode="numeric" autoComplete="current-password" />
          </label>

          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="secondary-button" disabled={!canSaveEdit} onClick={onSavePrint}>
            {historyEditPending ? "Saving..." : "Save + Print"}
          </button>
          <button type="button" className="primary-button" disabled={!canSaveEdit} onClick={onSave}>
            {historyEditPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export { PAYMENT_METHODS, ReportHistoryEditModal };
export type { HistoryEditItem, HistoryPaymentMethod };
