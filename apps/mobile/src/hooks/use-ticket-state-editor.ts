import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { searchMenuItems } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import { findMenuVariant } from "../lib/mobile-format";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import type { MobileOrderStateItem, OrderStateSaveMode } from "../lib/mobile-types";

export function useTicketStateEditor({
  currentOrder,
  sentItems,
  menuItems,
  onSaveOrderState,
}: {
  currentOrder: HubOrder | null;
  sentItems: HubOrder["items"];
  menuItems: HubBootstrap["menuItems"];
  onSaveOrderState: (
    saveMode: OrderStateSaveMode,
    items: MobileOrderStateItem[],
    approval?: { pin: string; reason: string },
  ) => void;
}) {
  const [stateItems, setStateItems] = useState<MobileOrderStateItem[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [openStateNotes, setOpenStateNotes] = useState<Set<number>>(new Set());
  const [stateApprovalMode, setStateApprovalMode] = useState<OrderStateSaveMode | null>(null);
  const [approvalPin, setApprovalPin] = useState("");
  const [approvalReason, setApprovalReason] = useState("Billed table state edited");

  const sentItemsSignature = sentItems
    .map((item) => [
      item.id,
      item.menu_item_id,
      item.menu_item_variant_id,
      item.name_snapshot,
      item.unit_price_paise,
      item.quantity,
      item.note ?? "",
      item.status
    ].join(":"))
    .join("|");
  const savedStateSignature = mobileSavedOrderStateSignature(sentItems);
  const draftStateSignature = mobileDraftOrderStateSignature(stateItems, menuItems);
  const hasStateChanges = Boolean(currentOrder?.order) && savedStateSignature !== draftStateSignature;
  const isBilledState = currentOrder?.order?.status === "billed" || Boolean(currentOrder?.bill);
  const stateTotal = stateItems.reduce((total, item) => {
    const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
    const variant = findMenuVariant(menuItem, item.menuItemVariantId);
    return total + (item.unitPricePaise ?? variant?.price_paise ?? menuItem?.price_paise ?? 0) * item.quantity;
  }, 0);
  const stateMatches = searchMenuItems(menuItems, stateSearch, {}).slice(0, 8);

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

  return {
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
  };
}
