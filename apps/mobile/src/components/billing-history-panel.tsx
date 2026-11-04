import { FormModal } from "./form-modal";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Pressable } from "./pressable";
import { formatPosDateTime, type HistoryEditBillInput, type HistoryEditSaveMode, type PaymentMethod } from "@gaurav-pos/shared";

import { getBillingHistoryViewModel } from "../lib/billing-history";
import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap } from "../lib/hub-client";
import { amountInputToPaise, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import { palette, styles } from "../styles/app-styles";
import { EmptyState, LabeledMoneyInput, SummaryBox } from "./app-shell";

function BillingHistoryPanel({
  currentSummary,
  dailyReports,
  selectedHistoryDayId,
  selectedHistoryDetail,
  menuItems,
  sending,
  actionMessage,
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
  actionMessage: string;
  onHistoryPrint: (billId: string) => void;
  onHistoryEdit: (billId: string, items: HistoryEditPayloadItem[], customerName: string, masterPin: string, saveMode: HistoryEditSaveMode, payments: HistoryEditBillInput["payments"]) => Promise<boolean> | boolean;
  onSelectHistoryDay: (posDayId: string | null) => void;
}) {
  const history = getBillingHistoryViewModel(currentSummary, selectedHistoryDayId, selectedHistoryDetail);
  const [editingBill, setEditingBill] = useState<NonNullable<CurrentDaySummary["billSummaries"]>[number] | null>(null);
  const [editItems, setEditItems] = useState<HistoryEditItem[]>([]);
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [editPayments, setEditPayments] = useState<Array<{ method: PaymentMethod; amount: string; reference?: string }>>([]);
  const searchedMenu = search.trim()
    ? menuItems.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];
  const itemTotal = editItems.reduce((total, item) => total + Math.max(0, item.quantity) * item.unitPricePaise, 0);
  const editTotal = Math.max(0, itemTotal - (editingBill?.discountPaise ?? 0) + (editingBill?.tipPaise ?? 0));
  const paymentTotal = editPayments.reduce((total, payment) => total + amountInputToPaise(payment.amount), 0);
  const paymentsMatch = editingBill?.isNc || paymentTotal === editTotal;
  const canSaveEdit = Boolean(editingBill && masterPin.trim().length >= 4 && editItems.some((item) => item.quantity > 0) && paymentsMatch && !sending);
  const closeHistoryEdit = () => { setEditingBill(null); setMasterPin(""); };

  const openHistoryEdit = (bill: NonNullable<CurrentDaySummary["billSummaries"]>[number]) => {
    setEditingBill(bill);
    setSaveFailed(false);
    setMasterPin("");
    setSearch("");
    setCustomerName(bill.customerName ?? "");
    setEditPayments(bill.isNc ? [] : bill.payments.map((payment) => ({ method: payment.method, amount: paiseToRupeeInput(payment.amountPaise), ...(payment.reference ? { reference: payment.reference } : {}) })));
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

  const saveHistoryEdit = async (saveMode: HistoryEditSaveMode) => {
    if (!editingBill || !canSaveEdit) return;
    const submittedPin = masterPin.trim();
    setMasterPin("");
    const saved = await onHistoryEdit(
      editingBill.billId,
      editItems
        .filter((item) => item.quantity > 0)
        .map((item) =>
          item.menuItemId
            ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId ?? undefined, quantity: item.quantity }
            : { orderItemId: item.orderItemId, openName: item.name, openPricePaise: item.unitPricePaise, saleGroupId: item.saleGroupId ?? "sg-food", productionUnitId: item.productionUnitId ?? null, quantity: item.quantity }
        ),
      customerName.trim(),
      submittedPin,
      saveMode,
      editPayments.map(({ amount, ...payment }) => ({ ...payment, amountPaise: amountInputToPaise(amount) })).filter((payment) => payment.amountPaise > 0),
    );
    if (saved !== false) setEditingBill(null);
    else setSaveFailed(true);
  };

  return (
    <View style={[styles.panel, styles.historyScreenPanel]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>{history.label}</Text>
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
          <View style={styles.historyEmpty}>
            <EmptyState title="No bills found" text="Pick another day or settle the first bill." compact />
          </View>
        ) : (
          history.bills.map((historyBill) => {
            const previewItems = historyBill.items?.length ? historyBill.items.slice(0, 6) : [];
            return (
              <View key={historyBill.billId} style={styles.historyRow}>
                <View style={styles.flexText}>
                  <View style={styles.historyRowHeader}>
                    <Text style={styles.historyBillTitle}>Bill #{historyBill.billNumber ?? historyBill.billId}</Text>
                    <Text style={styles.historyAmount}>Rs {formatRupees(historyBill.finalTotalPaise)}</Text>
                  </View>
                  <View style={styles.historyTagRow}>
                    <Text style={[styles.historyStatusTag, !historyBill.isNc && historyStatusTagStyle(historyBill.status)]}>{historyBill.isNc ? "NC" : historyStatusLabel(historyBill.status)}</Text>
                    {historyBill.modified ? <Text style={styles.historyModifiedTag}>Modified</Text> : null}
                  </View>
                  {historyBill.customerName ? <Text style={styles.historyMeta}>Name: {historyBill.customerName}</Text> : null}
                  <Text style={styles.historyMeta}>Table {historyBill.tableName} · paid Rs {formatRupees(historyBill.paidPaise)}</Text>
                  <View style={styles.historyItemLines}>
                    {previewItems.length ? (
                      previewItems.map((item) => <Text key={item.orderItemId ?? `${historyBill.billId}-${item.name}`} style={styles.muted}>{item.quantity} x {item.name}</Text>)
                    ) : (
                      <Text style={styles.muted}>No item details</Text>
                    )}
                  </View>
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

      <FormModal visible={Boolean(editingBill)} transparent animationType="fade" onRequestClose={closeHistoryEdit}>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.sectionTitle}>Edit bill #{editingBill?.billNumber ?? editingBill?.billId}</Text>
                <Text style={styles.muted}>Rs {formatRupees(editTotal)} edited total</Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={closeHistoryEdit}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.popupScroll} contentContainerStyle={styles.historyEditStack} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bill name</Text>
                <TextInput
                  style={styles.input}
                  value={customerName}
                  onChangeText={(value) => setCustomerName(value.slice(0, 80))}
                  placeholder="Customer name, optional"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="words"
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>
              {editItems.map((item) => (
                <View key={item.key} style={styles.historyEditLine}>
                  <View style={styles.flexText}>
                    <Text style={styles.sentName}>{item.name}</Text>
                    <Text style={styles.muted}>Rs {formatRupees(item.unitPricePaise)} each</Text>
                  </View>
                  <Pressable accessibilityLabel={`Decrease ${item.name} quantity`} style={styles.qtyButton} onPress={() => changeEditQty(item.key, -1)}>
                    <Text style={styles.qtyText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <Pressable accessibilityLabel={`Increase ${item.name} quantity`} style={styles.qtyButton} onPress={() => changeEditQty(item.key, 1)}>
                    <Text style={styles.qtyText}>+</Text>
                  </Pressable>
                </View>
              ))}
              <TextInput accessibilityLabel="Search item to add" style={styles.input} value={search} onChangeText={setSearch} placeholder="Search item to add" placeholderTextColor={palette.muted} />
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
              {!editingBill?.isNc ? (
                <View style={styles.billingStack}>
                  <Text style={styles.inputLabel}>Collected payments</Text>
                  <Text style={styles.smallMuted}>
                    Match the edited total to the amount actually collected. Existing references are kept.
                  </Text>
                  {editPayments.map((payment, index) => (
                    <View key={index} style={styles.historyPaymentRow}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                        {(["cash", "upi", "card", "online"] as const).map((method) => (
                          <Pressable
                            key={method}
                            accessibilityLabel={`Payment ${index + 1}: ${method}`}
                            accessibilityState={{ selected: payment.method === method }}
                            style={[styles.filterChip, payment.method === method && styles.filterChipActive]}
                            onPress={() => setEditPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, method } : entry))}
                          >
                            <Text style={[styles.filterChipText, payment.method === method && styles.filterChipTextActive]}>
                              {method === "upi" ? "UPI" : method.charAt(0).toUpperCase() + method.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                      <LabeledMoneyInput
                        label={`Payment ${index + 1} amount`}
                        value={payment.amount}
                        onChange={(amount) => setEditPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount } : entry))}
                      />
                      <Pressable
                        accessibilityLabel={`Remove payment ${index + 1}`}
                        style={styles.openItemLaunchButton}
                        onPress={() => setEditPayments((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                      >
                        <Text style={styles.dangerText}>Remove payment</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.secondaryButton} onPress={() => setEditPayments((current) => [...current, { method: "cash", amount: "0" }])}>
                    <Text style={styles.secondaryButtonText}>Add payment</Text>
                  </Pressable>
                  <Text style={[styles.smallMuted, !paymentsMatch && styles.dangerText]} accessibilityLiveRegion="polite">
                    {paymentsMatch ? `Payments match · Rs ${formatRupees(paymentTotal)}` : `Payments Rs ${formatRupees(paymentTotal)} · edited total Rs ${formatRupees(editTotal)}`}
                  </Text>
                </View>
              ) : <Text style={styles.smallMuted}>This is a non-chargeable bill; no collected payments are recorded.</Text>}
              <TextInput accessibilityLabel="Master PIN" style={styles.input} value={masterPin} onChangeText={(value) => { setMasterPin(value); setSaveFailed(false); }} secureTextEntry keyboardType="number-pad" placeholder="Master PIN" placeholderTextColor={palette.muted} />
              {saveFailed ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">{actionMessage || "The bill was not saved. Check your Master PIN and try again."}</Text> : null}
              <View style={styles.historyEditActionRow}>
                <Pressable style={[styles.secondaryButton, styles.historyEditActionButton, !canSaveEdit && styles.buttonDisabled]} disabled={!canSaveEdit} onPress={() => void saveHistoryEdit("save_print")}>
                  <Text style={styles.secondaryButtonText}>{sending ? "Saving..." : "Save + Print"}</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, styles.historyEditActionButton, !canSaveEdit && styles.buttonDisabled]} disabled={!canSaveEdit} onPress={() => void saveHistoryEdit("save")}>
                  <Text style={styles.primaryButtonText}>{sending ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </FormModal>
    </View>
  );
}

export { BillingHistoryPanel };

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

// Same meaning as the hub Reports bill status: paid = settled, pending = printed but unpaid.
function historyStatusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function historyStatusTagStyle(status: string) {
  if (status === "paid") return styles.historyStatusPaid;
  if (status === "pending") return styles.historyStatusPending;
  if (status === "void") return styles.historyStatusVoid;
  return null;
}
