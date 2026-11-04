import { FormModal } from "./form-modal";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "./pressable";
import { formatItemPunch, type OrderItemInput } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import type { TableOrder } from "../lib/table-flow";
import { findMenuVariant, formatRupees } from "../lib/mobile-format";
import type {
  ConnectionState,
  MobileOrderStateItem,
  OrderStateSaveMode,
  PaymentMethod,
  PrintMode,
} from "../lib/mobile-types";
import { useTicketStateEditor } from "../hooks/use-ticket-state-editor";
import { palette, styles } from "../styles/app-styles";
import { EmptyState } from "./app-shell";
import { CaptainBillingPanel } from "./billing-panel";
import { MenuItemRow } from "./menu-screen";
import { TicketTransferSection } from "./ticket-transfer-section";
import { Button } from "./ui-primitives";
import { useKeyboardVisible } from "../hooks/use-keyboard-visible";

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
  tableOrder,
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
  onSubmit,
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
  tableOrder: TableOrder;
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
  onShiftItem: (
    orderItemId: string,
    quantity: number,
    toTableId: string,
  ) => void;
  onGenerateBill: (customerName?: string) => void;
  onSaveOrderState: (
    saveMode: OrderStateSaveMode,
    items: MobileOrderStateItem[],
    approval?: { pin: string; reason: string },
  ) => void;
  onReprintBill: (pin: string, reason: string) => void;
  onMarkNc: (pin: string, reason: string) => void;
  onReviseBill: (pin: string, reason: string) => void;
  onSettleBill: (input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{
      method: PaymentMethod;
      amountPaise: number;
      reference?: string;
    }>;
  }) => void;
  onSubmit: (printMode: PrintMode) => void;
}) {
  const keyboardVisible = useKeyboardVisible();
  const [openDraftNotes, setOpenDraftNotes] = useState<Set<number>>(new Set());
  const canSubmit = Boolean(selectedTableName && items.length > 0 && !sending);
  const sentCount = sentItems.reduce((total, item) => total + item.quantity, 0);
  const newCount = items.reduce((total, item) => total + item.quantity, 0);
  const {
    stateItems,
    stateSearch,
    setStateSearch,
    openStateNotes,
    stateApprovalMode,
    setStateApprovalMode,
    approvalPin,
    setApprovalPin,
    approvalReason,
    setApprovalReason,
    hasStateChanges,
    isBilledState,
    hasStateReduction,
    stateTotal,
    stateMatches,
    changeStateQty,
    changeStateNote,
    showStateNote,
    addStateItem,
    requestStateSave,
    confirmStateSave,
  } = useTicketStateEditor({
    currentOrder,
    sentItems,
    menuItems,
    onSaveOrderState,
  });
  const sentById = new Map(sentItems.map((item) => [item.id, item]));
  const [segment, setSegment] = useState<"new" | "sent" | "bill">(() => items.length ? "new" : sentItems.length ? (canBill ? "bill" : "sent") : "new");
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => { setSegment(items.length ? "new" : sentItems.length ? (canBill ? "bill" : "sent") : "new"); setTransferOpen(false); }, [selectedTableId, currentOrder?.order?.id]);
  const hadDraft = useRef(items.length > 0);
  useEffect(() => {
    if (hadDraft.current && items.length === 0 && sentItems.length > 0) setSegment(canBill ? "bill" : "sent");
    hadDraft.current = items.length > 0;
  }, [items.length, sentItems.length, canBill]);
  const showDraftNote = (index: number) => {
    setOpenDraftNotes((current) => new Set(current).add(index));
  };
  const closeStateApproval = () => {
    setStateApprovalMode(null);
    setApprovalPin("");
  };
  return (
    <View style={[styles.panel, styles.ticketPanel]}>
      <View style={[styles.checkHeader, keyboardVisible && styles.checkHeaderKeyboard]}>
        {!keyboardVisible ? <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Guests</Text>
          <View style={styles.qtyControls}>
            <Pressable accessibilityLabel="Fewer guests" style={styles.qtyButton} onPress={() => onPaxChange(String(Math.max(1, Number(pax || 1) - 1)))}><Text style={styles.qtyText}>−</Text></Pressable>
            <TextInput accessibilityLabel="Guests" style={styles.checkGuestInput} value={pax} onChangeText={(value) => onPaxChange(value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" selectTextOnFocus />
            <Pressable accessibilityLabel="More guests" style={styles.qtyButton} onPress={() => onPaxChange(String(Number(pax || 1) + 1))}><Text style={styles.qtyText}>+</Text></Pressable>
          </View>
        </View> : null}
        <View style={styles.segmentedRow}>
          {(["new", "sent", ...(canBill ? ["bill"] : [])] as Array<"new" | "sent" | "bill">).map((tab) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: segment === tab }} style={[styles.segmentButton, segment === tab && styles.segmentButtonActive]} onPress={() => setSegment(tab)}><Text style={[styles.segmentText, segment === tab && styles.segmentTextActive]}>{tab === "new" ? `New · ${newCount}` : tab === "sent" ? `Sent · ${sentCount}` : "Bill"}</Text></Pressable>)}
        </View>
      </View>
      {segment === "new" ? <View style={styles.ticketSegment}>
        <ScrollView testID="new-items-scroll" style={styles.ticketScroll} contentContainerStyle={styles.checkBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {items.length === 0 ? <EmptyState title="No new items" text="Add dishes from Menu." compact /> : null}
          <View style={styles.ticketList}>
            {items.map((item, index) => {
              const menuItem = menuItems.find(
                (entry) => entry.id === item.menuItemId,
              );
              const variant = findMenuVariant(menuItem, item.menuItemVariantId);
              const lineName =
                item.openName ??
                `${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
              const unitPrice =
                item.openPricePaise ??
                variant?.price_paise ??
                menuItem?.price_paise ??
                0;
              return (
                <View
                  key={`${item.menuItemId ?? item.openName ?? "open"}-${item.menuItemVariantId ?? "default"}-${index}`}
                  style={styles.ticketLine}
                >
                  <View style={styles.ticketText}>
                    <Text style={styles.ticketName} numberOfLines={2}>
                      {lineName}
                    </Text>
                    <Text style={styles.muted}>
                      ₹{formatRupees(unitPrice * item.quantity)}
                    </Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable
                      accessibilityLabel={`Decrease ${lineName} quantity`}
                      style={styles.qtyButton}
                      onPress={() => onChangeQty(index, -1)}
                    >
                      <Text style={styles.qtyText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <Pressable
                      accessibilityLabel={`Increase ${lineName} quantity`}
                      style={styles.qtyButton}
                      onPress={() => onChangeQty(index, 1)}
                    >
                      <Text style={styles.qtyText}>+</Text>
                    </Pressable>
                  </View>
                  {item.note?.trim() || openDraftNotes.has(index) ? (
                    <TextInput
                      style={[styles.input, styles.itemNoteInput]}
                      value={item.note ?? ""}
                      onChangeText={(note) => onChangeItemNote(index, note)}
                      maxLength={500}
                      placeholder="Note"
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                    />
                  ) : (
                    <Pressable
                      style={styles.itemNoteButton}
                      onPress={() => showDraftNote(index)}
                    >
                      <Text style={styles.itemNoteButtonText}>Note</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          </ScrollView>
          {keyboardVisible ? <View style={styles.keyboardCommit}><Button label="Done editing" tone="secondary" onPress={() => Keyboard.dismiss()} /></View> : items.length > 0 ? <View testID="new-items-actions" style={styles.checkCommit}>
            <View style={styles.billAmountRow}><Text style={styles.muted}>{newCount} new items</Text><Text style={styles.totalText}>₹{formatRupees(draftTotal)}</Text></View>
            <View style={styles.sendButtonRow}>
              <Button label="Print + KOT" tone="secondary" disabled={!canSubmit} style={{ flex: 1 }} onPress={() => onSubmit("kot_print")} />
              <Button label={sending ? "Sending…" : connection === "online" ? "Send KOT" : "Save draft"} disabled={!canSubmit} style={{ flex: 1 }} onPress={() => onSubmit("kot")} />
            </View>
          </View> : null}
      </View> : null}

      {segment === "bill" && canBill ? <View style={styles.ticketSegment}>
          <CaptainBillingPanel
            keyboardVisible={keyboardVisible}
            canBill={canBill}
            sentTotalPaise={sentItems.reduce((sum, item) => sum + item.quantity * item.unit_price_paise, 0)}
            currentOrder={currentOrder}
            hasNewItems={items.length > 0}
            sending={sending}
            onGenerateBill={onGenerateBill}
            onReprintBill={onReprintBill}
            onMarkNc={onMarkNc}
            onReviseBill={onReviseBill}
            onSettleBill={onSettleBill}
          />
      </View> : null}

      {segment === "sent" ? <ScrollView style={styles.ticketScroll} contentContainerStyle={styles.checkBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {selectedTableId && sentItems.length > 0 && canShift ? <Button label="Move table or items" tone="secondary" onPress={() => setTransferOpen(true)} /> : null}
        {sentItems.length === 0 ? (
          <Text style={styles.smallMuted}>
            No sent items.
          </Text>
        ) : !canBill && !canShift ? (
          <View style={styles.ticketList}>
            {sentItems.map((item) => (
              <View key={item.id} style={styles.ticketLine}>
                <View style={styles.ticketText}>
                  <Text style={styles.ticketName} numberOfLines={2}>
                    {item.name_snapshot}
                  </Text>
                  <Text style={styles.muted}>
                    ₹{formatRupees(item.unit_price_paise)} each
                  </Text>
                  {formatItemPunch(item) ? (
                    <Text style={styles.smallMuted}>
                      {formatItemPunch(item)}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.qtyValue}>{item.quantity}x</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.stateEditor}>
            {hasStateChanges ? <Text style={[styles.actionAmount, { textAlign: "right" }]}>₹{formatRupees(stateTotal)}</Text> : null}

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
                  <MenuItemRow
                    key={`state-add-${menuItem.id}`}
                    menuItem={menuItem}
                    onAddItem={addStateItem}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.ticketList}>
              {stateItems.length === 0 ? (
                <Text style={styles.smallMuted}>
                  Saving frees this table.
                </Text>
              ) : (
                stateItems.map((item, index) => {
                  const menuItem = menuItems.find(
                    (entry) => entry.id === item.menuItemId,
                  );
                  const variant = findMenuVariant(
                    menuItem,
                    item.menuItemVariantId,
                  );
                  const name =
                    item.openName ??
                    `${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
                  const unitPrice =
                    item.openPricePaise ??
                    item.unitPricePaise ??
                    variant?.price_paise ??
                    menuItem?.price_paise ??
                    0;
                  const punch = formatItemPunch(
                    sentById.get(item.orderItemId ?? ""),
                  );
                  return (
                    <View
                      key={`${item.orderItemId ?? item.menuItemId}-${item.menuItemVariantId ?? "default"}-${index}`}
                      style={styles.ticketLine}
                    >
                      <View style={styles.ticketText}>
                        <Text style={styles.ticketName} numberOfLines={2}>
                          {name}
                        </Text>
                        <Text style={styles.muted}>
                          ₹{formatRupees(unitPrice * item.quantity)}
                        </Text>
                        {punch ? (
                          <Text style={styles.smallMuted}>{punch}</Text>
                        ) : null}
                      </View>
                      <View style={styles.qtyControls}>
                        <Pressable
                          accessibilityLabel={`Decrease ${name} quantity`}
                          style={styles.qtyButton}
                          onPress={() => changeStateQty(index, -1)}
                        >
                          <Text style={styles.qtyText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <Pressable
                          accessibilityLabel={`Increase ${name} quantity`}
                          style={styles.qtyButton}
                          onPress={() => changeStateQty(index, 1)}
                        >
                          <Text style={styles.qtyText}>+</Text>
                        </Pressable>
                      </View>
                      {item.note?.trim() || openStateNotes.has(index) ? (
                        <TextInput
                          style={[styles.input, styles.itemNoteInput]}
                          value={item.note ?? ""}
                          onChangeText={(note) => changeStateNote(index, note)}
                          maxLength={500}
                          placeholder="Note"
                          placeholderTextColor={palette.muted}
                          returnKeyType="done"
                        />
                      ) : (
                        <Pressable
                          style={styles.itemNoteButton}
                          onPress={() => showStateNote(index)}
                        >
                          <Text style={styles.itemNoteButtonText}>
                            Note
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {hasStateChanges ? (
              <View>
                {hasStateReduction ? (
                  <Text style={styles.dangerText}>
                    Manager PIN required.
                  </Text>
                ) : null}
                <View style={styles.sendButtonRow}>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      styles.sendButton,
                      sending && styles.buttonDisabled,
                    ]}
                    disabled={sending}
                    onPress={() => requestStateSave("save")}
                  >
                    <Text style={styles.secondaryButtonText}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      styles.sendButton,
                      sending && styles.buttonDisabled,
                    ]}
                    disabled={sending}
                    onPress={() => requestStateSave("save_print")}
                  >
                    <Text style={styles.primaryButtonText}>Save and print</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView> : null}

      <FormModal visible={transferOpen} transparent animationType="fade" onRequestClose={() => setTransferOpen(false)}>
        <View style={styles.popupBackdrop}><View style={styles.popupCard}>
          <View style={styles.sectionHeaderRow}><Text style={styles.sectionTitle}>Move table or items</Text><Button label="Close" tone="secondary" onPress={() => setTransferOpen(false)} /></View>
          <ScrollView keyboardShouldPersistTaps="handled">
      {selectedTableId && sentItems.length > 0 && canShift ? (
        <TicketTransferSection
          selectedTableId={selectedTableId}
          sentItems={sentItems}
          tables={tables}
          floors={floors}
          tableOrder={tableOrder}
          sending={sending}
          bare
          expanded
          onToggle={() => setTransferOpen(false)}
          onShiftTable={onShiftTable}
          onShiftItem={onShiftItem}
        />
      ) : null}
          </ScrollView>
        </View></View>
      </FormModal>


      <FormModal
        visible={Boolean(stateApprovalMode)}
        transparent
        animationType="fade"
        onRequestClose={closeStateApproval}
      >
        <View style={styles.popupBackdrop}>
          <ScrollView
            style={[styles.popupCard, { padding: 0 }]}
            contentContainerStyle={{ padding: 20, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text style={styles.actionTitle}>Manager approval</Text>
              <Text style={styles.actionMeta}>
                {isBilledState
                  ? "Billed table changes need manager PIN before saving."
                  : "Reducing or removing sent items needs manager PIN."}
              </Text>
            </View>
            <TextInput
              autoFocus
              accessibilityLabel="Manager PIN"
              style={styles.input}
              value={approvalPin}
              onChangeText={setApprovalPin}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="Manager PIN"
              placeholderTextColor={palette.muted}
            />
            <TextInput
              accessibilityLabel="Reason for saved order change"
              style={styles.input}
              value={approvalReason}
              onChangeText={setApprovalReason}
              placeholder="Reason"
              placeholderTextColor={palette.muted}
            />
            <View style={styles.sendButtonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.sendButton]}
                onPress={closeStateApproval}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  styles.sendButton,
                  approvalPin.trim().length < 4 ? styles.primaryButtonWaiting : sending && styles.buttonDisabled,
                ]}
                disabled={sending || approvalPin.trim().length < 4}
                onPress={confirmStateSave}
              >
                <Text style={styles.primaryButtonText}>
                  {sending
                    ? "Saving..."
                    : stateApprovalMode === "save_print"
                      ? "Save and print"
                      : "Save"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </FormModal>
    </View>
  );
}

export { TicketScreen };
