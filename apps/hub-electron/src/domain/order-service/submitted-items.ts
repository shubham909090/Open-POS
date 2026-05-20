import type { ManagerApprovalInput, SubmitOrderInput } from "@gaurav-pos/shared";

import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import type { MenuItemRow, MenuItemVariantRow, OrderItemRow, RequestedOrderItem, SaleGroupRow } from "./types.js";

export type SubmittedItemContext = {
  getMenuItems: (ids: string[]) => Map<string, MenuItemRow>;
  resolveMenuItemVariant: (menuItemId: string, variantId?: string, allowInactive?: boolean) => MenuItemVariantRow;
  verifyManagerApproval: (input: ManagerApprovalInput | undefined, action: string, aggregateType: string, aggregateId: string, requestedBy: string) => void;
  snapshotAlcoholRecipe: (menuItemId: string) => string;
  requireSaleGroup: (id: string) => SaleGroupRow;
  requireProductionUnit: (productionUnitId: string) => void;
  itemKey: (menuItemId: string | null, orderItemId?: string, variantId?: string | null) => string;
};

export function prepareSubmittedItems(input: {
  ctx: SubmittedItemContext;
  items: SubmitOrderInput["items"];
  allowedInactiveVariantIds?: Set<string>;
  previousItemsById?: Map<string, OrderItemRow>;
}): RequestedOrderItem[] {
  const { ctx, items, allowedInactiveVariantIds = new Set<string>(), previousItemsById = new Map<string, OrderItemRow>() } = input;

  return items
    .filter((item) => item.quantity > 0)
    .map((item) => {
      if (item.menuItemId) {
        const menuItem = ctx.getMenuItems([item.menuItemId]).get(item.menuItemId);
        if (!menuItem) throw new DomainError(`Menu item ${item.menuItemId} is not available`);
        const variant = ctx.resolveMenuItemVariant(
          menuItem.id,
          item.menuItemVariantId,
          item.menuItemVariantId ? allowedInactiveVariantIds.has(item.menuItemVariantId) : false
        );
        if (item.unitPricePaise !== undefined && item.unitPricePaise !== variant.price_paise) {
          ctx.verifyManagerApproval(item.managerApproval, "order_item.price_edit", "menu_item", menuItem.id, item.managerApproval?.approvedBy ?? "captain");
        }
        const previous = item.orderItemId ? previousItemsById.get(item.orderItemId) : undefined;
        const preservePreviousSnapshot =
          previous &&
          previous.menu_item_id === menuItem.id &&
          previous.menu_item_variant_id === variant.id &&
          item.unitPricePaise === undefined &&
          item.productionUnitId === undefined;
        const displayName = variant.kind === "default" ? menuItem.name : `${menuItem.name} ${variant.label}`;
        return {
          itemKey: ctx.itemKey(menuItem.id, undefined, variant.id),
          menuItemId: menuItem.id,
          menuItemVariantId: variant.id,
          quantity: item.quantity,
          name: preservePreviousSnapshot ? previous.name_snapshot : displayName,
          variantName: preservePreviousSnapshot ? previous.variant_name_snapshot : variant.label,
          variantVolumeMl: preservePreviousSnapshot ? previous.variant_volume_ml : variant.volume_ml,
          inventoryAction: preservePreviousSnapshot ? previous.inventory_action_snapshot : variant.inventory_action,
          alcoholRecipeSnapshotJson: preservePreviousSnapshot ? previous.alcohol_recipe_snapshot_json : ctx.snapshotAlcoholRecipe(menuItem.id),
          unitPricePaise: item.unitPricePaise ?? (preservePreviousSnapshot ? previous.unit_price_paise : variant.price_paise),
          productionUnitId: preservePreviousSnapshot ? previous.production_unit_id : item.productionUnitId !== undefined ? item.productionUnitId : menuItem.production_unit_id,
          saleGroupId: preservePreviousSnapshot ? previous.sale_group_id : menuItem.sale_group_id,
          saleGroupName: preservePreviousSnapshot ? previous.sale_group_name_snapshot : menuItem.sale_group_name,
          saleGroupKind: preservePreviousSnapshot ? previous.sale_group_kind_snapshot : menuItem.sale_group_kind,
          ticketLabel: preservePreviousSnapshot ? previous.ticket_label_snapshot : menuItem.ticket_label,
          taxComponentsJson: preservePreviousSnapshot ? previous.tax_components_json : menuItem.tax_components_json,
          note: normaliseItemNote(item.note),
          isOpenItem: preservePreviousSnapshot ? Boolean(previous.is_open_item) : false
        };
      }

      const saleGroup = ctx.requireSaleGroup(item.saleGroupId ?? "sg-food");
      if (!item.openPricePaise) throw new DomainError("Open item price is required");
      const productionUnitId = item.productionUnitId !== undefined ? item.productionUnitId : saleGroup.default_production_unit_id;
      if (productionUnitId) ctx.requireProductionUnit(productionUnitId);
      const existingOpenItemId = item.orderItemId?.trim();
      return {
        itemKey: existingOpenItemId ? `open:${existingOpenItemId}` : `open:${makeId("line")}`,
        menuItemId: null,
        menuItemVariantId: null,
        quantity: item.quantity,
        name: item.openName ?? "Open item",
        variantName: "",
        variantVolumeMl: null,
        inventoryAction: "none",
        alcoholRecipeSnapshotJson: "[]",
        unitPricePaise: item.openPricePaise,
        productionUnitId,
        saleGroupId: saleGroup.id,
        saleGroupName: saleGroup.name,
        saleGroupKind: saleGroup.kind,
        ticketLabel: saleGroup.ticket_label,
        taxComponentsJson: saleGroup.tax_components_json,
        note: normaliseItemNote(item.note),
        isOpenItem: true
      };
    });
}

function normaliseItemNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}
