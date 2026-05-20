import {
  adjustAlcoholStockSchema,
  bulkDeleteAlcoholItemsSchema,
  bulkDeleteMenuItemsSchema,
  createAlcoholItemSchema,
  createFloorSchema,
  createMenuItemSchema,
  createProductionUnitSchema,
  createSaleGroupSchema,
  createTableSchema,
  importAlcoholCsvSchema,
  importCsvSchema,
  menuItemDeleteApprovalSchema,
  updateAlcoholItemSchema,
  updateFloorSchema,
  updateMenuItemSchema,
  updateProductionUnitSchema,
  updateSaleGroupSchema,
  updateTableSchema
} from "@gaurav-pos/shared";
import type { HubRouteContext } from "./route-context.js";

export function registerCatalogRoutes({ app, input, auth }: HubRouteContext): void {
  const { adminOnly, anyRole, captainOrAdmin } = auth;

  app.get("/floors", { preHandler: anyRole }, async () => input.orderService.listFloors());
  app.post("/floors", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createFloor(createFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.created", result });
    return result;
  });
  app.patch("/floors/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateFloor(params.id, updateFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.updated", result });
    return result;
  });
  app.delete("/floors/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeFloor(params.id);
    input.eventBus.publish({ type: "floor.removed", result });
    return result;
  });

  app.get("/tables", { preHandler: anyRole }, async () => input.orderService.listTables());
  app.post("/tables", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createTable(createTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.created", result });
    return result;
  });
  app.patch("/tables/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateTable(params.id, updateTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.updated", result });
    return result;
  });
  app.delete("/tables/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeTable(params.id);
    input.eventBus.publish({ type: "table.removed", result });
    return result;
  });

  app.get("/production-units", { preHandler: anyRole }, async () => input.orderService.listProductionUnits());
  app.post("/production-units", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createProductionUnit(createProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.created", result });
    return result;
  });
  app.patch("/production-units/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateProductionUnit(params.id, updateProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.updated", result });
    return result;
  });
  app.delete("/production-units/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeProductionUnit(params.id);
    input.eventBus.publish({ type: "production_unit.removed", result });
    return result;
  });

  app.get("/sale-groups", { preHandler: anyRole }, async () => input.orderService.listSaleGroups(true));
  app.post("/sale-groups", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createSaleGroup(createSaleGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "sale_group.created", result });
    return result;
  });
  app.patch("/sale-groups/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateSaleGroup(params.id, updateSaleGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "sale_group.updated", result });
    return result;
  });

  app.get("/menu-items", { preHandler: anyRole }, async (request) => {
    const query = request.query as { includeInactive?: string };
    return input.orderService.listMenuItems(query.includeInactive === "1" || query.includeInactive === "true");
  });
  app.post("/menu-items", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createMenuItem(createMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.created", result });
    return result;
  });
  app.post("/menu-items/import-csv", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.importMenuItemsFromCsv(importCsvSchema.parse(request.body).csv);
    input.eventBus.publish({ type: "menu_items.imported", result });
    return result;
  });
  app.post("/menu-items/bulk-delete", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.bulkRemoveMenuItems("dish", bulkDeleteMenuItemsSchema.parse(request.body ?? {}));
    input.eventBus.publish({ type: "menu_items.dish_bulk_removed", result });
    return result;
  });
  app.patch("/menu-items/:id/active", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { active?: boolean };
    const result = input.orderService.setMenuItemActive(params.id, Boolean(body.active));
    input.eventBus.publish({ type: "menu_item.active_changed", result });
    return result;
  });
  app.delete("/menu-items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeMenuItemWithApproval(params.id, menuItemDeleteApprovalSchema.parse(request.body ?? {}));
    input.eventBus.publish({ type: "menu_item.removed", result });
    return result;
  });
  app.patch("/menu-items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateMenuItem(params.id, updateMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.updated", result });
    return result;
  });

  app.get("/alcohol", { preHandler: captainOrAdmin }, async () => input.orderService.listAlcoholCatalog());
  app.get("/alcohol/storage", { preHandler: captainOrAdmin }, async () => input.orderService.listAlcoholStorage());
  app.post("/alcohol/items", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createAlcoholItem(createAlcoholItemSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_item.created", result });
    return result;
  });
  app.post("/alcohol/items/import-csv", { preHandler: adminOnly }, async (request) => {
    const body = importAlcoholCsvSchema.parse(request.body);
    const result = input.orderService.importAlcoholItemsFromCsv(body.csv, body.type);
    input.eventBus.publish({ type: "alcohol_items.imported", result });
    return result;
  });
  app.post("/alcohol/items/bulk-delete", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.bulkRemoveMenuItems("alcohol", bulkDeleteAlcoholItemsSchema.parse(request.body ?? {}));
    input.eventBus.publish({ type: "menu_items.alcohol_bulk_removed", result });
    return result;
  });
  app.patch("/alcohol/items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateAlcoholItem(params.id, updateAlcoholItemSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_item.updated", result });
    return result;
  });
  app.post("/alcohol/stock/:id/adjust", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.adjustAlcoholStock(params.id, adjustAlcoholStockSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_stock.adjusted", result });
    return result;
  });
}
