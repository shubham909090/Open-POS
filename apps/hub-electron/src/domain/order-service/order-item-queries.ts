import { and, eq, sql } from "drizzle-orm";

import type { HubOrm } from "../../db/database.js";
import { orderItems } from "../../db/drizzle-schema.js";
import type { OrderItemRow } from "./types.js";

const orderItemSelection = {
  id: orderItems.id,
  order_id: orderItems.orderId,
  menu_item_id: orderItems.menuItemId,
  menu_item_variant_id: orderItems.menuItemVariantId,
  name_snapshot: orderItems.nameSnapshot,
  variant_name_snapshot: orderItems.variantNameSnapshot,
  variant_volume_ml: orderItems.variantVolumeMl,
  inventory_action_snapshot: orderItems.inventoryActionSnapshot,
  alcohol_recipe_snapshot_json: orderItems.alcoholRecipeSnapshotJson,
  unit_price_paise: orderItems.unitPricePaise,
  quantity: orderItems.quantity,
  production_unit_id: orderItems.productionUnitId,
  sale_group_id: orderItems.saleGroupId,
  sale_group_name_snapshot: orderItems.saleGroupNameSnapshot,
  sale_group_kind_snapshot: orderItems.saleGroupKindSnapshot,
  ticket_label_snapshot: orderItems.ticketLabelSnapshot,
  tax_components_json: orderItems.taxComponentsJson,
  tax_paise: orderItems.taxPaise,
  note: orderItems.note,
  is_open_item: orderItems.isOpenItem,
  status: orderItems.status
};

export function listOrderItems(orm: HubOrm, orderId: string): OrderItemRow[] {
  return orm.select(orderItemSelection).from(orderItems).where(eq(orderItems.orderId, orderId)).all();
}

export function getOrderItemByMenuKey(orm: HubOrm, orderId: string, menuItemId: string, variantId?: string | null): OrderItemRow | undefined {
  return orm
    .select(orderItemSelection)
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.menuItemId, menuItemId),
        variantId ? eq(orderItems.menuItemVariantId, variantId) : sql`${orderItems.menuItemVariantId} IS NULL`
      )
    )
    .get();
}

export function getOpenOrderItemByName(orm: HubOrm, orderId: string, name: string): OrderItemRow | undefined {
  return orm
    .select(orderItemSelection)
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.nameSnapshot, name),
        eq(orderItems.isOpenItem, true)
      )
    )
    .get();
}

export function getOrderItemById(orm: HubOrm, orderItemId: string): OrderItemRow | undefined {
  return orm.select(orderItemSelection).from(orderItems).where(eq(orderItems.id, orderItemId)).get();
}
