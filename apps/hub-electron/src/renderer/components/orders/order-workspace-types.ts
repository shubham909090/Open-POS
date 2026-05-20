export type SaveMode = "save" | "save_print";

export type StateItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string;
  menuItemVariantId?: string;
  openName?: string;
  pricePaise: number;
  saleGroupId: string;
  saleGroupName?: string;
  saleGroupKind?: string;
  productionUnitId?: string | null;
  name: string;
  quantity: number;
  note?: string;
};
