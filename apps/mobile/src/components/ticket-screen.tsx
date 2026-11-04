import { FormModal } from "./form-modal";
import { useState } from "react";
import {
  LayoutAnimation,
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
import { CollapsibleSection, UncontrolledInput } from "./app-shell";
import { CaptainBillingPanel } from "./billing-panel";
import { MenuItemRow } from "./menu-screen";
import { TicketTransferSection } from "./ticket-transfer-section";
import { useReducedMotion } from "../hooks/use-reduced-motion";

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
  const reducedMotion = useReducedMotion();
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
  // Open the section holding the next likely action: new dishes to send, otherwise billing.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set([items.length === 0 && sentItems.length > 0 ? canBill ? "billing" : "sent" : "new"]),
  );
  const toggleSection = (id: string) => {
    if (!reducedMotion)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const showDraftNote = (index: number) => {
    setOpenDraftNotes((current) => new Set(current).add(index));
  };
  const closeStateApproval = () => {
    setStateApprovalMode(null);
    setApprovalPin("");
  };
  return (
    <View style={[styles.panel, styles.ticketPanel]}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.inputLabel}>
            {selectedTableName ? "Table total" : "No table selected"}
          </Text>
          <Text style={styles.muted}>
            {selectedTableName
              ? `${sentCount} sent${newCount ? ` · ${newCount} new` : ""}${pax ? ` · ${pax} pax` : ""}`
              : "Choose a table before sending."}
          </Text>
        </View>
        <Text style={styles.totalText}>Rs {formatRupees(tableTotal)}</Text>
      </View>

      {items.length > 0 ? (
      <View style={styles.actionSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.flexText}>
            <Text style={styles.actionTitle}>
              Send {newCount} new item{newCount === 1 ? "" : "s"}
            </Text>
            <Text style={styles.actionMeta}>
              {connection === "online"
                ? "KOT goes to the kitchen; Print and KOT also prints it."
                : "Offline: the order is saved on this phone until the hub returns."}
            </Text>
          </View>
          <Text style={styles.actionAmount}>Rs {formatRupees(draftTotal)}</Text>
        </View>
        <View style={styles.sendButtonRow}>
          <Pressable
            style={[
              styles.secondaryButton,
              styles.sendButton,
              !canSubmit && styles.buttonDisabled,
            ]}
            onPress={() => onSubmit("kot")}
            disabled={!canSubmit}
          >
            <Text style={styles.secondaryButtonText}>
              {sending ? "Saving..." : "KOT"}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryButton,
              styles.sendButton,
              !canSubmit && styles.buttonDisabled,
            ]}
            onPress={() => onSubmit("kot_print")}
            disabled={!canSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {sending
                ? "Sending..."
                : connection === "online"
                  ? "Print and KOT"
                  : "Save draft"}
            </Text>
          </Pressable>
        </View>
      </View>
      ) : (
        <Text style={styles.smallMuted}>
          No new dishes. Add them from Menu; sent items stay below.
        </Text>
      )}

      {items.length > 0 ? (
      <CollapsibleSection
        title={`New items (${newCount})`}
        expanded={expandedSections.has("new")}
        onToggle={() => toggleSection("new")}
      >
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
                      Rs {formatRupees(unitPrice * item.quantity)}
                    </Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable
                      accessibilityLabel={`Decrease ${lineName} quantity`}
                      style={styles.qtyButton}
                      onPress={() => onChangeQty(index, -1)}
                    >
                      <Text style={styles.qtyText}>-</Text>
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
                      placeholder="Kitchen/bar note"
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                    />
                  ) : (
                    <Pressable
                      style={styles.itemNoteButton}
                      onPress={() => showDraftNote(index)}
                    >
                      <Text style={styles.itemNoteButtonText}>Add note</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
      </CollapsibleSection>
      ) : null}

      {canBill ? (
        <CollapsibleSection
          title="Billing"
          subtitle={currentOrder?.bill ? "Bill printed · settle payment" : "Generate bill, settle, reprint, NC"}
          expanded={expandedSections.has("billing")}
          onToggle={() => toggleSection("billing")}
        >
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

      <CollapsibleSection
        title="Guests and device"
        subtitle={`${pax ? `${pax} pax` : "Pax not set"} · ${deviceName || "this phone"}`}
        expanded={expandedSections.has("stats")}
        onToggle={() => toggleSection("stats")}
      >
        <View style={styles.formStack}>
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

      <CollapsibleSection
        title={`Sent items (${sentCount})`}
        expanded={expandedSections.has("sent")}
        onToggle={() => toggleSection("sent")}
      >
        {sentItems.length === 0 ? (
          <Text style={styles.smallMuted}>
            Nothing has been sent for this table yet.
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
                    Rs {formatRupees(item.unit_price_paise)} each
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
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.actionTitle}>
                  {isBilledState ? "Edit billed table" : "Edit sent items"}
                </Text>
                <Text style={styles.actionMeta}>
                  {isBilledState
                    ? "Manager PIN opens only when saving changes."
                    : "Save quietly or save and print modification tickets."}
                </Text>
              </View>
              {hasStateChanges ? (
                <Text style={styles.actionAmount}>
                  Rs {formatRupees(stateTotal)}
                </Text>
              ) : null}
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
                  All items removed. Saving will free this table.
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
                          Rs {formatRupees(unitPrice * item.quantity)}
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
                          <Text style={styles.qtyText}>-</Text>
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
                          placeholder="Kitchen/bar note"
                          placeholderTextColor={palette.muted}
                          returnKeyType="done"
                        />
                      ) : (
                        <Pressable
                          style={styles.itemNoteButton}
                          onPress={() => showStateNote(index)}
                        >
                          <Text style={styles.itemNoteButtonText}>
                            Add note
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
                    Manager PIN required to reduce or remove sent items.
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
            ) : (
              <View style={styles.savedStatePill}>
                <Text style={styles.savedStateText}>Saved</Text>
              </View>
            )}
          </View>
        )}
      </CollapsibleSection>

      {selectedTableId && sentItems.length > 0 && canShift ? (
        <TicketTransferSection
          selectedTableId={selectedTableId}
          sentItems={sentItems}
          tables={tables}
          floors={floors}
          tableOrder={tableOrder}
          sending={sending}
          expanded={expandedSections.has("shift")}
          onToggle={() => toggleSection("shift")}
          onShiftTable={onShiftTable}
          onShiftItem={onShiftItem}
        />
      ) : null}


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
                  (sending || approvalPin.trim().length < 4) && styles.buttonDisabled,
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
