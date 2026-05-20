import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { HubOrm } from "../../db/database.js";
import { orderItems } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { combineItemNotes } from "./helpers.js";
import type { KotItemChange, MenuItemRow, OrderItemRow, RequestedOrderItem } from "./types.js";

interface ProductionUnitForKot {
  name: string;
  printer_host: string | null;
  printer_port: number | null;
  printer_name: string | null;
}

export function buildOrderItemKey(menuItemId: string | null, orderItemId?: string, variantId?: string | null): string {
  return menuItemId ? `menu:${menuItemId}:${variantId ?? "default"}` : `open:${orderItemId ?? makeId("line")}`;
}

export function applyOrderItemDiff(input: {
  orm: HubOrm;
  orderId: string;
  requestedItems: RequestedOrderItem[];
  previousItems: OrderItemRow[];
  menuById: Map<string, MenuItemRow>;
  now: string;
  cancelMissing?: boolean;
  getUnit: (productionUnitId: string) => ProductionUnitForKot | undefined;
}): KotItemChange[] {
  const { orm, orderId, requestedItems, previousItems, menuById, now, cancelMissing = false, getUnit } = input;
  const previousByKey = new Map(previousItems.map((item) => [buildOrderItemKey(item.menu_item_id, item.id, item.menu_item_variant_id), item]));
  const requestedByKey = new Map<string, RequestedOrderItem>();

  for (const item of requestedItems) {
    const menuItem = item.menuItemId ? menuById.get(item.menuItemId) : undefined;
    if (item.menuItemId && !menuItem) throw new DomainError(`Menu item ${item.menuItemId} is not available`);
    const baseKey = item.itemKey;
    const basePrevious = previousByKey.get(baseKey);
    const key = orderItemDiffKey(item, basePrevious);
    const current = requestedByKey.get(key);
    const previous = key === baseKey ? basePrevious : undefined;
    const startingNote = current?.note ?? (cancelMissing ? null : previous?.note ?? null);
    requestedByKey.set(key, {
      itemKey: key,
      menuItemId: item.menuItemId,
      menuItemVariantId: item.menuItemVariantId,
      quantity: (current?.quantity ?? (cancelMissing ? 0 : previous?.quantity) ?? 0) + item.quantity,
      name: item.name,
      variantName: item.variantName,
      variantVolumeMl: item.variantVolumeMl,
      inventoryAction: item.inventoryAction,
      alcoholRecipeSnapshotJson: item.alcoholRecipeSnapshotJson,
      unitPricePaise: item.unitPricePaise,
      productionUnitId: item.productionUnitId,
      saleGroupId: item.saleGroupId,
      saleGroupName: item.saleGroupName,
      saleGroupKind: item.saleGroupKind,
      ticketLabel: item.ticketLabel,
      taxComponentsJson: item.taxComponentsJson,
      note: combineItemNotes(startingNote, item.note),
      isOpenItem: item.isOpenItem
    });
  }

  const changes: KotItemChange[] = [];
  const allKeys = new Set(cancelMissing ? [...requestedByKey.keys(), ...previousByKey.keys()] : [...requestedByKey.keys()]);

  for (const key of allKeys) {
    const previous = previousByKey.get(key);
    const requested = requestedByKey.get(key);
    const menuItemId = requested?.menuItemId ?? previous?.menu_item_id;
    const menuItemVariantId = requested?.menuItemVariantId ?? previous?.menu_item_variant_id ?? null;
    let changedOrderItemId = previous?.id ?? null;

    const menuItem = menuItemId ? menuById.get(menuItemId) : undefined;
    if (menuItemId && !menuItem) throw new DomainError(`Menu item ${menuItemId} is not available`);

    const oldQuantity = previous?.quantity ?? 0;
    const newQuantity = requested?.quantity ?? 0;
    const delta = newQuantity - oldQuantity;
    const nextNote = requested ? requested.note : previous?.note ?? null;
    const noteChanged = (previous?.note ?? null) !== (nextNote ?? null);
    const unitPricePaise = requested?.unitPricePaise ?? previous?.unit_price_paise ?? menuItem?.price_paise ?? 0;
    const variantName = requested?.variantName ?? previous?.variant_name_snapshot ?? "";
    const variantVolumeMl = requested?.variantVolumeMl ?? previous?.variant_volume_ml ?? null;
    const inventoryAction = requested?.inventoryAction ?? previous?.inventory_action_snapshot ?? "none";
    const alcoholRecipeSnapshotJson = previous?.alcohol_recipe_snapshot_json ?? requested?.alcoholRecipeSnapshotJson ?? "[]";
    const productionUnitId = requested?.productionUnitId ?? previous?.production_unit_id ?? menuItem?.production_unit_id ?? null;
    const saleGroupId = requested?.saleGroupId ?? previous?.sale_group_id ?? menuItem?.sale_group_id ?? "sg-food";
    const saleGroupName = requested?.saleGroupName ?? previous?.sale_group_name_snapshot ?? menuItem?.sale_group_name ?? "Food";
    const saleGroupKind = requested?.saleGroupKind ?? previous?.sale_group_kind_snapshot ?? menuItem?.sale_group_kind ?? "food";
    const ticketLabel = (requested?.ticketLabel ?? previous?.ticket_label_snapshot ?? menuItem?.ticket_label ?? "KOT") as "KOT" | "BOT";
    const taxComponentsJson = requested?.taxComponentsJson ?? previous?.tax_components_json ?? menuItem?.tax_components_json ?? "[]";
    const isOpenItem = requested?.isOpenItem ?? Boolean(previous?.is_open_item);

    if (newQuantity > 0 && previous) {
      orm
        .update(orderItems)
        .set({
          quantity: newQuantity,
          status: "active",
          updatedAt: now,
          menuItemVariantId,
          nameSnapshot: requested?.name ?? previous.name_snapshot,
          variantNameSnapshot: variantName,
          variantVolumeMl,
          inventoryActionSnapshot: inventoryAction,
          unitPricePaise,
          productionUnitId,
          saleGroupId,
          saleGroupNameSnapshot: saleGroupName,
          saleGroupKindSnapshot: saleGroupKind,
          ticketLabelSnapshot: ticketLabel,
          taxComponentsJson,
          note: nextNote,
          isOpenItem
        })
        .where(eq(orderItems.id, previous.id))
        .run();
    } else if (newQuantity > 0) {
      const orderItemId = makeId("item");
      changedOrderItemId = orderItemId;
      orm
        .insert(orderItems)
        .values({
          id: orderItemId,
          orderId,
          menuItemId: menuItem?.id ?? null,
          menuItemVariantId,
          nameSnapshot: requested?.name ?? menuItem?.name ?? "Open item",
          variantNameSnapshot: variantName,
          variantVolumeMl,
          inventoryActionSnapshot: inventoryAction,
          alcoholRecipeSnapshotJson,
          unitPricePaise,
          quantity: newQuantity,
          productionUnitId,
          saleGroupId,
          saleGroupNameSnapshot: saleGroupName,
          saleGroupKindSnapshot: saleGroupKind,
          ticketLabelSnapshot: ticketLabel,
          taxComponentsJson,
          isOpenItem,
          note: nextNote,
          status: "active",
          createdAt: now,
          updatedAt: now
        })
        .run();
    } else if (previous) {
      orm.update(orderItems).set({ quantity: 0, status: "cancelled", updatedAt: now }).where(eq(orderItems.id, previous.id)).run();
    }

    if ((delta !== 0 || noteChanged) && productionUnitId) {
      const unit = menuItem ? null : getUnit(productionUnitId);
      changes.push({
        menuItemId: menuItem?.id ?? null,
        orderItemId: changedOrderItemId,
        name: requested?.name ?? menuItem?.name ?? "Open item",
        quantityDelta: delta,
        note: nextNote,
        noteChanged,
        productionUnitId,
        productionUnitName: menuItem?.unit_name ?? unit?.name ?? "Kitchen",
        printerHost: menuItem?.printer_host ?? unit?.printer_host ?? null,
        printerPort: menuItem?.printer_port ?? unit?.printer_port ?? null,
        printerName: menuItem?.printer_name ?? unit?.printer_name ?? null,
        ticketLabel
      });
    }
  }

  return changes;
}

export function kotChangeFromOrderItem(item: OrderItemRow, quantityDelta: number, getUnit: (productionUnitId: string) => ProductionUnitForKot | undefined): KotItemChange | null {
  if (!item.production_unit_id || quantityDelta === 0) return null;
  const unit = getUnit(item.production_unit_id);
  return {
    menuItemId: item.menu_item_id,
    orderItemId: item.id,
    name: item.name_snapshot,
    quantityDelta,
    note: item.note,
    productionUnitId: item.production_unit_id,
    productionUnitName: unit?.name ?? "Kitchen",
    printerHost: unit?.printer_host ?? null,
    printerPort: unit?.printer_port ?? null,
    printerName: unit?.printer_name ?? null,
    ticketLabel: item.ticket_label_snapshot
  };
}

function orderItemDiffKey(item: RequestedOrderItem, previous?: OrderItemRow): string {
  if (!previous || !item.menuItemId || canMergeRequestedOrderItemWithPrevious(item, previous)) return item.itemKey;
  return `${item.itemKey}:snapshot:${requestedOrderItemSnapshotHash(item)}`;
}

function canMergeRequestedOrderItemWithPrevious(requested: RequestedOrderItem, previous: OrderItemRow): boolean {
  return (
    requested.name === previous.name_snapshot &&
    requested.variantName === previous.variant_name_snapshot &&
    requested.variantVolumeMl === previous.variant_volume_ml &&
    requested.inventoryAction === previous.inventory_action_snapshot &&
    requested.alcoholRecipeSnapshotJson === previous.alcohol_recipe_snapshot_json &&
    requested.unitPricePaise === previous.unit_price_paise &&
    requested.productionUnitId === previous.production_unit_id &&
    requested.saleGroupId === previous.sale_group_id &&
    requested.saleGroupName === previous.sale_group_name_snapshot &&
    requested.saleGroupKind === previous.sale_group_kind_snapshot &&
    requested.ticketLabel === previous.ticket_label_snapshot &&
    requested.taxComponentsJson === previous.tax_components_json &&
    requested.isOpenItem === Boolean(previous.is_open_item)
  );
}

function requestedOrderItemSnapshotHash(item: RequestedOrderItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: item.name,
        variantName: item.variantName,
        variantVolumeMl: item.variantVolumeMl,
        inventoryAction: item.inventoryAction,
        alcoholRecipeSnapshotJson: item.alcoholRecipeSnapshotJson,
        unitPricePaise: item.unitPricePaise,
        productionUnitId: item.productionUnitId,
        saleGroupId: item.saleGroupId,
        saleGroupName: item.saleGroupName,
        saleGroupKind: item.saleGroupKind,
        ticketLabel: item.ticketLabel,
        taxComponentsJson: item.taxComponentsJson,
        note: item.note,
        isOpenItem: item.isOpenItem
      })
    )
    .digest("hex")
    .slice(0, 16);
}
