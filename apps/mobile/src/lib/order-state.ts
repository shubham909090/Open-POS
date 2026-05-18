import { getOrderStateSignature } from "@gaurav-pos/shared";
import type { HubBootstrap, HubOrder } from "./hub-client";

export interface MobileOrderStateDraftItem {
  orderItemId?: string;
  menuItemId?: string;
  menuItemVariantId?: string;
  quantity: number;
  openName?: string;
  openPricePaise?: number;
  saleGroupId?: string;
  productionUnitId?: string | null;
  unitPricePaise?: number;
  note?: string;
}

export function mobileSavedOrderStateSignature(sentItems: HubOrder["items"]): string {
  return getOrderStateSignature(
    sentItems.map((item) => ({
      orderItemId: item.id,
      menuItemId: item.menu_item_id,
      menuItemVariantId: item.menu_item_variant_id,
      openName: item.menu_item_id ? undefined : item.name_snapshot,
      pricePaise: item.unit_price_paise,
      saleGroupId: item.sale_group_id,
      productionUnitId: item.production_unit_id,
      note: item.note,
      quantity: item.quantity
    }))
  );
}

export function mobileDraftOrderStateSignature(
  stateItems: MobileOrderStateDraftItem[],
  menuItems: HubBootstrap["menuItems"]
): string {
  return getOrderStateSignature(
    stateItems.map((item) => {
      const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
      const variant = findActiveVariant(menuItem, item.menuItemVariantId);
      return {
        orderItemId: item.orderItemId,
        menuItemId: item.menuItemId,
        menuItemVariantId: item.menuItemVariantId,
        openName: item.openName,
        pricePaise: item.unitPricePaise ?? item.openPricePaise ?? variant?.price_paise ?? menuItem?.price_paise ?? 0,
        saleGroupId: item.saleGroupId ?? menuItem?.sale_group_id,
        productionUnitId: item.productionUnitId ?? menuItem?.production_unit_id,
        note: item.note,
        quantity: item.quantity
      };
    })
  );
}

function findActiveVariant(menuItem: HubBootstrap["menuItems"][number] | undefined, variantId: string | undefined) {
  const variants = menuItem?.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}
