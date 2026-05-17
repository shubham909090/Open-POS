import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { formatPosDateTime } from "@gaurav-pos/shared";

import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubOrder } from "../lib/hub-client";
import { getBillingHistoryViewModel } from "../lib/billing-history";
import { amountInputToPaise, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import type { PaymentMethod } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { EmptyState, LabeledMoneyInput, SummaryBox, UncontrolledInput } from "./app-shell";

function CaptainBillingPanel({
  canBill,
  currentOrder,
  hasNewItems,
  sending,
  onGenerateBill,
  onReprintBill,
  onMarkNc,
  onReviseBill,
  onSettleBill
}: {
  canBill: boolean;
  currentOrder: HubOrder | null;
  hasNewItems: boolean;
  sending: boolean;
  onGenerateBill: () => void;
  onReprintBill: (pin: string, reason: string) => void;
  onMarkNc: (pin: string, reason: string) => void;
  onReviseBill: (pin: string, reason: string) => void;
  onSettleBill: (input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{ method: PaymentMethod; amountPaise: number; reference?: string }>;
  }) => void;
}) {
  const bill = currentOrder?.bill ?? null;
  const payments = currentOrder?.payments ?? [];
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [tipValue, setTipValue] = useState("0");
  const [reference, setReference] = useState("");
  const [paymentInputs, setPaymentInputs] = useState<Record<PaymentMethod, string>>({ cash: "0", upi: "0", card: "0", online: "0" });
  const [managerPin, setManagerPin] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [approvalAction, setApprovalAction] = useState<"reprint" | "nc" | "revise" | null>(null);

  useEffect(() => {
    if (!bill) return;
    setDiscountType("amount");
    setDiscountValue(paiseToRupeeInput(bill.discount_paise ?? 0));
    setTipValue(paiseToRupeeInput(bill.tip_paise ?? 0));
    setPaymentInputs({ cash: "0", upi: "0", card: "0", online: "0" });
    setApprovalAction(null);
    setManagerPin("");
    setManagerReason("");
  }, [bill?.id]);

  if (!canBill) return null;

  const existingPaidPaise = bill?.paid_paise ?? payments.reduce((total, payment) => total + payment.amount_paise, 0);
  const rawDiscount = Math.max(0, Number(discountValue || 0));
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(rawDiscount, 100)) / 100)
      : Math.round(rawDiscount * 100)
    : 0;
  const tipPaise = Math.round(Math.max(0, Number(tipValue || 0)) * 100);
  const finalTotalPaise = bill ? Math.max(0, bill.total_paise - discountPaise + tipPaise) : 0;
  const balancePaise = Math.max(0, finalTotalPaise - existingPaidPaise);
  const newPaymentPaise = (["cash", "upi", "card", "online"] as PaymentMethod[]).reduce((total, method) => total + amountInputToPaise(paymentInputs[method]), 0);
  const remainingPaise = balancePaise - newPaymentPaise;
  const canPunch = Boolean(bill && newPaymentPaise > 0 && remainingPaise === 0 && !sending);
  const hasApproval = managerPin.trim().length > 0 && managerReason.trim().length > 0;
  const approvalTitle = approvalAction === "reprint" ? "Reprint Bill" : approvalAction === "nc" ? "NC Bill" : "Revise Bill";

  const fillFullPayment = (method: PaymentMethod) => {
    setPaymentInputs({
      cash: method === "cash" ? paiseToRupeeInput(balancePaise) : "0",
      upi: method === "upi" ? paiseToRupeeInput(balancePaise) : "0",
      card: method === "card" ? paiseToRupeeInput(balancePaise) : "0",
      online: method === "online" ? paiseToRupeeInput(balancePaise) : "0"
    });
  };
  const selectApprovalAction = (action: "reprint" | "nc" | "revise") => {
    setApprovalAction(approvalAction === action ? null : action);
    setManagerPin("");
    setManagerReason("");
  };
  const confirmApprovalAction = () => {
    if (!approvalAction) return;
    const pin = managerPin.trim();
    const reason = managerReason.trim();
    if (!pin || !reason) return;
    if (approvalAction === "reprint") onReprintBill(pin, reason);
    if (approvalAction === "nc") onMarkNc(pin, reason);
    if (approvalAction === "revise") onReviseBill(pin, reason);
    setApprovalAction(null);
    setManagerPin("");
    setManagerReason("");
  };

  return (
    <View style={styles.billingStack}>
      <View>
        <Text style={styles.actionTitle}>Captain Actions</Text>
        <Text style={styles.actionMeta}>Settle the selected table. History is in its own tab.</Text>
      </View>

      {!currentOrder?.order ? (
        <Text style={styles.smallMuted}>Send items for this table before billing.</Text>
      ) : !bill ? (
        <Pressable style={[styles.primaryButton, styles.heroSendButton, sending && styles.buttonDisabled]} disabled={sending} onPress={onGenerateBill}>
          <Text style={styles.primaryButtonText}>{sending ? "Working..." : "Generate and Print Bill"}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.billTotals}>
            <Text style={styles.sentName}>Bill {bill.revision_number ? `rev ${bill.revision_number}` : ""}</Text>
            <Text style={styles.muted}>Items Rs {formatRupees(bill.total_paise)}</Text>
            <Text style={styles.muted}>Already paid Rs {formatRupees(existingPaidPaise)}</Text>
            <Text style={[styles.totalText, { fontSize: 20 }]}>Balance Rs {formatRupees(balancePaise)}</Text>
          </View>

          <View style={styles.buttonStack}>
            <Pressable
              style={[styles.primaryButton, styles.heroSendButton, !canPunch && styles.buttonDisabled]}
              disabled={!canPunch}
              onPress={() =>
                onSettleBill({
                  discountType,
                  discountValue: discountType === "percent" ? rawDiscount : discountPaise,
                  tipPaise,
                  payments: (["cash", "upi", "card", "online"] as PaymentMethod[])
                    .map((method) => ({ method, amountPaise: amountInputToPaise(paymentInputs[method]), reference: reference.trim() || undefined }))
                    .filter((payment) => payment.amountPaise > 0)
                })
              }
            >
              <Text style={styles.primaryButtonText}>Punch Bill</Text>
            </Pressable>
          </View>

          <View style={styles.quickPayGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map((method) => (
              <Pressable key={method} style={styles.quickPayButton} onPress={() => fillFullPayment(method)}>
                <Text style={styles.quickPayText}>Full {method.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.segmentedRow}>
            <Pressable style={[styles.segmentButton, discountType === "amount" && styles.segmentButtonActive]} onPress={() => setDiscountType("amount")}>
              <Text style={[styles.segmentText, discountType === "amount" && styles.segmentTextActive]}>Rs off</Text>
            </Pressable>
            <Pressable style={[styles.segmentButton, discountType === "percent" && styles.segmentButtonActive]} onPress={() => setDiscountType("percent")}>
              <Text style={[styles.segmentText, discountType === "percent" && styles.segmentTextActive]}>% off</Text>
            </Pressable>
          </View>

          <View style={styles.paymentGrid}>
            <LabeledMoneyInput label="Discount" value={discountValue} onChange={setDiscountValue} />
            <LabeledMoneyInput label="Tip" value={tipValue} onChange={setTipValue} />
          </View>

          <View style={styles.paymentGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map((method) => (
              <LabeledMoneyInput
                key={method}
                label={method.toUpperCase()}
                value={paymentInputs[method]}
                onChange={(value) => setPaymentInputs((current) => ({ ...current, [method]: value }))}
              />
            ))}
          </View>
          <UncontrolledInput
            inputKey={`payment-reference-${bill.id}`}
            label="Reference"
            defaultValue={reference}
            onChangeText={setReference}
            placeholder="UPI/card note, optional"
            returnKeyType="done"
          />
          <Text style={[styles.smallMuted, remainingPaise < 0 && styles.dangerText]}>
            {remainingPaise === 0 ? "Payment covers the bill." : remainingPaise > 0 ? `Still pending Rs ${formatRupees(remainingPaise)}` : `Over by Rs ${formatRupees(Math.abs(remainingPaise))}`}
          </Text>

          <View style={styles.quickPayGrid}>
            <Pressable style={[styles.secondaryButton, approvalAction === "reprint" && styles.approvalActionActive, sending && styles.buttonDisabled]} disabled={sending} onPress={() => selectApprovalAction("reprint")}>
              <Text style={styles.secondaryButtonText}>Reprint</Text>
            </Pressable>
            <Pressable style={[styles.dangerButton, approvalAction === "nc" && styles.approvalDangerActive, sending && styles.buttonDisabled]} disabled={sending} onPress={() => selectApprovalAction("nc")}>
              <Text style={styles.dangerButtonText}>NC Bill</Text>
            </Pressable>
            <Pressable style={[styles.secondaryButton, approvalAction === "revise" && styles.approvalActionActive, (!hasNewItems || sending) && styles.buttonDisabled]} disabled={!hasNewItems || sending} onPress={() => selectApprovalAction("revise")}>
              <Text style={styles.secondaryButtonText}>Revise</Text>
            </Pressable>
          </View>

          <Modal visible={Boolean(approvalAction)} transparent animationType="fade" onRequestClose={() => setApprovalAction(null)}>
            <View style={styles.popupBackdrop}>
              <View style={styles.popupCard}>
                <View>
                  <Text style={styles.actionTitle}>{approvalTitle}</Text>
                  <Text style={styles.actionMeta}>Manager PIN and reason required.</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={managerPin}
                  onChangeText={setManagerPin}
                  secureTextEntry
                  keyboardType="number-pad"
                  placeholder="Manager PIN"
                  placeholderTextColor={palette.muted}
                />
                <TextInput
                  style={styles.input}
                  value={managerReason}
                  onChangeText={setManagerReason}
                  placeholder={`Reason for ${approvalTitle.toLowerCase()}`}
                  placeholderTextColor={palette.muted}
                />
                <View style={styles.sendButtonRow}>
                  <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={() => setApprovalAction(null)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[approvalAction === "nc" ? styles.dangerButton : styles.primaryButton, styles.sendButton, (!hasApproval || sending) && styles.buttonDisabled]}
                    disabled={!hasApproval || sending}
                    onPress={confirmApprovalAction}
                  >
                    <Text style={approvalAction === "nc" ? styles.dangerButtonText : styles.primaryButtonText}>{approvalTitle}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

function BillingHistoryPanel({
  currentSummary,
  dailyReports,
  selectedHistoryDayId,
  selectedHistoryDetail,
  menuItems,
  sending,
  onHistoryPrint,
  onHistoryEdit,
  onSelectHistoryDay
}: {
  currentSummary: CurrentDaySummary | null;
  dailyReports: DailyReportRow[];
  selectedHistoryDayId: string | null;
  selectedHistoryDetail: DailyReportDetail | null;
  menuItems: HubBootstrap["menuItems"];
  sending: boolean;
  onHistoryPrint: (billId: string) => void;
  onHistoryEdit: (billId: string, items: HistoryEditPayloadItem[], masterPin: string) => Promise<boolean> | boolean;
  onSelectHistoryDay: (posDayId: string | null) => void;
}) {
  const history = getBillingHistoryViewModel(currentSummary, selectedHistoryDayId, selectedHistoryDetail);
  const [editingBill, setEditingBill] = useState<NonNullable<CurrentDaySummary["billSummaries"]>[number] | null>(null);
  const [editItems, setEditItems] = useState<HistoryEditItem[]>([]);
  const [search, setSearch] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const searchedMenu = search.trim()
    ? menuItems.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];
  const editTotal = editItems.reduce((total, item) => total + Math.max(0, item.quantity) * item.unitPricePaise, 0);
  const canSaveEdit = Boolean(editingBill && masterPin.trim().length >= 4 && editItems.some((item) => item.quantity > 0) && !sending);

  const openHistoryEdit = (bill: NonNullable<CurrentDaySummary["billSummaries"]>[number]) => {
    setEditingBill(bill);
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
        unitPricePaise: item.unitPricePaise
      }))
    );
  };

  const changeEditQty = (key: string, delta: number) => {
    setEditItems((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.orderItemId || item.quantity > 0)
    );
  };

  const addHistoryMenuItem = (item: HubBootstrap["menuItems"][number], variant?: NonNullable<HubBootstrap["menuItems"][number]["variants"]>[number]) => {
    const variantId = variant?.id ?? item.variants?.find((candidate) => candidate.kind === "default" && candidate.active)?.id ?? undefined;
    const price = variant?.price_paise ?? item.variants?.find((candidate) => candidate.id === variantId)?.price_paise ?? item.price_paise;
    const name = variant && variant.kind !== "default" ? `${item.name} ${variant.label}` : item.name;
    const key = `new-${item.id}-${variantId ?? "default"}`;
    setEditItems((current) => {
      const existing = current.find((entry) => entry.key === key || (!entry.orderItemId && entry.menuItemId === item.id && entry.menuItemVariantId === variantId));
      if (existing) return current.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry));
      return [
        ...current,
        {
          key,
          menuItemId: item.id,
          menuItemVariantId: variantId,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name,
          quantity: 1,
          unitPricePaise: price
        }
      ];
    });
  };

  const saveHistoryEdit = async () => {
    if (!editingBill || !canSaveEdit) return;
    const saved = await onHistoryEdit(
      editingBill.billId,
      editItems
        .filter((item) => item.quantity > 0)
        .map((item) =>
          item.menuItemId
            ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId ?? undefined, quantity: item.quantity }
            : { orderItemId: item.orderItemId, openName: item.name, openPricePaise: item.unitPricePaise, saleGroupId: item.saleGroupId ?? "sg-food", productionUnitId: item.productionUnitId ?? null, quantity: item.quantity }
        ),
      masterPin.trim()
    );
    if (saved !== false) setEditingBill(null);
  };

  return (
    <View style={[styles.panel, styles.historyScreenPanel]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Billing History</Text>
          <Text style={styles.muted}>{history.label} · {history.bills.length} bills</Text>
        </View>
      </View>

      {history.metrics.length ? (
        <View style={styles.summaryGrid}>
          {history.metrics.map((metric) => (
            <SummaryBox
              key={metric.label}
              label={metric.label}
              value={"valuePaise" in metric ? `Rs ${formatRupees(metric.valuePaise)}` : metric.value}
            />
          ))}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyDayChips}>
        <Pressable
          style={[styles.filterChip, !selectedHistoryDayId && styles.filterChipActive]}
          onPress={() => onSelectHistoryDay(null)}
        >
          <Text style={[styles.filterChipText, !selectedHistoryDayId && styles.filterChipTextActive]}>Today</Text>
        </Pressable>
        {dailyReports.map((report) => (
          <Pressable
            key={report.pos_day_id}
            style={[styles.filterChip, selectedHistoryDayId === report.pos_day_id && styles.filterChipActive]}
            onPress={() => onSelectHistoryDay(report.pos_day_id)}
          >
            <Text style={[styles.filterChipText, selectedHistoryDayId === report.pos_day_id && styles.filterChipTextActive]}>{report.business_date}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.historyBox}>
        {history.bills.length === 0 ? (
          <EmptyState title="No bills found" text="Pick another day or settle the first bill." compact />
        ) : (
          history.bills.map((historyBill) => {
            const preview = historyBill.items?.length
              ? historyBill.items.slice(0, 3).map((item) => `${item.quantity} x ${item.name}`).join(", ")
              : "No item details";
            return (
              <View key={historyBill.billId} style={styles.historyRow}>
                <View style={styles.flexText}>
                  <View style={styles.historyRowHeader}>
                    <Text style={styles.historyBillTitle}>Bill #{historyBill.billNumber ?? historyBill.billId}</Text>
                    <Text style={styles.historyAmount}>Rs {formatRupees(historyBill.finalTotalPaise)}</Text>
                  </View>
                  {historyBill.modified ? <Text style={styles.historyModifiedTag}>Modified</Text> : null}
                  <Text style={styles.historyMeta}>Table {historyBill.tableName} · paid Rs {formatRupees(historyBill.paidPaise)}</Text>
                  <Text style={styles.muted} numberOfLines={2}>{preview}</Text>
                  <Text style={styles.smallMuted}>
                    Subtotal Rs {formatRupees(historyBill.subtotalPaise ?? Math.max(0, historyBill.totalPaise - (historyBill.taxPaise ?? 0)))} · tax Rs {formatRupees(historyBill.taxPaise ?? 0)}
                    {historyBill.settledAt ? ` · ${formatPosDateTime(historyBill.settledAt)}` : ""}
                  </Text>
                </View>
                <View style={styles.historyActionStack}>
                  <Pressable style={[styles.secondaryButton, styles.historyPrintButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onHistoryPrint(historyBill.billId)}>
                    <Text style={styles.secondaryButtonText}>Print</Text>
                  </Pressable>
                  {historyBill.status === "paid" || historyBill.isNc ? (
                    <Pressable style={[styles.secondaryButton, styles.historyPrintButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => openHistoryEdit(historyBill)}>
                      <Text style={styles.secondaryButtonText}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
      <Modal visible={Boolean(editingBill)} transparent animationType="fade" onRequestClose={() => setEditingBill(null)}>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.sectionTitle}>Edit bill #{editingBill?.billNumber ?? editingBill?.billId}</Text>
                <Text style={styles.muted}>Rs {formatRupees(editTotal)} edited total · full bill prints</Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => setEditingBill(null)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.popupScroll} contentContainerStyle={styles.historyEditStack}>
              {editItems.map((item) => (
                <View key={item.key} style={styles.historyEditLine}>
                  <View style={styles.flexText}>
                    <Text style={styles.sentName}>{item.name}</Text>
                    <Text style={styles.muted}>Rs {formatRupees(item.unitPricePaise)} each</Text>
                  </View>
                  <Pressable style={styles.qtyButton} onPress={() => changeEditQty(item.key, -1)}>
                    <Text style={styles.qtyText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <Pressable style={styles.qtyButton} onPress={() => changeEditQty(item.key, 1)}>
                    <Text style={styles.qtyText}>+</Text>
                  </Pressable>
                </View>
              ))}
              <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search item to add" placeholderTextColor={palette.muted} />
              {searchedMenu.map((item) => {
                const variants = (item.variants ?? []).filter((variant) => variant.active && variant.kind !== "default");
                return (
                  <View key={item.id} style={styles.historyEditLine}>
                    <Text style={[styles.sentName, styles.flexText]} numberOfLines={1}>{item.name}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyVariantActions}>
                      {variants.length ? variants.map((variant) => (
                        <Pressable key={variant.id} style={styles.secondaryButton} onPress={() => addHistoryMenuItem(item, variant)}>
                          <Text style={styles.secondaryButtonText}>{variant.label} Rs {formatRupees(variant.price_paise)}</Text>
                        </Pressable>
                      )) : (
                        <Pressable style={styles.secondaryButton} onPress={() => addHistoryMenuItem(item)}>
                          <Text style={styles.secondaryButtonText}>+ Rs {formatRupees(item.price_paise)}</Text>
                        </Pressable>
                      )}
                    </ScrollView>
                  </View>
                );
              })}
              <TextInput style={styles.input} value={masterPin} onChangeText={setMasterPin} secureTextEntry placeholder="Master PIN" placeholderTextColor={palette.muted} />
              <Pressable style={[styles.primaryButton, !canSaveEdit && styles.buttonDisabled]} disabled={!canSaveEdit} onPress={saveHistoryEdit}>
                <Text style={styles.primaryButtonText}>{sending ? "Saving..." : "Save + Print"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { BillingHistoryPanel, CaptainBillingPanel };

type HistoryEditPayloadItem =
  | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
  | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number };

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
