import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, LayoutAnimation, Modal, Pressable, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { formatPosDateTime, getTableDisplayState, isTransferTargetTable, searchMenuItems, tableDisplayLabel, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";
import { amountInputToPaise, categoryToneFor, findMenuVariant, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import { clampTransferQuantity, filterTablesForSearch, groupTablesByFloor, normaliseTransferQuantityInput, stepTransferQuantity } from "../lib/table-flow";
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
  floors,
  draftTotal,
  tableTotal,
  currentOrder,
  connection,
  sending,
  canShift,
  canBill,
  onPaxChange,
  onChangeQty,
  onChangeItemNote,
  onShiftTable,
  onShiftItem,
  onGenerateBill,
  onSaveOrderState,
  onReprintBill,
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
  floors: HubBootstrap["floors"];
  draftTotal: number;
  tableTotal: number;
  currentOrder: HubOrder | null;
  connection: ConnectionState;
  sending: boolean;
  canShift: boolean;
  canBill: boolean;
  onPaxChange: (value: string) => void;
  onChangeQty: (index: number, delta: number) => void;
  onChangeItemNote: (index: number, note: string) => void;
  onShiftTable: (tableId: string) => void;
  onShiftItem: (orderItemId: string, quantity: number, toTableId: string) => void;
  onGenerateBill: () => void;
  onSaveOrderState: (saveMode: OrderStateSaveMode, items: MobileOrderStateItem[], approval?: { pin: string; reason: string }) => void;
  onReprintBill: (pin: string, reason: string) => void;
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
  const [fullShiftTargetId, setFullShiftTargetId] = useState("");
  const [itemShiftTargetId, setItemShiftTargetId] = useState("");
  const [itemShiftQty, setItemShiftQty] = useState<Record<string, string>>({});
  const [targetPickerMode, setTargetPickerMode] = useState<"full" | "items" | null>(null);
  const [targetSearch, setTargetSearch] = useState("");
  const [stateItems, setStateItems] = useState<MobileOrderStateItem[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [openDraftNotes, setOpenDraftNotes] = useState<Set<number>>(new Set());
  const [openStateNotes, setOpenStateNotes] = useState<Set<number>>(new Set());
  const [stateApprovalMode, setStateApprovalMode] = useState<OrderStateSaveMode | null>(null);
  const [approvalPin, setApprovalPin] = useState("");
  const [approvalReason, setApprovalReason] = useState("Billed table state edited");
  const canSubmit = Boolean(selectedTableName && items.length > 0 && !sending);
  const shiftTargets = useMemo(
    () => tables.filter((table) => table.id !== selectedTableId && isTransferTargetTable(table)),
    [selectedTableId, tables]
  );
  const visibleShiftTargets = useMemo(() => filterTablesForSearch(shiftTargets, targetSearch), [shiftTargets, targetSearch]);
  const visibleShiftTargetGroups = useMemo(() => groupTablesByFloor(visibleShiftTargets, floors), [floors, visibleShiftTargets]);
  const selectedFullShiftTarget = shiftTargets.find((table) => table.id === fullShiftTargetId) ?? null;
  const selectedItemShiftTarget = shiftTargets.find((table) => table.id === itemShiftTargetId) ?? null;
  const sentCount = sentItems.reduce((total, item) => total + item.quantity, 0);
  const sentItemsSignature = sentItems
    .map((item) => [item.id, item.menu_item_id, item.menu_item_variant_id, item.name_snapshot, item.unit_price_paise, item.quantity, item.note ?? "", item.status].join(":"))
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
              note: item.note ?? "",
              quantity: item.quantity
            }
          : {
              orderItemId: item.id,
              openName: item.name_snapshot,
              openPricePaise: item.unit_price_paise,
              saleGroupId: item.sale_group_id ?? "sg-food",
              productionUnitId: item.production_unit_id ?? null,
              note: item.note ?? "",
              quantity: item.quantity
            }
      )
    );
  }, [currentOrder?.order?.id, sentItemsSignature]);
  useEffect(() => {
    if (fullShiftTargetId && !shiftTargets.some((table) => table.id === fullShiftTargetId)) setFullShiftTargetId("");
    if (itemShiftTargetId && !shiftTargets.some((table) => table.id === itemShiftTargetId)) setItemShiftTargetId("");
    setItemShiftQty((current) => {
      const allowed = new Set(sentItems.map((item) => item.id));
      return Object.fromEntries(Object.entries(current).filter(([itemId]) => allowed.has(itemId)));
    });
  }, [fullShiftTargetId, itemShiftTargetId, sentItemsSignature, shiftTargets]);
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
  const changeStateNote = (index: number, note: string) => {
    setStateItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, note } : item)));
  };
  const showDraftNote = (index: number) => {
    setOpenDraftNotes((current) => new Set(current).add(index));
  };
  const showStateNote = (index: number) => {
    setOpenStateNotes((current) => new Set(current).add(index));
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
    if (isBilledState) {
      setStateApprovalMode(saveMode);
      setApprovalPin("");
      setApprovalReason("Billed table state edited");
      return;
    }
    if (saveMode === "save") {
      Alert.alert("Save without print?", "No modification print or KDS update will be generated.", [
        { text: "Review", style: "cancel" },
        { text: "Save", onPress: () => onSaveOrderState(saveMode, stateItems) }
      ]);
      return;
    }
    onSaveOrderState(saveMode, stateItems);
  };
  const confirmBilledStateSave = () => {
    if (!stateApprovalMode) return;
    if (!approvalPin.trim()) {
      Alert.alert("Manager PIN needed", "Enter manager PIN to save billed table changes.");
      return;
    }
    onSaveOrderState(stateApprovalMode, stateItems, {
      pin: approvalPin.trim(),
      reason: approvalReason.trim() || "Billed table state edited"
    });
    setStateApprovalMode(null);
    setApprovalPin("");
  };
  const openTargetPicker = (mode: "full" | "items") => {
    setTargetPickerMode(mode);
    setTargetSearch("");
  };
  const selectShiftTarget = (tableId: string) => {
    if (targetPickerMode === "full") setFullShiftTargetId(tableId);
    if (targetPickerMode === "items") setItemShiftTargetId(tableId);
    setTargetPickerMode(null);
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
                  {item.note?.trim() || openDraftNotes.has(index) ? (
                    <TextInput
                      style={[styles.input, styles.itemNoteInput]}
                      value={item.note ?? ""}
                      onChangeText={(note) => onChangeItemNote(index, note)}
                      maxLength={500}
                      placeholder="Kitchen/bar note"
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                    />
                  ) : (
                    <Pressable style={styles.itemNoteButton} onPress={() => showDraftNote(index)}>
                      <Text style={styles.itemNoteButtonText}>Add note</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={`Already Sent (${sentCount})`} subtitle={sentCount > 0 ? `Rs ${formatRupees(sentItems.reduce((t, i) => t + i.unit_price_paise * i.quantity, 0))}` : undefined} expanded={expandedSections.has("sent")} onToggle={() => toggleSection("sent")} accentColor={sentCount > 0 ? palette.amber : undefined}>
        {sentItems.length === 0 ? (
          <Text style={styles.smallMuted}>Nothing has been sent for this table yet.</Text>
        ) : !canBill && !canShift ? (
          <View style={styles.ticketList}>
            {sentItems.map((item) => (
              <View key={item.id} style={styles.ticketLine}>
                <View style={styles.ticketText}>
                  <Text style={styles.ticketName} numberOfLines={2}>{item.name_snapshot}</Text>
                  <Text style={styles.muted}>Rs {formatRupees(item.unit_price_paise)} each</Text>
                </View>
                <Text style={styles.qtyValue}>{item.quantity}x</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.stateEditor}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.actionTitle}>{isBilledState ? "Edit Billed Table" : "Edit Table State"}</Text>
                <Text style={styles.actionMeta}>{isBilledState ? "Manager PIN opens only when saving changes." : "Save quietly or save and print modification tickets."}</Text>
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
                      {item.note?.trim() || openStateNotes.has(index) ? (
                        <TextInput
                          style={[styles.input, styles.itemNoteInput]}
                          value={item.note ?? ""}
                          onChangeText={(note) => changeStateNote(index, note)}
                          maxLength={500}
                          placeholder="Kitchen/bar note"
                          placeholderTextColor={palette.muted}
                          returnKeyType="done"
                        />
                      ) : (
                        <Pressable style={styles.itemNoteButton} onPress={() => showStateNote(index)}>
                          <Text style={styles.itemNoteButtonText}>Add note</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}
            </View>

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
      </CollapsibleSection>

      {selectedTableId && sentItems.length > 0 && canShift ? (
        <CollapsibleSection title="Shift Table Or Items" subtitle="Captain-only movement tools" expanded={expandedSections.has("shift")} onToggle={() => toggleSection("shift")} accentColor={palette.blueBill}>
          {shiftTargets.length === 0 ? (
            <Text style={styles.smallMuted}>No other active table is available for transfer.</Text>
          ) : (
            <>
              <View style={styles.shiftActionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.flexText}>
                    <Text style={styles.actionTitle}>Full table transfer</Text>
                    <Text style={styles.actionMeta}>{selectedFullShiftTarget ? `${selectedFullShiftTarget.name} · ${selectedFullShiftTarget.floor_name}` : "Choose a target table from all floors."}</Text>
                  </View>
                </View>
                <View style={styles.sendButtonRow}>
                  <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={() => openTargetPicker("full")}>
                    <Text style={styles.secondaryButtonText}>{selectedFullShiftTarget ? "Change target" : "Choose table"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, styles.sendButton, (!selectedFullShiftTarget || sending) && styles.buttonDisabled]}
                    disabled={!selectedFullShiftTarget || sending}
                    onPress={() => selectedFullShiftTarget && onShiftTable(selectedFullShiftTarget.id)}
                  >
                    <Text style={styles.primaryButtonText}>{sending ? "Moving..." : "Transfer table"}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.shiftActionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.flexText}>
                    <Text style={styles.actionTitle}>Transfer selected items</Text>
                    <Text style={styles.actionMeta}>{selectedItemShiftTarget ? `${selectedItemShiftTarget.name} · ${selectedItemShiftTarget.floor_name}` : "Pick one target table, then move item quantities."}</Text>
                  </View>
                </View>
                <Pressable style={styles.secondaryButton} onPress={() => openTargetPicker("items")}>
                  <Text style={styles.secondaryButtonText}>{selectedItemShiftTarget ? "Change item target" : "Choose item target"}</Text>
                </Pressable>
              </View>
              {sentItems.map((item) => {
                const quantity = clampTransferQuantity(itemShiftQty[item.id], item.quantity);
                const canTransferItem = Boolean(selectedItemShiftTarget && !sending && quantity > 0);
                return (
                  <View key={`shift-${item.id}`} style={styles.itemShiftRow}>
                    <Text style={styles.sentName} numberOfLines={2}>{item.name_snapshot}</Text>
                    <View style={styles.transferQtyStepper}>
                      <Pressable
                        style={[styles.transferQtyButton, quantity <= 1 && styles.buttonDisabled]}
                        disabled={quantity <= 1}
                        onPress={() => setItemShiftQty((current) => ({ ...current, [item.id]: stepTransferQuantity(current[item.id], -1, item.quantity) }))}
                      >
                        <Text style={styles.qtyText}>-</Text>
                      </Pressable>
                      <TextInput
                        style={styles.shiftQtyInput}
                        value={quantity ? String(quantity) : ""}
                        onChangeText={(value) => setItemShiftQty((current) => ({ ...current, [item.id]: normaliseTransferQuantityInput(value, item.quantity) }))}
                        keyboardType="number-pad"
                        selectTextOnFocus
                      />
                      <Pressable
                        style={[styles.transferQtyButton, quantity >= item.quantity && styles.buttonDisabled]}
                        disabled={quantity >= item.quantity}
                        onPress={() => setItemShiftQty((current) => ({ ...current, [item.id]: stepTransferQuantity(current[item.id], 1, item.quantity) }))}
                      >
                        <Text style={styles.qtyText}>+</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={[styles.shiftButton, !canTransferItem && styles.buttonDisabled]}
                      disabled={!canTransferItem}
                      onPress={() => onShiftItem(item.id, quantity, itemShiftTargetId)}
                    >
                      <Text style={styles.shiftButtonText}>Move {quantity}</Text>
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
            hasNewItems={items.length > 0}
            sending={sending}
            onGenerateBill={onGenerateBill}
            onReprintBill={onReprintBill}
            onMarkNc={onMarkNc}
            onReviseBill={onReviseBill}
            onSettleBill={onSettleBill}
          />
        </CollapsibleSection>
      ) : null}

      <Modal visible={Boolean(targetPickerMode)} transparent animationType="fade" onRequestClose={() => setTargetPickerMode(null)}>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.actionTitle}>{targetPickerMode === "full" ? "Transfer table to" : "Transfer items to"}</Text>
                <Text style={styles.actionMeta}>Search by table or floor. Free and running tables are allowed.</Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={targetSearch}
              onChangeText={setTargetSearch}
              placeholder="Search table or floor"
              placeholderTextColor={palette.muted}
              autoCorrect={false}
            />
            <ScrollView style={styles.popupScroll} contentContainerStyle={styles.floorTableStack} keyboardShouldPersistTaps="always">
              {visibleShiftTargetGroups.length === 0 ? (
                <EmptyState title="No matching tables" text="Clear search or check active tables on the hub." compact />
              ) : (
                visibleShiftTargetGroups.map((group) => (
                  <View key={`picker-${group.floorId}`} style={styles.floorTableGroup}>
                    <View style={styles.floorTableHeader}>
                      <Text style={styles.subhead}>{group.floorName}</Text>
                      <Text style={styles.smallMuted}>{group.tables.length}</Text>
                    </View>
                    <View style={styles.targetPickerList}>
                      {group.tables.map((table) => {
                        const state = getTableDisplayState(table);
                        const selected = table.id === (targetPickerMode === "full" ? fullShiftTargetId : itemShiftTargetId);
                        return (
                          <Pressable key={table.id} style={[styles.targetPickerRow, selected && styles.shiftButtonActive]} onPress={() => selectShiftTarget(table.id)}>
                            <View style={styles.flexText}>
                              <Text style={styles.shiftButtonText}>{table.name}</Text>
                              <Text style={styles.shiftButtonMeta}>{table.floor_name}</Text>
                            </View>
                            <Text style={[styles.shiftButtonMeta, state === "running" && styles.tableStatusBusy, state === "bill_printed" && styles.tableStatusBilled]}>
                              {tableDisplayLabel(state)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <Pressable style={styles.secondaryButton} onPress={() => setTargetPickerMode(null)}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(stateApprovalMode)} transparent animationType="fade" onRequestClose={() => setStateApprovalMode(null)}>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View>
              <Text style={styles.actionTitle}>Manager approval</Text>
              <Text style={styles.actionMeta}>Billed table changes need manager PIN before saving.</Text>
            </View>
            <TextInput
              style={styles.input}
              value={approvalPin}
              onChangeText={setApprovalPin}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="Manager PIN"
              placeholderTextColor={palette.muted}
            />
            <TextInput
              style={styles.input}
              value={approvalReason}
              onChangeText={setApprovalReason}
              placeholder="Reason"
              placeholderTextColor={palette.muted}
            />
            <View style={styles.sendButtonRow}>
              <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={() => setStateApprovalMode(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.sendButton, sending && styles.buttonDisabled]} disabled={sending} onPress={confirmBilledStateSave}>
                <Text style={styles.primaryButtonText}>{sending ? "Saving..." : stateApprovalMode === "save_print" ? "Save and print" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { TicketScreen };
