import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { formatPosDateTime } from "@gaurav-pos/shared";

import { getBillingHistoryViewModel } from "../lib/billing-history";
import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap } from "../lib/hub-client";
import { formatRupees } from "../lib/mobile-format";
import { palette, styles } from "../styles/app-styles";
import { EmptyState, SummaryBox } from "./app-shell";

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
            const previewItems = historyBill.items?.length ? historyBill.items.slice(0, 6) : [];
            return (
              <View key={historyBill.billId} style={styles.historyRow}>
                <View style={styles.flexText}>
                  <View style={styles.historyRowHeader}>
                    <Text style={styles.historyBillTitle}>Bill #{historyBill.billNumber ?? historyBill.billId}</Text>
                    <Text style={styles.historyAmount}>Rs {formatRupees(historyBill.finalTotalPaise)}</Text>
                  </View>
                  {historyBill.modified ? <Text style={styles.historyModifiedTag}>Modified</Text> : null}
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
