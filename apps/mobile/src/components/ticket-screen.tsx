import { useState } from "react";
import { LayoutAnimation, Modal, Pressable, Text, TextInput, View } from "react-native";
import { type OrderItemInput } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import { findMenuVariant, formatRupees } from "../lib/mobile-format";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode } from "../lib/mobile-types";
import { useTicketStateEditor } from "../hooks/use-ticket-state-editor";
import { palette, styles } from "../styles/app-styles";
import { CollapsibleSection, EmptyState, UncontrolledInput } from "./app-shell";
import { CaptainBillingPanel } from "./billing-panel";
import { MenuItemRow } from "./menu-screen";
import { TicketTransferSection } from "./ticket-transfer-section";

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
    stateTotal,
    stateMatches,
    changeStateQty,
    changeStateNote,
    showStateNote,
    addStateItem,
    requestStateSave,
    confirmBilledStateSave
  } = useTicketStateEditor({ currentOrder, sentItems, menuItems, onSaveOrderState });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["new"]));
  const toggleSection = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const showDraftNote = (index: number) => {
    setOpenDraftNotes((current) => new Set(current).add(index));
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
        <TicketTransferSection
          selectedTableId={selectedTableId}
          sentItems={sentItems}
          tables={tables}
          floors={floors}
          sending={sending}
          expanded={expandedSections.has("shift")}
          onToggle={() => toggleSection("shift")}
          onShiftTable={onShiftTable}
          onShiftItem={onShiftItem}
        />
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
