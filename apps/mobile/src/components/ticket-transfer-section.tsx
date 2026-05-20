import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { getTableDisplayState, isTransferTargetTable, tableDisplayLabel } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import { clampTransferQuantity, filterTablesForSearch, groupTablesByFloor, normaliseTransferQuantityInput, stepTransferQuantity } from "../lib/table-flow";
import { palette, styles } from "../styles/app-styles";
import { CollapsibleSection, EmptyState } from "./app-shell";

function TicketTransferSection({
  selectedTableId,
  sentItems,
  tables,
  floors,
  sending,
  expanded,
  onToggle,
  onShiftTable,
  onShiftItem
}: {
  selectedTableId: string;
  sentItems: HubOrder["items"];
  tables: HubBootstrap["tables"];
  floors: HubBootstrap["floors"];
  sending: boolean;
  expanded: boolean;
  onToggle: () => void;
  onShiftTable: (tableId: string) => void;
  onShiftItem: (orderItemId: string, quantity: number, toTableId: string) => void;
}) {
  const [fullShiftTargetId, setFullShiftTargetId] = useState("");
  const [itemShiftTargetId, setItemShiftTargetId] = useState("");
  const [itemShiftQty, setItemShiftQty] = useState<Record<string, string>>({});
  const [targetPickerMode, setTargetPickerMode] = useState<"full" | "items" | null>(null);
  const [targetSearch, setTargetSearch] = useState("");
  const sentItemsSignature = sentItems.map((item) => [item.id, item.quantity].join(":")).join("|");
  const shiftTargets = useMemo(
    () => tables.filter((table) => table.id !== selectedTableId && isTransferTargetTable(table)),
    [selectedTableId, tables]
  );
  const visibleShiftTargets = useMemo(() => filterTablesForSearch(shiftTargets, targetSearch), [shiftTargets, targetSearch]);
  const visibleShiftTargetGroups = useMemo(() => groupTablesByFloor(visibleShiftTargets, floors), [floors, visibleShiftTargets]);
  const selectedFullShiftTarget = shiftTargets.find((table) => table.id === fullShiftTargetId) ?? null;
  const selectedItemShiftTarget = shiftTargets.find((table) => table.id === itemShiftTargetId) ?? null;

  useEffect(() => {
    if (fullShiftTargetId && !shiftTargets.some((table) => table.id === fullShiftTargetId)) setFullShiftTargetId("");
    if (itemShiftTargetId && !shiftTargets.some((table) => table.id === itemShiftTargetId)) setItemShiftTargetId("");
    setItemShiftQty((current) => {
      const allowed = new Set(sentItems.map((item) => item.id));
      return Object.fromEntries(Object.entries(current).filter(([itemId]) => allowed.has(itemId)));
    });
  }, [fullShiftTargetId, itemShiftTargetId, sentItems, sentItemsSignature, shiftTargets]);

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
    <>
      <CollapsibleSection title="Shift Table Or Items" subtitle="Captain-only movement tools" expanded={expanded} onToggle={onToggle} accentColor={palette.blueBill}>
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
    </>
  );
}

export { TicketTransferSection };
