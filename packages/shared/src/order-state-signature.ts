export interface OrderStateSignatureRow {
  orderItemId?: string | null;
  menuItemId?: string | null;
  menuItemVariantId?: string | null;
  openName?: string | null;
  pricePaise?: number | null;
  saleGroupId?: string | null;
  productionUnitId?: string | null;
  note?: string | null;
  quantity: number;
}

export function getOrderStateSignature(rows: OrderStateSignatureRow[]): string {
  return rows
    .flatMap((row) => {
      const orderItemId = clean(row.orderItemId);
      const quantity = normaliseQuantity(row.quantity);
      if (!orderItemId && quantity <= 0) return [];

      const menuItemId = clean(row.menuItemId);
      const menuItemVariantId = clean(row.menuItemVariantId);
      const openName = clean(row.openName);
      const pricePaise = Number.isFinite(row.pricePaise ?? Number.NaN) ? Math.trunc(row.pricePaise ?? 0) : 0;
      const saleGroupId = clean(row.saleGroupId);
      const productionUnitId = clean(row.productionUnitId);
      const note = clean(row.note);
      const identity = orderItemId
        ? `order:${orderItemId}`
        : `menu:${menuItemId}:${menuItemVariantId}:${openName}:${pricePaise}:${saleGroupId}:${productionUnitId}`;

      return [
        [
          identity,
          `menu:${menuItemId}`,
          `variant:${menuItemVariantId}`,
          `open:${openName}`,
          `price:${pricePaise}`,
          `group:${saleGroupId}`,
          `unit:${productionUnitId}`,
          `note:${note}`,
          `qty:${quantity}`
        ].join("|")
      ];
    })
    .sort()
    .join("||");
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normaliseQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
