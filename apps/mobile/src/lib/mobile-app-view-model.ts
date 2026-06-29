import { getTableDisplayState, searchMenuItems, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "./hub-client";
import { findMenuVariant } from "./mobile-format";

export function getMobileServiceViewModel(input: {
  bootstrap: HubBootstrap | null;
  selectedTableId: string | null;
  currentOrder: HubOrder | null;
  draftItems: OrderItemInput[];
  menuSearch: string;
  menuGroupFilter: SaleGroupKind | null;
}) {
  const tables = input.bootstrap?.tables ?? [];
  const menuItems = input.bootstrap?.menuItems ?? [];
  const productionUnits = input.bootstrap?.productionUnits ?? [];

  const selectedTable = tables.find((table) => table.id === input.selectedTableId) ?? null;
  const activeTables = tables.filter((table) => getTableDisplayState(table) !== "disabled");
  const sentItems = (input.currentOrder?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);
  const draftTotal = input.draftItems.reduce((total, item) => {
    const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
    const variant = findMenuVariant(menuItem, item.menuItemVariantId);
    return total + (variant?.price_paise ?? menuItem?.price_paise ?? 0) * item.quantity;
  }, 0);
  const draftMenuSummary = getDraftMenuSummary(input.draftItems, menuItems);
  const activeMenuGroup = input.menuGroupFilter;

  return {
    selectedTable,
    activeTables,
    sentItems,
    draftTotal,
    tableTotal: sentTotal + draftTotal,
    hasNewItems: input.draftItems.length > 0,
    draftQuantitiesByMenuItemId: draftMenuSummary.quantitiesByMenuItemId,
    draftSelectionLabelsByMenuItemId: draftMenuSummary.selectionLabelsByMenuItemId,
    hasMenuSearch: input.menuSearch.trim().length > 0,
    saleGroupFilters: getSaleGroupFilters(menuItems),
    activeMenuGroup,
    visibleMenu: searchMenuItems(menuItems, input.menuSearch, { saleGroupKind: activeMenuGroup ?? undefined }).slice(0, 120),
    activeKdsUnits: productionUnits.filter((unit) => unit.active !== false && unit.active !== 0 && unit.kds_enabled !== false && unit.kds_enabled !== 0),
  };
}

function getDraftMenuSummary(draftItems: OrderItemInput[], menuItems: HubBootstrap["menuItems"]) {
  const quantitiesByMenuItemId: Record<string, number> = {};
  const selectionQuantitiesByMenuItemId: Record<string, Record<string, { label: string; quantity: number }>> = {};
  for (const item of draftItems) {
    if (item.quantity <= 0 || !item.menuItemId) continue;
    const menuItemId = item.menuItemId;
    quantitiesByMenuItemId[menuItemId] = (quantitiesByMenuItemId[menuItemId] ?? 0) + item.quantity;
    const menuItem = menuItems.find((entry) => entry.id === menuItemId);
    const variant = findDraftSummaryVariant(menuItem, item.menuItemVariantId);
    const selectionKey = variant?.id ?? item.menuItemVariantId ?? "regular";
    const label = variant?.label && variant.kind !== "default" ? variant.label : "added";
    const current = selectionQuantitiesByMenuItemId[menuItemId]?.[selectionKey] ?? { label, quantity: 0 };
    selectionQuantitiesByMenuItemId[menuItemId] = {
      ...(selectionQuantitiesByMenuItemId[menuItemId] ?? {}),
      [selectionKey]: { label: current.label, quantity: current.quantity + item.quantity }
    };
  }

  const selectionLabelsByMenuItemId = Object.fromEntries(
    Object.entries(selectionQuantitiesByMenuItemId).map(([menuItemId, selections]) => [
      menuItemId,
      Object.values(selections)
        .map((selection) => `${selection.quantity}x ${selection.label}`)
        .join(", ")
    ])
  );

  return { quantitiesByMenuItemId, selectionLabelsByMenuItemId };
}

function findDraftSummaryVariant(menuItem: HubBootstrap["menuItems"][number] | undefined, variantId: string | undefined) {
  const variants = menuItem?.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  return variantId ? variants.find((variant) => variant.id === variantId) : variants[0];
}

function getSaleGroupFilters(menuItems: HubBootstrap["menuItems"]): Array<[SaleGroupKind, string]> {
  return Array.from(
    new Map(
      menuItems
        .filter((item) => Boolean(item.active) && Boolean(item.sale_group_kind))
        .map((item) => [item.sale_group_kind as SaleGroupKind, item.sale_group_name ?? item.sale_group_kind ?? "Other"])
    ).entries()
  );
}
