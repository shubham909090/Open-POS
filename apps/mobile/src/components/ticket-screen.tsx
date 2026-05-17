import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { formatPosDateTime, getTableDisplayState, searchMenuItems, tableDisplayLabel, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";
import { amountInputToPaise, categoryToneFor, findMenuVariant, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { CollapsibleSection, EmptyState, LabeledMoneyInput, SummaryBox, UncontrolledInput } from "./app-shell";
import { CaptainBillingPanel } from "./billing-panel";
import { MenuItemRow } from "./menu-screen";

function TicketScreen({
  selectedTableName,
  selectedTableId,
  deviceName,
  pax,
  items,
  sentItems,
  menuItems,
  tables,
  draftTotal,
  tableTotal,
  currentOrder,
  currentSummary,
  dailyReports,
  selectedHistoryDayId,
  selectedHistoryDetail,
  connection,
  sending,
  canShift,
  canBill,
  onPaxChange,
  onChangeQty,
  onShiftTable,
  onShiftItem,
  onCancelSentItem,
  onGenerateBill,
  onSaveOrderState,
  onReprintBill,
  onHistoryPrint,
  onSelectHistoryDay,
  onMarkNc,
  onReviseBill,
  onSettleBill,
  onSubmit
}: {
  selectedTableName: string | null;
  selectedTableId: string | null;
  deviceName: string;
  pax: string;
  items: OrderItemInput[];
  sentItems: HubOrder["items"];
  menuItems: HubBootstrap["menuItems"];
  tables: HubBootstrap["tables"];
  draftTotal: number;
  tableTotal: number;
  currentOrder: HubOrder | null;
  currentSummary: CurrentDaySummary | null;
  dailyReports: DailyReportRow[];
  selectedHistoryDayId: string | null;
  selectedHistoryDetail: DailyReportDetail | null;
  connection: ConnectionState;
  sending: boolean;
  canShift: boolean;
  canBill: boolean;
  onPaxChange: (value: string) => void;
  onChangeQty: (index: number, delta: number) => void;
  onShiftTable: (tableId: string) => void;
  onShiftItem: (orderItemId: string, quantity: number, toTableId: string) => void;
  onCancelSentItem: (orderItemId: string, quantity: number, pin: string, reason: string) => void;
  onGenerateBill: () => void;
  onSaveOrderState: (saveMode: OrderStateSaveMode, items: MobileOrderStateItem[], approval?: { pin: string; reason: string }) => void;
  onReprintBill: (pin: string, reason: string) => void;
  onHistoryPrint: (billId: string) => void;
  onSelectHistoryDay: (posDayId: string | null) => void;
  onMarkNc: (pin: string, reason: string) => void;
  onReviseBill: (pin: string, reason: string) => void;
  onSettleBill: (input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{ method: PaymentMethod; amountPaise: number; reference?: string }>;
  }) => void;
  onSubmit: (printMode: PrintMode) => void;
}) {
  const [itemShiftTargetId, setItemShiftTargetId] = useState("");
  const [itemShiftQty, setItemShiftQty] = useState<Record<string, string>>({});
  const [cancelQty, setCancelQty] = useState<Record<string, string>>({});
  const [cancelPin, setCancelPin] = useState("");
  const [cancelReason, setCancelReason] = useState("Item cancelled");
  const [stateItems, setStateItems] = useState<MobileOrderStateItem[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [statePin, setStatePin] = useState("");
  const [stateReason, setStateReason] = useState("Table state edited");
  const canSubmit = Boolean(selectedTableName && items.length > 0 && !sending);
  const shiftTargets = tables.filter((table) => table.id !== selectedTableId && getTableDisplayState(table) !== "disabled");
  const sentCount = sentItems.reduce((total, item) => total + item.quantity, 0);
  const sentItemsSignature = sentItems
    .map((item) => [item.id, item.menu_item_id, item.menu_item_variant_id, item.name_snapshot, item.unit_price_paise, item.quantity, item.status].join(":"))
    .join("|");
  const savedStateSignature = mobileSavedOrderStateSignature(sentItems);
  const draftStateSignature = mobileDraftOrderStateSignature(stateItems, menuItems);
  const hasStateChanges = Boolean(currentOrder?.order) && savedStateSignature !== draftStateSignature;
  const newCount = items.reduce((total, item) => total + item.quantity, 0);
  const isBilledState = currentOrder?.order?.status === "billed" || Boolean(currentOrder?.bill);
  const stateTotal = stateItems.reduce((total, item) => {
    const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
    const variant = findMenuVariant(menuItem, item.menuItemVariantId);
    return total + (item.unitPricePaise ?? variant?.price_paise ?? menuItem?.price_paise ?? 0) * item.quantity;
  }, 0);
  const stateMatches = searchMenuItems(menuItems, stateSearch, {}).slice(0, 8);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["new"]));
  useEffect(() => {
    setStateItems(
      sentItems.map((item) =>
        item.menu_item_id
          ? {
              orderItemId: item.id,
              menuItemId: item.menu_item_id,
              menuItemVariantId: item.menu_item_variant_id ?? undefined,
              unitPricePaise: item.unit_price_paise,
              saleGroupId: item.sale_group_id,
              productionUnitId: item.production_unit_id ?? null,
              quantity: item.quantity
            }
          : {
              orderItemId: item.id,
              openName: item.name_snapshot,
              openPricePaise: item.unit_price_paise,
              saleGroupId: item.sale_group_id ?? "sg-food",
              productionUnitId: item.production_unit_id ?? null,
              quantity: item.quantity
            }
      )
    );
  }, [currentOrder?.order?.id, sentItemsSignature]);
  const toggleSection = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const changeStateQty = (index: number, delta: number) => {
    setStateItems((current) =>
      current
        .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => Boolean(item.orderItemId) || item.quantity > 0)
    );
  };
  const addStateItem = (menuItemId: string, menuItemVariantId?: string) => {
    setStateItems((current) => {
      const found = current.find((item) => item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId);
      if (found) {
        return current.map((item) => (item === found ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { menuItemId, menuItemVariantId, quantity: 1 }];
    });
    setStateSearch("");
  };
  const requestStateSave = (saveMode: OrderStateSaveMode) => {
    if (!hasStateChanges) return;
    if (isBilledState && !statePin.trim()) {
      Alert.alert("Manager PIN needed", "Billed table changes need manager PIN.");
      return;
    }
    const approval = isBilledState ? { pin: statePin, reason: stateReason || "Billed table state edited" } : undefined;
    if (saveMode === "save" && !isBilledState) {
      Alert.alert("Save without print?", "No modification print or KDS update will be generated.", [
        { text: "Review", style: "cancel" },
        { text: "Save", onPress: () => onSaveOrderState(saveMode, stateItems, approval) }
      ]);
      return;
    }
    onSaveOrderState(saveMode, stateItems, approval);
  };
  return (
    <View style={styles.panel}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Table Check</Text>
          <Text style={styles.muted}>{selectedTableName ? `Table ${selectedTableName}` : "Choose table before sending"}</Text>
        </View>
        <Text style={styles.totalText}>Rs {formatRupees(tableTotal)}</Text>
      </View>

      <View style={styles.totalStrip}>
        <Text style={styles.totalLabel}>New Rs {formatRupees(draftTotal)}</Text>
        <Text style={styles.totalLabel}>Table Rs {formatRupees(tableTotal)}</Text>
      </View>

      <CollapsibleSection title="Service Stats" subtitle={`Pax / ${deviceName || "device"}`} expanded={expandedSections.has("stats")} onToggle={() => toggleSection("stats")}>
        <View style={styles.serviceStats}>
          <View style={styles.serviceStat}>
            <Text style={styles.inputLabel}>New</Text>
            <Text style={styles.serviceStatValue}>{newCount}</Text>
          </View>
          <View style={styles.serviceStat}>
            <Text style={styles.inputLabel}>Sent</Text>
            <Text style={styles.serviceStatValue}>{sentCount}</Text>
          </View>
          <View style={styles.serviceStatWide}>
            <Text style={styles.inputLabel}>Table Total</Text>
            <Text style={styles.serviceStatValue}>Rs {formatRupees(tableTotal)}</Text>
          </View>
        </View>
        <View style={styles.formStack}>
          <Text style={styles.smallMuted}>Device: {deviceName || "paired waiter phone"}</Text>
          <UncontrolledInput
            inputKey={`pax-${selectedTableName ?? "none"}`}
            label="Pax"
            defaultValue={pax}
            onChangeText={onPaxChange}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </CollapsibleSection>

      <View style={styles.actionSection}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.actionTitle}>Send Order</Text>
            <Text style={styles.actionMeta}>{items.length ? `${newCount} new item${newCount === 1 ? "" : "s"} ready` : "Add dishes from Menu"}</Text>
          </View>
          <Text style={styles.actionAmount}>Rs {formatRupees(draftTotal)}</Text>
        </View>
        <View style={styles.sendButtonRow}>
          <Pressable style={[styles.secondaryButton, styles.sendButton, !canSubmit && styles.buttonDisabled]} onPress={() => onSubmit("kot")} disabled={!canSubmit}>
            <Text style={styles.secondaryButtonText}>{sending ? "Saving..." : "KOT"}</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, styles.sendButton, !canSubmit && styles.buttonDisabled]} onPress={() => onSubmit("kot_print")} disabled={!canSubmit}>
            <Text style={styles.primaryButtonText}>{sending ? "Sending..." : connection === "online" ? "Print and KOT" : "Save Draft"}</Text>
          </Pressable>
        </View>
      </View>

      <CollapsibleSection title={`New Items (${newCount})`} subtitle={newCount > 0 ? `Rs ${formatRupees(draftTotal)}` : undefined} expanded={expandedSections.has("new")} onToggle={() => toggleSection("new")} accentColor={newCount > 0 ? palette.green : undefined}>
        {items.length === 0 ? (
          <EmptyState title="No new dishes" text="Add dishes from the menu. Sent items stay below." compact />
        ) : (
          <View style={styles.ticketList}>
            {items.map((item, index) => {
              const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
              const variant = findMenuVariant(menuItem, item.menuItemVariantId);
              const lineName = `${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
              const unitPrice = variant?.price_paise ?? menuItem?.price_paise ?? 0;
              return (
                <View key={`${item.menuItemId}-${item.menuItemVariantId ?? "default"}-${index}`} style={styles.ticketLine}>
                  <View style={styles.ticketText}>
                    <Text style={styles.ticketName} numberOfLines={2}>{lineName}</Text>
                    <Text style={styles.muted}>Rs {formatRupees(unitPrice * item.quantity)}</Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyButton} onPress={() => onChangeQty(index, -1)}>
                      <Text style={styles.qtyText}>-</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => onChangeQty(index, 1)}>
                      <Text style={styles.qtyText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={`Already Sent (${sentCount})`} subtitle={sentCount > 0 ? `Rs ${formatRupees(sentItems.reduce((t, i) => t + i.unit_price_paise * i.quantity, 0))}` : undefined} expanded={expandedSections.has("sent")} onToggle={() => toggleSection("sent")} accentColor={sentCount > 0 ? palette.amber : undefined}>
        {sentItems.length === 0 ? (
          <Text style={styles.smallMuted}>Nothing has been sent for this table yet.</Text>
        ) : (
          <View style={styles.stateEditor}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.actionTitle}>{isBilledState ? "Edit Billed Table" : "Edit Table State"}</Text>
                <Text style={styles.actionMeta}>{isBilledState ? "Manager PIN required before saving changes." : "Save quietly or save and print modification tickets."}</Text>
              </View>
              <Text style={styles.actionAmount}>Rs {formatRupees(stateTotal)}</Text>
            </View>

            <TextInput
              style={styles.input}
              value={stateSearch}
              onChangeText={setStateSearch}
              placeholder="Search to add item"
              placeholderTextColor={palette.muted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {stateSearch.trim() ? (
              <View style={styles.stateSearchResults}>
                {stateMatches.map((menuItem) => (
                  <MenuItemRow key={`state-add-${menuItem.id}`} menuItem={menuItem} onAddItem={addStateItem} />
                ))}
              </View>
            ) : null}

            <View style={styles.ticketList}>
              {stateItems.length === 0 ? (
                <Text style={styles.smallMuted}>All items removed. Saving will free this table.</Text>
              ) : (
                stateItems.map((item, index) => {
                  const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
                  const variant = findMenuVariant(menuItem, item.menuItemVariantId);
                  const name = item.openName ?? `${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
                  const unitPrice = item.openPricePaise ?? item.unitPricePaise ?? variant?.price_paise ?? menuItem?.price_paise ?? 0;
                  return (
                    <View key={`${item.orderItemId ?? item.menuItemId}-${item.menuItemVariantId ?? "default"}-${index}`} style={styles.ticketLine}>
                      <View style={styles.ticketText}>
                        <Text style={styles.ticketName} numberOfLines={2}>{name}</Text>
                        <Text style={styles.muted}>Rs {formatRupees(unitPrice * item.quantity)}</Text>
                      </View>
                      <View style={styles.qtyControls}>
                        <Pressable style={styles.qtyButton} onPress={() => changeStateQty(index, -1)}>
                          <Text style={styles.qtyText}>-</Text>
                        </Pressable>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <Pressable style={styles.qtyButton} onPress={() => changeStateQty(index, 1)}>
                          <Text style={styles.qtyText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {isBilledState ? (
              <View style={styles.managerBox}>
                <TextInput
                  style={styles.input}
                  value={statePin}
                  onChangeText={setStatePin}
                  secureTextEntry
                  keyboardType="number-pad"
                  placeholder="Manager PIN"
                />
                <TextInput
                  style={styles.input}
                  value={stateReason}
                  onChangeText={setStateReason}
                  placeholder="Reason"
                />
              </View>
            ) : null}

            {hasStateChanges ? (
              <View style={styles.sendButtonRow}>
                <Pressable style={[styles.secondaryButton, styles.sendButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => requestStateSave("save")}>
                  <Text style={styles.secondaryButtonText}>Save</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, styles.sendButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => requestStateSave("save_print")}>
                  <Text style={styles.primaryButtonText}>Save and print</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.savedStatePill}>
                <Text style={styles.savedStateText}>Saved</Text>
              </View>
            )}
          </View>
        )}
        {canBill && sentItems.length > 0 ? (
          <View style={[styles.actionSection, styles.cancelPanel]}>
            <View>
              <Text style={styles.actionTitle}>Cancel Sent Item</Text>
              <Text style={styles.actionMeta}>Manager PIN required. Cancellation ticket prints.</Text>
            </View>
            <TextInput
              style={styles.input}
              value={cancelPin}
              onChangeText={setCancelPin}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="Manager PIN"
            />
            <TextInput
              style={styles.input}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Cancellation reason"
            />
            {sentItems.map((item) => {
              const quantityText = cancelQty[item.id] ?? "1";
              const quantity = Math.min(item.quantity, Math.max(1, Number(quantityText.replace(/\D/g, "") || 1)));
              return (
                <View key={`cancel-${item.id}`} style={styles.itemShiftRow}>
                  <Text style={styles.sentName} numberOfLines={2}>{item.name_snapshot}</Text>
                  <TextInput
                    style={styles.shiftQtyInput}
                    value={quantityText}
                    onChangeText={(value) => setCancelQty((current) => ({ ...current, [item.id]: value.replace(/\D/g, "").slice(0, 3) }))}
                    keyboardType="number-pad"
                  />
                  <Pressable
                    style={[styles.dangerSmallButton, sending && styles.buttonDisabled]}
                    disabled={sending}
                    onPress={() => onCancelSentItem(item.id, quantity, cancelPin, cancelReason)}
                  >
                    <Text style={styles.dangerSmallButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </CollapsibleSection>

      {selectedTableId && sentItems.length > 0 && canShift ? (
        <CollapsibleSection title="Shift Table Or Items" subtitle="Captain-only movement tools" expanded={expandedSections.has("shift")} onToggle={() => toggleSection("shift")} accentColor={palette.blueBill}>
          {shiftTargets.length === 0 ? (
            <Text style={styles.smallMuted}>No other active table is available for transfer.</Text>
          ) : (
            <>
              <Text style={styles.smallMuted}>Full table transfer</Text>
              <View style={styles.shiftGrid}>
                {shiftTargets.map((table) => (
                  <Pressable key={table.id} style={styles.shiftButton} onPress={() => onShiftTable(table.id)}>
                    <Text style={styles.shiftButtonText}>{table.name}</Text>
                    <Text style={styles.shiftButtonMeta}>{tableDisplayLabel(getTableDisplayState(table))}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.smallMuted}>Selected item quantities</Text>
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>Transfer items to</Text>
                <View style={styles.shiftGrid}>
                  {shiftTargets.map((table) => (
                    <Pressable key={table.id} style={[styles.shiftButton, itemShiftTargetId === table.id && styles.shiftButtonActive]} onPress={() => setItemShiftTargetId(table.id)}>
                      <Text style={styles.shiftButtonText}>{table.name}</Text>
                      <Text style={styles.shiftButtonMeta}>{tableDisplayLabel(getTableDisplayState(table))}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {sentItems.map((item) => {
                const quantityText = itemShiftQty[item.id] ?? "1";
                const quantity = Math.min(item.quantity, Math.max(1, Number(quantityText.replace(/\D/g, "") || 1)));
                return (
                  <View key={`shift-${item.id}`} style={styles.itemShiftRow}>
                    <Text style={styles.sentName} numberOfLines={2}>{item.name_snapshot}</Text>
                    <TextInput
                      style={styles.shiftQtyInput}
                      value={quantityText}
                      onChangeText={(value) => setItemShiftQty((current) => ({ ...current, [item.id]: value.replace(/\D/g, "").slice(0, 3) }))}
                      keyboardType="number-pad"
                    />
                    <Pressable
                      style={[styles.shiftButton, (!itemShiftTargetId || sending) && styles.buttonDisabled]}
                      disabled={!itemShiftTargetId || sending}
                      onPress={() => onShiftItem(item.id, quantity, itemShiftTargetId)}
                    >
                      <Text style={styles.shiftButtonText}>Transfer</Text>
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}
        </CollapsibleSection>
      ) : selectedTableId && sentItems.length > 0 ? (
        <Text style={styles.smallMuted}>Only captain devices can shift tables or items.</Text>
      ) : null}

      {canBill ? (
        <CollapsibleSection title="Captain Billing" subtitle="Bill, pay, print, NC, revise" expanded={expandedSections.has("billing")} onToggle={() => toggleSection("billing")} accentColor={palette.greenBold}>
          <CaptainBillingPanel
            canBill={canBill}
            currentOrder={currentOrder}
            currentSummary={currentSummary}
            dailyReports={dailyReports}
            selectedHistoryDayId={selectedHistoryDayId}
            selectedHistoryDetail={selectedHistoryDetail}
            hasNewItems={items.length > 0}
            sending={sending}
            onGenerateBill={onGenerateBill}
            onReprintBill={onReprintBill}
            onHistoryPrint={onHistoryPrint}
            onSelectHistoryDay={onSelectHistoryDay}
            onMarkNc={onMarkNc}
            onReviseBill={onReviseBill}
            onSettleBill={onSettleBill}
          />
        </CollapsibleSection>
      ) : null}
    </View>
  );
}

export { TicketScreen };
