import type { OrderItemInput } from "@gaurav-pos/shared";

import type { HubBootstrap, HubOrder } from "./hub-client";
import { findMenuVariant } from "./mobile-format";

export type MobileBillRevisionItem =
  | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
  | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number };

export function buildDraftOrderSummary(items: OrderItemInput[], menuItems: HubBootstrap["menuItems"]): string {
  return items
    .map((item) => {
      const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
      const variant = findMenuVariant(menuItem, item.menuItemVariantId);
      return `${item.quantity} x ${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
    })
    .join("\n");
}

export function buildBillRevisionItems(sentItems: HubOrder["items"], draftItems: OrderItemInput[]): MobileBillRevisionItem[] {
  const existingItems: MobileBillRevisionItem[] = sentItems.map((item) =>
    item.menu_item_id
      ? {
          orderItemId: item.id,
          menuItemId: item.menu_item_id,
          menuItemVariantId: item.menu_item_variant_id ?? undefined,
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
  );
  const newItems: MobileBillRevisionItem[] = draftItems
    .filter((item): item is OrderItemInput & { menuItemId: string } => Boolean(item.menuItemId))
    .map((item) => ({
      menuItemId: item.menuItemId,
      menuItemVariantId: item.menuItemVariantId,
      quantity: item.quantity
    }));
  return [...existingItems, ...newItems];
}
