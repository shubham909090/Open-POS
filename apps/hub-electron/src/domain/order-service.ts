import {
  calculateLineTotal,
  calculateTax,
  type ClosePosDayInput,
  type AssignModifierGroupInput,
  type CreateModifierGroupInput,
  type CreateModifierOptionInput,
  type CreateFloorInput,
  type CreateMenuItemInput,
  type CreateNoteTemplateInput,
  type CreateProductionUnitInput,
  type CreateTableInput,
  type DomainEvent,
  type KotType,
  type OpenPosDayInput,
  type ReprintKotInput,
  type RetryPrintJobInput,
  type SettleBillInput,
  type SubmitOrderInput,
  type UpdateKotStatusInput,
  type UpdateMenuItemInput,
  type UpdateReceiptPrinterInput
} from "@gaurav-pos/shared";
import { and, count, desc, eq, inArray, max, sql, sum } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../db/database.js";
import {
  bills,
  eventLog,
  floors,
  hubSettings,
  kotItems,
  kots,
  menuItems,
  menuItemModifierGroups,
  modifierGroups,
  modifierOptions,
  noteTemplates,
  orderItems,
  orders,
  payments,
  posDays,
  printJobs,
  productionUnits,
  restaurantTables,
  syncOutbox
} from "../db/drizzle-schema.js";
import { DomainError } from "./errors.js";
import { makeId } from "./ids.js";
import { renderBillTicket, renderKotTicket, type KotTicketItem } from "./tickets.js";

const DEFAULT_GST_BPS = 500;

interface ActivePosDayRow {
  id: string;
  opening_cash_paise: number;
}

interface TableRow {
  id: string;
  name: string;
  status: string;
  current_order_id: string | null;
}

interface MenuItemRow {
  id: string;
  name: string;
  price_paise: number;
  production_unit_id: string;
  unit_name: string;
  printer_host: string;
  printer_port: number;
  printer_name: string | null;
}

interface OrderRow {
  id: string;
  table_id: string;
  pos_day_id: string;
  status: string;
  captain_id: string;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  name_snapshot: string;
  unit_price_paise: number;
  modifier_total_paise: number;
  modifiers_json: string;
  quantity: number;
  notes: string;
  production_unit_id: string;
}

interface UnitRow {
  id: string;
  name: string;
  printer_host: string;
  printer_port: number;
  printer_name: string | null;
  kds_enabled?: number;
}

interface BillRow {
  id: string;
  order_id: string;
  status: string;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
}

interface KotItemChange {
  menuItemId: string;
  orderItemId: string | null;
  name: string;
  quantityDelta: number;
  notes: string;
  modifiersJson: string;
  productionUnitId: string;
  productionUnitName: string;
  printerHost: string;
  printerPort: number;
  printerName: string | null;
}

interface ResolvedModifierSelection {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
}

interface RequestedOrderItem {
  menuItemId: string;
  quantity: number;
  notes: string;
  modifiersJson: string;
  modifiers: ResolvedModifierSelection[];
  modifierTotalPaise: number;
  displayNotes: string;
}

export class OrderService {
  constructor(private readonly orm: HubOrm) {}

  private get db(): SqliteDatabase {
    return this.orm.$client;
  }

  openPosDay(input: OpenPosDayInput): { id: string } {
    const existing = this.getOpenPosDay();
    if (existing) throw new DomainError("A POS day is already open");

    const id = makeId("day");
    const now = new Date().toISOString();

    this.orm
      .insert(posDays)
      .values({
        id,
        outletId: input.outletId,
        businessDate: input.businessDate,
        status: "open",
        openingCashPaise: input.openingCashPaise,
        openedBy: input.openedBy,
        openedAt: now
      })
      .run();

    this.appendEvent("pos_day.opened", "pos_day", id, { ...input, id });
    return { id };
  }

  closePosDay(input: ClosePosDayInput): { id: string } {
    const openDay = this.requireOpenPosDay();
    const openOrders = this.orm
      .select({ count: count() })
      .from(orders)
      .where(inArray(orders.status, ["open", "billed"]))
      .get();

    if ((openOrders?.count ?? 0) > 0) {
      throw new DomainError("Cannot close POS day while orders are open or billed");
    }

    const now = new Date().toISOString();
    this.orm
      .update(posDays)
      .set({
        status: "closed",
        closingCashPaise: input.closingCashPaise,
        closedBy: input.closedBy,
        closedAt: now
      })
      .where(eq(posDays.id, openDay.id))
      .run();

    this.appendEvent("pos_day.closed", "pos_day", openDay.id, input);
    return { id: openDay.id };
  }

  submitOrder(input: SubmitOrderInput): { orderId: string; kotIds: string[] } {
    const run = this.db.transaction(() => {
      const posDay = this.requireOpenPosDay();
      const table = this.requireTable(input.tableId);
      const now = new Date().toISOString();
      const isNewOrder = !table.current_order_id;
      const order = table.current_order_id
        ? this.requireEditableOrder(table.current_order_id)
        : this.createOrder(input, posDay.id, now);

      const previousItems = this.getOrderItems(order.id);
      const menuById = this.getMenuItems([
        ...input.items.map((item) => item.menuItemId),
        ...previousItems.map((item) => item.menu_item_id)
      ]);
      const changes = this.applyOrderItemDiff(order.id, input.items, previousItems, menuById, now);
      const kotIds = this.createKotsForChanges(order, table, changes, now, isNewOrder, false);

      this.orm
        .update(orders)
        .set({ pax: input.pax, notes: input.notes ?? null, updatedAt: now })
        .where(eq(orders.id, order.id))
        .run();

      this.orm
        .update(restaurantTables)
        .set({
          status: "occupied",
          currentOrderId: order.id,
          occupiedAt: sql`COALESCE(${restaurantTables.occupiedAt}, ${now})`
        })
        .where(eq(restaurantTables.id, table.id))
        .run();

      this.appendEvent("order.submitted", "order", order.id, {
        orderId: order.id,
        tableId: table.id,
        kotIds
      });

      return { orderId: order.id, kotIds };
    });

    return run();
  }

  cancelOrder(orderId: string, reason: string): { kotIds: string[] } {
    const run = this.db.transaction(() => {
      const order = this.requireEditableOrder(orderId);
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      const items = this.getOrderItems(order.id).filter((item) => item.quantity > 0);
      const unitById = this.getUnits([...new Set(items.map((item) => item.production_unit_id))]);

      const changes = items.map((item): KotItemChange => {
        const unit = unitById.get(item.production_unit_id);
        if (!unit) throw new DomainError(`Production unit missing for ${item.name_snapshot}`);

        return {
          menuItemId: item.menu_item_id,
          orderItemId: item.id,
          name: item.name_snapshot,
          quantityDelta: -item.quantity,
          notes: item.notes,
          modifiersJson: item.modifiers_json,
          productionUnitId: item.production_unit_id,
          productionUnitName: unit.name,
          printerHost: unit.printer_host,
          printerPort: unit.printer_port,
          printerName: unit.printer_name
        };
      });

      const kotIds = this.createKotsForChanges(order, table, changes, now, false, true, reason);

      this.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, order.id)).run();
      this.orm
        .update(orderItems)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(orderItems.orderId, order.id))
        .run();
      this.freeTable(table.id);
      this.appendEvent("order.cancelled", "order", order.id, { orderId, reason, kotIds });

      return { kotIds };
    });

    return run();
  }

  reprintKot(kotId: string, input: ReprintKotInput): { printJobId: string } {
    const run = this.db.transaction(() => {
      const kot = this.db
        .prepare(
          `SELECT k.*, o.captain_id, t.name AS table_name, u.name AS unit_name,
            u.printer_host, u.printer_port, u.printer_name
           FROM kots k
           JOIN orders o ON o.id = k.order_id
           JOIN restaurant_tables t ON t.id = o.table_id
           JOIN production_units u ON u.id = k.production_unit_id
           WHERE k.id = ?`
        )
        .get(kotId) as
        | {
            id: string;
            order_id: string;
            production_unit_id: string;
            type: KotType;
            sequence: number;
            created_at: string;
            captain_id: string;
            table_name: string;
            unit_name: string;
            printer_host: string;
            printer_port: number;
            printer_name: string | null;
          }
        | undefined;

      if (!kot) throw new DomainError("KOT not found", 404);

      const items = this.db
        .prepare("SELECT name_snapshot, quantity_delta, notes FROM kot_items WHERE kot_id = ?")
        .all(kotId) as Array<{ name_snapshot: string; quantity_delta: number; notes: string }>;

      const payload = renderKotTicket({
        sequence: kot.sequence,
        type: "reprint",
        tableName: kot.table_name,
        productionUnitName: kot.unit_name,
        captainId: kot.captain_id,
        createdAt: new Date().toISOString(),
        reason: input.reason,
        items: items.map((item) => ({
          name: item.name_snapshot,
          quantityDelta: item.quantity_delta,
          notes: item.notes
        }))
      });

      const printJobId = this.enqueuePrintJob({
        targetType: "KOT",
        targetId: kot.id,
        productionUnitId: kot.production_unit_id,
        printerHost: kot.printer_host,
        printerPort: kot.printer_port,
        printerName: kot.printer_name,
        payload
      });

      this.appendEvent("kot.reprinted", "kot", kot.id, { ...input, printJobId });
      return { printJobId };
    });

    return run();
  }

  reprintBill(billId: string, input: ReprintKotInput): { printJobId: string } {
    const run = this.db.transaction(() => {
      const bill = this.db
        .prepare(
          `SELECT b.*, t.name AS table_name
           FROM bills b
           JOIN orders o ON o.id = b.order_id
           JOIN restaurant_tables t ON t.id = o.table_id
           WHERE b.id = ?`
        )
        .get(billId) as
        | {
            id: string;
            table_name: string;
            subtotal_paise: number;
            tax_paise: number;
            total_paise: number;
            discount_paise: number;
            tip_paise: number;
            final_total_paise: number;
            created_at: string;
          }
        | undefined;

      if (!bill) throw new DomainError("Bill not found", 404);

      const payload = `${renderBillTicket({
        tableName: bill.table_name,
        billId: bill.id,
        subtotalPaise: bill.subtotal_paise,
        taxPaise: bill.tax_paise,
        totalPaise: bill.total_paise,
        discountPaise: bill.discount_paise,
        tipPaise: bill.tip_paise,
        finalTotalPaise: bill.final_total_paise,
        createdAt: new Date().toISOString()
      })}\nREPRINT\nReason: ${input.reason}\nRequested by: ${input.requestedBy}\n`;

      const printJobId = this.enqueuePrintJob({
        targetType: "BILL",
        targetId: billId,
        productionUnitId: null,
        ...this.getReceiptPrinter(),
        payload
      });

      this.appendEvent("bill.reprinted", "bill", billId, { ...input, printJobId });
      return { printJobId };
    });

    return run();
  }

  getOpenDay(): ActivePosDayRow | undefined {
    return this.getOpenPosDay();
  }

  generateBill(orderId: string): { billId: string; totalPaise: number } {
    const run = this.db.transaction(() => {
      const order = this.requireEditableOrder(orderId);
      const table = this.requireTable(order.table_id);
      const items = this.getOrderItems(orderId).filter((item) => item.quantity > 0);
      if (items.length === 0) throw new DomainError("Cannot bill an empty order");

      const subtotalPaise = items.reduce(
        (total, item) => total + calculateLineTotal(item.unit_price_paise, item.quantity),
        0
      );
      const taxPaise = calculateTax(subtotalPaise, DEFAULT_GST_BPS);
      const totalPaise = subtotalPaise + taxPaise;
      const billId = makeId("bill");
      const now = new Date().toISOString();

      this.orm
        .insert(bills)
        .values({
          id: billId,
          orderId,
          status: "pending",
          subtotalPaise,
          taxPaise,
          totalPaise,
          discountPaise: 0,
          tipPaise: 0,
          finalTotalPaise: totalPaise,
          createdAt: now
        })
        .run();

      this.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, orderId)).run();

      const payload = renderBillTicket({
        tableName: table.name,
        billId,
        subtotalPaise,
        taxPaise,
        totalPaise,
        createdAt: now
      });

      this.enqueuePrintJob({
        targetType: "BILL",
        targetId: billId,
        productionUnitId: null,
        ...this.getReceiptPrinter(),
        payload
      });

      this.appendEvent("bill.generated", "bill", billId, { orderId, totalPaise });
      return { billId, totalPaise };
    });

    return run();
  }

  settleBill(billId: string, input: SettleBillInput): {
    billId: string;
    status: string;
    paidPaise: number;
    remainingPaise: number;
    finalTotalPaise: number;
  } {
    const run = this.db.transaction(() => {
      const bill = this.getBillById(billId);
      if (!bill) throw new DomainError("Bill not found", 404);
      if (bill.status !== "pending") throw new DomainError("Bill is not pending");

      const order = this.requireOrderById(bill.order_id);
      const now = new Date().toISOString();
      const discountPaise = input.discountPaise ?? bill.discount_paise ?? 0;
      const tipPaise = input.tipPaise ?? bill.tip_paise ?? 0;
      const finalTotalPaise = Math.max(0, bill.total_paise - discountPaise + tipPaise);
      const existingPaid = this.getBillPaidPaise(billId);
      const requestedPayments =
        input.payments && input.payments.length > 0
          ? input.payments
          : input.amountPaise !== undefined
            ? [{ method: input.method ?? "cash", amountPaise: input.amountPaise }]
            : [];

      let addedPaise = 0;
      for (const payment of requestedPayments) {
        if (payment.amountPaise <= 0) continue;
        const paymentId = makeId("pay");
        this.orm
          .insert(payments)
          .values({
            id: paymentId,
            billId,
            method: payment.method ?? "cash",
            amountPaise: payment.amountPaise,
            receivedBy: input.receivedBy,
            reference: payment.reference ?? null,
            note: payment.note ?? null,
            createdAt: now
          })
          .run();
        addedPaise += payment.amountPaise;
      }

      const paidPaise = existingPaid + addedPaise;
      const remainingPaise = Math.max(0, finalTotalPaise - paidPaise);
      const isPaid = remainingPaise === 0;

      this.orm
        .update(bills)
        .set({
          discountPaise,
          tipPaise,
          finalTotalPaise,
          status: isPaid ? "paid" : "pending",
          settledAt: isPaid ? now : null
        })
        .where(eq(bills.id, billId))
        .run();

      if (isPaid) {
        this.orm.update(orders).set({ status: "paid", updatedAt: now }).where(eq(orders.id, bill.order_id)).run();
        this.freeTable(order.table_id);
        this.appendEvent("bill.settled", "bill", billId, { ...input, paidPaise, remainingPaise, finalTotalPaise });
      } else {
        this.appendEvent("payment.added", "bill", billId, { ...input, paidPaise, remainingPaise, finalTotalPaise });
      }

      return { billId, status: isPaid ? "paid" : "pending", paidPaise, remainingPaise, finalTotalPaise };
    });

    return run();
  }

  listTables(): unknown[] {
    return this.db
      .prepare(
        `SELECT t.id, t.floor_id, f.name AS floor_name, t.name, t.status, t.current_order_id, t.occupied_at
         FROM restaurant_tables t
         JOIN floors f ON f.id = t.floor_id
         ORDER BY f.name, t.name`
      )
      .all();
  }

  listKds(productionUnitId: string): unknown[] {
    const rows = this.db
      .prepare(
        `SELECT k.id, k.order_id, k.production_unit_id, k.sequence, k.type, k.status, k.reason, k.created_at,
          t.name AS table_name, o.captain_id
         FROM kots k
         JOIN orders o ON o.id = k.order_id
         JOIN restaurant_tables t ON t.id = o.table_id
         WHERE k.production_unit_id = ? AND k.status IN ('queued', 'preparing', 'ready')
         ORDER BY k.created_at ASC`
      )
      .all(productionUnitId);

    return rows.map((row) => ({
      ...(row as Record<string, unknown>),
      items: this.db
        .prepare("SELECT name_snapshot, quantity_delta, notes FROM kot_items WHERE kot_id = ? ORDER BY id")
        .all((row as { id: string }).id)
    }));
  }

  bootstrap(): unknown {
    return {
      openDay: this.getOpenPosDay(),
      floors: this.listFloors(),
      tables: this.listTables(),
      productionUnits: this.listProductionUnits(),
      menuItems: this.listMenuItems(true),
      modifierGroups: this.listModifierCatalog(),
      noteTemplates: this.listNoteTemplates(),
      printJobs: this.listPrintJobs(20),
      syncStatus: this.getSyncStatus()
    };
  }

  listFloors(): unknown[] {
    return this.db.prepare("SELECT id, name FROM floors ORDER BY name").all();
  }

  createFloor(input: CreateFloorInput): { id: string } {
    const id = this.createEntityId("floor", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: floors.id }).from(floors).where(eq(floors.id, candidate)).get())
    );
    this.orm.insert(floors).values({ id, name: input.name }).run();
    this.appendEvent("floor.created", "floor", id, { ...input, id });
    return { id };
  }

  createTable(input: CreateTableInput): { id: string } {
    this.requireFloor(input.floorId);
    const id = this.createEntityId("table", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: restaurantTables.id }).from(restaurantTables).where(eq(restaurantTables.id, candidate)).get())
    );
    this.orm
      .insert(restaurantTables)
      .values({
        id,
        floorId: input.floorId,
        name: input.name,
        status: "free",
        currentOrderId: null,
        occupiedAt: null
      })
      .run();
    this.appendEvent("table.created", "table", id, { ...input, id });
    return { id };
  }

  listProductionUnits(): unknown[] {
    return this.db
      .prepare(
        `SELECT id, name, printer_mode, printer_name, printer_host, printer_port, kds_enabled
         FROM production_units
         ORDER BY name`
      )
      .all();
  }

  createProductionUnit(input: CreateProductionUnitInput): { id: string } {
    const id = this.createEntityId("unit", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: productionUnits.id }).from(productionUnits).where(eq(productionUnits.id, candidate)).get())
    );
    const printerMode = input.printerMode ?? "system";
    this.orm
      .insert(productionUnits)
      .values({
        id,
        name: input.name,
        printerMode,
        printerName: input.printerName ?? null,
        printerHost: input.printerHost ?? "",
        printerPort: input.printerPort,
        kdsEnabled: input.kdsEnabled
      })
      .run();
    this.appendEvent("production_unit.created", "production_unit", id, { ...input, id });
    return { id };
  }

  listMenuItems(includeInactive = false): unknown[] {
    const where = includeInactive ? "" : "WHERE mi.active = 1";
    return this.db
      .prepare(
        `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id, mi.active, pu.name AS production_unit_name,
          COALESCE(GROUP_CONCAT(mimg.group_id), '') AS modifier_group_ids
         FROM menu_items mi
         JOIN production_units pu ON pu.id = mi.production_unit_id
         LEFT JOIN menu_item_modifier_groups mimg ON mimg.menu_item_id = mi.id
         ${where}
         GROUP BY mi.id
         ORDER BY mi.name`
      )
      .all()
      .map((row) => ({
        ...(row as Record<string, unknown>),
        modifier_group_ids: String((row as { modifier_group_ids?: string }).modifier_group_ids ?? "")
          .split(",")
          .filter(Boolean)
      }));
  }

  createMenuItem(input: CreateMenuItemInput): { id: string } {
    this.requireProductionUnit(input.productionUnitId);
    const id = this.createEntityId("menu", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, candidate)).get())
    );
    this.orm
      .insert(menuItems)
      .values({
        id,
        name: input.name,
        pricePaise: input.pricePaise,
        productionUnitId: input.productionUnitId,
        active: input.active
      })
      .run();
    this.appendEvent("menu_item.created", "menu_item", id, { ...input, id });
    return { id };
  }

  updateMenuItem(id: string, input: UpdateMenuItemInput): { id: string } {
    if (input.productionUnitId) this.requireProductionUnit(input.productionUnitId);
    const existing = this.orm
      .select({
        name: menuItems.name,
        pricePaise: menuItems.pricePaise,
        productionUnitId: menuItems.productionUnitId,
        active: menuItems.active
      })
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .get();
    if (!existing) throw new DomainError("Menu item not found", 404);

    this.orm
      .update(menuItems)
      .set({
        name: input.name ?? existing.name,
        pricePaise: input.pricePaise ?? existing.pricePaise,
        productionUnitId: input.productionUnitId ?? existing.productionUnitId,
        active: input.active ?? existing.active
      })
      .where(eq(menuItems.id, id))
      .run();

    this.appendEvent("menu_item.updated", "menu_item", id, { id, ...input });
    return { id };
  }

  setMenuItemActive(id: string, active: boolean): { id: string; active: boolean } {
    const result = this.orm.update(menuItems).set({ active }).where(eq(menuItems.id, id)).run();
    if (result.changes === 0) throw new DomainError("Menu item not found", 404);
    this.appendEvent("menu_item.active_changed", "menu_item", id, { id, active });
    return { id, active };
  }

  listModifierCatalog(): unknown[] {
    const groups = this.db
      .prepare(
        `SELECT id, name, selection_type, min_selections, max_selections, active, sort_order
         FROM modifier_groups
         ORDER BY sort_order, name`
      )
      .all() as Array<Record<string, unknown> & { id: string }>;
    const options = this.db
      .prepare(
        `SELECT id, group_id, name, price_delta_paise, active, sort_order
         FROM modifier_options
         ORDER BY sort_order, name`
      )
      .all() as Array<Record<string, unknown> & { group_id: string }>;

    return groups.map((group) => ({
      ...group,
      options: options.filter((option) => option.group_id === group.id)
    }));
  }

  createModifierGroup(input: CreateModifierGroupInput): { id: string } {
    if (input.selectionType === "single" && input.maxSelections !== 1) {
      throw new DomainError("Single-select modifier groups must allow exactly one option");
    }
    if (input.minSelections > input.maxSelections) throw new DomainError("Minimum selections cannot exceed maximum selections");
    const id = this.createEntityId("modgrp", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: modifierGroups.id }).from(modifierGroups).where(eq(modifierGroups.id, candidate)).get())
    );
    this.orm
      .insert(modifierGroups)
      .values({
        id,
        name: input.name,
        selectionType: input.selectionType,
        minSelections: input.minSelections,
        maxSelections: input.maxSelections,
        active: input.active,
        sortOrder: 0
      })
      .run();
    this.appendEvent("modifier_group.created", "modifier_group", id, { ...input, id });
    return { id };
  }

  createModifierOption(input: CreateModifierOptionInput): { id: string } {
    const group = this.orm.select({ id: modifierGroups.id }).from(modifierGroups).where(eq(modifierGroups.id, input.groupId)).get();
    if (!group) throw new DomainError("Modifier group not found", 404);
    const id = this.createEntityId("modopt", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: modifierOptions.id }).from(modifierOptions).where(eq(modifierOptions.id, candidate)).get())
    );
    this.orm
      .insert(modifierOptions)
      .values({
        id,
        groupId: input.groupId,
        name: input.name,
        priceDeltaPaise: input.priceDeltaPaise,
        active: input.active,
        sortOrder: 0
      })
      .run();
    this.appendEvent("modifier_option.created", "modifier_option", id, { ...input, id });
    return { id };
  }

  assignModifierGroup(input: AssignModifierGroupInput): AssignModifierGroupInput {
    const menuItem = this.orm.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, input.menuItemId)).get();
    if (!menuItem) throw new DomainError("Menu item not found", 404);
    const group = this.orm.select({ id: modifierGroups.id }).from(modifierGroups).where(eq(modifierGroups.id, input.groupId)).get();
    if (!group) throw new DomainError("Modifier group not found", 404);
    this.orm
      .insert(menuItemModifierGroups)
      .values({ menuItemId: input.menuItemId, groupId: input.groupId, sortOrder: 0 })
      .onConflictDoNothing()
      .run();
    this.appendEvent("menu_item.modifier_group_assigned", "menu_item", input.menuItemId, input);
    return input;
  }

  listNoteTemplates(includeInactive = false): unknown[] {
    const where = includeInactive ? "" : "WHERE active = 1";
    return this.db
      .prepare(
        `SELECT id, label, note, active, sort_order
         FROM note_templates
         ${where}
         ORDER BY sort_order, label`
      )
      .all();
  }

  createNoteTemplate(input: CreateNoteTemplateInput): { id: string } {
    const id = this.createEntityId("note", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: noteTemplates.id }).from(noteTemplates).where(eq(noteTemplates.id, candidate)).get())
    );
    this.orm
      .insert(noteTemplates)
      .values({ id, label: input.label, note: input.note, active: input.active, sortOrder: 0 })
      .run();
    this.appendEvent("note_template.created", "note_template", id, { ...input, id });
    return { id };
  }

  updateKotStatus(kotId: string, input: UpdateKotStatusInput): { id: string; status: string } {
    const result = this.orm.update(kots).set({ status: input.status }).where(eq(kots.id, kotId)).run();
    if (result.changes === 0) throw new DomainError("KOT not found", 404);
    this.appendEvent("kot.status_changed", "kot", kotId, { kotId, status: input.status });
    return { id: kotId, status: input.status };
  }

  getTableOrder(tableId: string): unknown {
    const table = this.requireTable(tableId);
    if (!table.current_order_id) return null;
    return this.getOrder(table.current_order_id);
  }

  getOrder(orderId: string): unknown {
    const order = this.db
      .prepare(
        `SELECT o.*, t.name AS table_name, f.name AS floor_name
         FROM orders o
         JOIN restaurant_tables t ON t.id = o.table_id
         JOIN floors f ON f.id = t.floor_id
         WHERE o.id = ?`
      )
      .get(orderId);
    if (!order) throw new DomainError("Order not found", 404);

    const items = this.db
      .prepare(
        `SELECT oi.*, pu.name AS production_unit_name
         FROM order_items oi
         JOIN production_units pu ON pu.id = oi.production_unit_id
         WHERE oi.order_id = ?
         ORDER BY oi.created_at, oi.id`
      )
      .all(orderId);
    const kots = this.db
      .prepare(
        `SELECT k.*, pu.name AS production_unit_name
         FROM kots k
         JOIN production_units pu ON pu.id = k.production_unit_id
         WHERE k.order_id = ?
         ORDER BY k.sequence`
      )
      .all(orderId)
      .map((kot) => ({
        ...(kot as Record<string, unknown>),
        items: this.db
          .prepare("SELECT name_snapshot, quantity_delta, notes FROM kot_items WHERE kot_id = ? ORDER BY id")
          .all((kot as { id: string }).id)
      }));
    const bill = this.db.prepare("SELECT * FROM bills WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").get(orderId);
    const payments = (bill
      ? this.db.prepare("SELECT * FROM payments WHERE bill_id = ? ORDER BY created_at").all((bill as { id: string }).id)
      : []) as Array<{ amount_paise: number } & Record<string, unknown>>;
    const paidPaise = payments.reduce((total, payment) => total + ((payment as { amount_paise?: number }).amount_paise ?? 0), 0);
    const billRecord = bill as ({ final_total_paise?: number; total_paise?: number } & Record<string, unknown>) | undefined;
    const finalTotalPaise = billRecord?.final_total_paise ?? billRecord?.total_paise ?? 0;

    return {
      order,
      items,
      kots,
      bill: bill
        ? {
            ...(bill as Record<string, unknown>),
            paid_paise: paidPaise,
            remaining_paise: Math.max(0, finalTotalPaise - paidPaise)
          }
        : null,
      payments
    };
  }

  listPrintJobs(limit = 50): unknown[] {
    return this.db
      .prepare(
        `SELECT id, target_type, target_id, production_unit_id, printer_host, printer_port, printer_name,
          status, attempts, last_error, created_at, updated_at
         FROM print_jobs
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit);
  }

  retryPrintJob(printJobId: string, input: RetryPrintJobInput): { id: string } {
    const now = new Date().toISOString();
    const result = this.db
      .prepare("UPDATE print_jobs SET status = 'pending', last_error = NULL, updated_at = ? WHERE id = ?")
      .run(now, printJobId);
    if (result.changes === 0) throw new DomainError("Print job not found", 404);
    this.appendEvent("print_job.retry_requested", "print_job", printJobId, { ...input, printJobId });
    return { id: printJobId };
  }

  getReceiptPrinter(): { printerHost: string | null; printerPort: number | null; printerName: string | null } {
    const host = this.getSetting("receipt_printer_host");
    const port = this.getSetting("receipt_printer_port");
    const name = this.getSetting("receipt_printer_name");
    return {
      printerHost: host || null,
      printerPort: port ? Number(port) : null,
      printerName: name || null
    };
  }

  updateReceiptPrinter(input: UpdateReceiptPrinterInput): UpdateReceiptPrinterInput {
    const now = new Date().toISOString();
    const run = this.db.transaction(() => {
      const values = [
        ["receipt_printer_mode", input.printerMode ?? "system"],
        ["receipt_printer_name", input.printerName ?? ""],
        ["receipt_printer_host", input.printerHost ?? ""],
        ["receipt_printer_port", String(input.printerPort)]
      ] as const;
      for (const [key, value] of values) {
        this.orm
          .insert(hubSettings)
          .values({ key, value, updatedAt: now })
          .onConflictDoUpdate({
            target: hubSettings.key,
            set: { value, updatedAt: now }
          })
          .run();
      }
      this.appendEvent("receipt_printer.updated", "hub_setting", "receipt_printer", input);
    });
    run();
    return input;
  }

  getSyncStatus(): unknown {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) AS count FROM sync_outbox GROUP BY status ORDER BY status")
      .all() as Array<{ status: string; count: number }>;
    const lastEvent = this.db
      .prepare("SELECT event_id, type, created_at FROM event_log ORDER BY id DESC LIMIT 1")
      .get();
    return {
      counts: Object.fromEntries(rows.map((row) => [row.status, row.count])),
      lastEvent: lastEvent ?? null
    };
  }

  getCloseSummary(): unknown {
    const openDay = this.getOpenPosDay();
    if (!openDay) {
      return {
        openDay: null,
        openOrders: 0,
        billedOrders: 0,
        paidBills: 0,
        unpaidBills: 0,
        openingCashPaise: 0,
        grossSalesPaise: 0,
        discountPaise: 0,
        tipPaise: 0,
        finalSalesPaise: 0,
        cashPaymentsPaise: 0,
        upiPaymentsPaise: 0,
        cardPaymentsPaise: 0,
        onlinePaymentsPaise: 0,
        totalPaymentsPaise: 0,
        expectedClosingCashPaise: 0
      };
    }

    const orders = this.db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM orders
         WHERE pos_day_id = ?
         GROUP BY status`
      )
      .all(openDay.id) as Array<{ status: string; count: number }>;
    const bills = this.db
      .prepare(
        `SELECT b.status, COUNT(*) AS count
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ?
         GROUP BY b.status`
      )
      .all(openDay.id) as Array<{ status: string; count: number }>;
    const payments = this.db
      .prepare(
        `SELECT p.method, COALESCE(SUM(p.amount_paise), 0) AS total
         FROM payments p
         JOIN bills b ON b.id = p.bill_id
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ?
         GROUP BY p.method`
      )
      .all(openDay.id) as Array<{ method: string; total: number }>;
    const billTotals = this.db
      .prepare(
        `SELECT
           COUNT(*) AS bill_count,
           COALESCE(SUM(total_paise), 0) AS gross_sales_paise,
           COALESCE(SUM(discount_paise), 0) AS discount_paise,
           COALESCE(SUM(tip_paise), 0) AS tip_paise,
           COALESCE(SUM(final_total_paise), 0) AS final_sales_paise
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ?`
      )
      .get(openDay.id) as {
      bill_count: number;
      gross_sales_paise: number;
      discount_paise: number;
      tip_paise: number;
      final_sales_paise: number;
    };

    const orderCounts = Object.fromEntries(orders.map((row) => [row.status, row.count]));
    const billCounts = Object.fromEntries(bills.map((row) => [row.status, row.count]));
    const paymentTotals = Object.fromEntries(payments.map((row) => [row.method, row.total]));
    const cashPaymentsPaise = paymentTotals.cash ?? 0;
    const upiPaymentsPaise = paymentTotals.upi ?? 0;
    const cardPaymentsPaise = paymentTotals.card ?? 0;
    const onlinePaymentsPaise = paymentTotals.online ?? 0;
    const totalPaymentsPaise = cashPaymentsPaise + upiPaymentsPaise + cardPaymentsPaise + onlinePaymentsPaise;

    return {
      openDay,
      openOrders: orderCounts.open ?? 0,
      billedOrders: orderCounts.billed ?? 0,
      paidBills: billCounts.paid ?? 0,
      unpaidBills: billCounts.pending ?? 0,
      openingCashPaise: openDay.opening_cash_paise,
      billCount: billTotals.bill_count,
      grossSalesPaise: billTotals.gross_sales_paise,
      discountPaise: billTotals.discount_paise,
      tipPaise: billTotals.tip_paise,
      finalSalesPaise: billTotals.final_sales_paise,
      cashPaymentsPaise,
      upiPaymentsPaise,
      cardPaymentsPaise,
      onlinePaymentsPaise,
      totalPaymentsPaise,
      nonCashPaymentsPaise: upiPaymentsPaise + cardPaymentsPaise + onlinePaymentsPaise,
      expectedClosingCashPaise: openDay.opening_cash_paise + cashPaymentsPaise
    };
  }

  private createOrder(input: SubmitOrderInput, posDayId: string, now: string): OrderRow {
    const orderId = makeId("order");
    this.orm
      .insert(orders)
      .values({
        id: orderId,
        tableId: input.tableId,
        posDayId,
        orderType: input.orderType,
        status: "open",
        pax: input.pax,
        captainId: input.captainId,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now
      })
      .run();

    return this.requireEditableOrder(orderId);
  }

  private applyOrderItemDiff(
    orderId: string,
    requestedItems: SubmitOrderInput["items"],
    previousItems: OrderItemRow[],
    menuById: Map<string, MenuItemRow>,
    now: string
  ): KotItemChange[] {
    const previousByKey = new Map(previousItems.map((item) => [this.itemKey(item.menu_item_id, item.notes, item.modifiers_json), item]));
    const requestedByKey = new Map<string, RequestedOrderItem>();

    for (const item of requestedItems) {
      const menuItem = menuById.get(item.menuItemId);
      if (!menuItem) throw new DomainError(`Menu item ${item.menuItemId} is not available`);
      const notes = item.notes?.trim() ?? "";
      const modifiers = this.resolveModifiers(item.menuItemId, item.modifiers ?? []);
      const modifiersJson = JSON.stringify(modifiers);
      const displayNotes = this.formatKitchenNotes(modifiers, notes);
      const key = this.itemKey(item.menuItemId, displayNotes, modifiersJson);
      const current = requestedByKey.get(key);
      requestedByKey.set(key, {
        menuItemId: item.menuItemId,
        quantity: (current?.quantity ?? 0) + item.quantity,
        notes,
        modifiersJson,
        modifiers,
        modifierTotalPaise: modifiers.reduce((total, modifier) => total + modifier.priceDeltaPaise, 0),
        displayNotes
      });
    }

    const changes: KotItemChange[] = [];
    const allKeys = new Set([...previousByKey.keys(), ...requestedByKey.keys()]);

    for (const key of allKeys) {
      const previous = previousByKey.get(key);
      const requested = requestedByKey.get(key);
      const menuItemId = requested?.menuItemId ?? previous?.menu_item_id;
      if (!menuItemId) continue;

      const menuItem = menuById.get(menuItemId);
      if (!menuItem) throw new DomainError(`Menu item ${menuItemId} is not available`);

      const oldQuantity = previous?.quantity ?? 0;
      const newQuantity = requested?.quantity ?? 0;
      const delta = newQuantity - oldQuantity;
      const modifiersJson = requested?.modifiersJson ?? previous?.modifiers_json ?? "[]";
      const modifierTotalPaise = requested?.modifierTotalPaise ?? previous?.modifier_total_paise ?? 0;
      const notes = requested?.displayNotes ?? previous?.notes ?? "";
      const unitPricePaise = menuItem.price_paise + modifierTotalPaise;

      if (newQuantity > 0 && previous) {
        this.orm
          .update(orderItems)
          .set({ quantity: newQuantity, status: "active", updatedAt: now, unitPricePaise, modifierTotalPaise, modifiersJson, notes })
          .where(eq(orderItems.id, previous.id))
          .run();
      } else if (newQuantity > 0) {
        const orderItemId = makeId("item");
        this.orm
          .insert(orderItems)
          .values({
            id: orderItemId,
            orderId,
            menuItemId: menuItem.id,
            nameSnapshot: menuItem.name,
            unitPricePaise,
            modifierTotalPaise,
            modifiersJson,
            quantity: newQuantity,
            notes,
            productionUnitId: menuItem.production_unit_id,
            status: "active",
            createdAt: now,
            updatedAt: now
          })
          .run();
      } else if (previous) {
        this.orm
          .update(orderItems)
          .set({ quantity: 0, status: "cancelled", updatedAt: now })
          .where(eq(orderItems.id, previous.id))
          .run();
      }

      if (delta !== 0) {
        const orderItem = previous ?? this.getOrderItemByKey(orderId, menuItem.id, notes, modifiersJson);
        changes.push({
          menuItemId: menuItem.id,
          orderItemId: orderItem?.id ?? null,
          name: menuItem.name,
          quantityDelta: delta,
          notes,
          modifiersJson,
          productionUnitId: menuItem.production_unit_id,
          productionUnitName: menuItem.unit_name,
          printerHost: menuItem.printer_host,
          printerPort: menuItem.printer_port,
          printerName: menuItem.printer_name
        });
      }
    }

    return changes;
  }

  private createKotsForChanges(
    order: OrderRow,
    table: TableRow,
    changes: KotItemChange[],
    now: string,
    isNewOrder: boolean,
    forceCancelled: boolean,
    reason?: string
  ): string[] {
    const meaningfulChanges = changes.filter((change) => change.quantityDelta !== 0);
    if (meaningfulChanges.length === 0) return [];

    const grouped = new Map<string, KotItemChange[]>();
    for (const change of meaningfulChanges) {
      const type: KotType = forceCancelled
        ? "cancelled"
        : change.quantityDelta > 0 && isNewOrder
          ? "new"
          : change.quantityDelta > 0
            ? "modified"
            : "partial_cancel";
      const key = `${change.productionUnitId}:${type}`;
      grouped.set(key, [...(grouped.get(key) ?? []), change]);
    }

    const kotIds: string[] = [];
    for (const [key, items] of grouped) {
      const [productionUnitId, type] = key.split(":") as [string, KotType];
      const firstItem = items[0];
      if (!firstItem) continue;

      const kotId = makeId("kot");
      const sequence = this.nextKotSequence();
      this.orm
        .insert(kots)
        .values({
          id: kotId,
          orderId: order.id,
          productionUnitId,
          type,
          status: "queued",
          sequence,
          reason: reason ?? null,
          createdAt: now
        })
        .run();

      const ticketItems: KotTicketItem[] = [];
      for (const item of items) {
        const kotItemId = makeId("kotitem");
        this.orm
          .insert(kotItems)
          .values({
            id: kotItemId,
            kotId,
            orderItemId: item.orderItemId,
            menuItemId: item.menuItemId,
            nameSnapshot: item.name,
            quantityDelta: item.quantityDelta,
            modifiersJson: item.modifiersJson,
            notes: item.notes
          })
          .run();
        ticketItems.push({ name: item.name, quantityDelta: item.quantityDelta, notes: item.notes });
      }

      const payload = renderKotTicket({
        sequence,
        type,
        tableName: table.name,
        productionUnitName: firstItem.productionUnitName,
        captainId: order.captain_id,
        createdAt: now,
        reason,
        items: ticketItems
      });

      this.enqueuePrintJob({
        targetType: "KOT",
        targetId: kotId,
        productionUnitId,
        printerHost: firstItem.printerHost,
        printerPort: firstItem.printerPort,
        printerName: firstItem.printerName,
        payload
      });

      this.appendEvent("kot.created", "kot", kotId, {
        orderId: order.id,
        productionUnitId,
        type,
        sequence
      });
      kotIds.push(kotId);
    }

    return kotIds;
  }

  private enqueuePrintJob(input: {
    targetType: "KOT" | "BILL";
    targetId: string;
    productionUnitId: string | null;
    printerHost: string | null;
    printerPort: number | null;
    printerName: string | null;
    payload: string;
  }): string {
    const id = makeId("print");
    const now = new Date().toISOString();
    this.orm
      .insert(printJobs)
      .values({
        id,
        targetType: input.targetType,
        targetId: input.targetId,
        productionUnitId: input.productionUnitId,
        printerHost: input.printerHost,
        printerPort: input.printerPort,
        printerName: input.printerName,
        status: "pending",
        attempts: 0,
        payload: input.payload,
        createdAt: now,
        updatedAt: now
      })
      .run();
    return id;
  }

  private appendEvent(type: string, aggregateType: string, aggregateId: string, payload: unknown): DomainEvent {
    const event: DomainEvent = {
      eventId: makeId("evt"),
      type,
      aggregateType,
      aggregateId,
      payload,
      createdAt: new Date().toISOString()
    };

    this.orm
      .insert(eventLog)
      .values({
        eventId: event.eventId,
        type: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: JSON.stringify(event.payload),
        createdAt: event.createdAt
      })
      .run();

    this.orm
      .insert(syncOutbox)
      .values({
        eventId: event.eventId,
        status: "pending",
        attempts: 0,
        createdAt: event.createdAt,
        updatedAt: event.createdAt
      })
      .run();

    return event;
  }

  private createEntityId(prefix: string, customId: string | undefined, exists: (id: string) => boolean): string {
    const requestedId = customId?.trim();
    if (requestedId) {
      if (exists(requestedId)) throw new DomainError("That custom ID is already used. Choose another one.", 409);
      return requestedId;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedId = makeId(prefix);
      if (!exists(generatedId)) return generatedId;
    }

    throw new DomainError("Could not create a unique ID. Please try again.", 500);
  }

  private getOpenPosDay(): ActivePosDayRow | undefined {
    return this.orm
      .select({ id: posDays.id, opening_cash_paise: posDays.openingCashPaise })
      .from(posDays)
      .where(eq(posDays.status, "open"))
      .orderBy(desc(posDays.openedAt))
      .limit(1)
      .get();
  }

  private requireOpenPosDay(): ActivePosDayRow {
    const openDay = this.getOpenPosDay();
    if (!openDay) throw new DomainError("Open a POS day before taking orders");
    return openDay;
  }

  private requireTable(tableId: string): TableRow {
    const table = this.orm
      .select({
        id: restaurantTables.id,
        name: restaurantTables.name,
        status: restaurantTables.status,
        current_order_id: restaurantTables.currentOrderId
      })
      .from(restaurantTables)
      .where(eq(restaurantTables.id, tableId))
      .get();
    if (!table) throw new DomainError("Table not found", 404);
    return table;
  }

  private requireFloor(floorId: string): void {
    const floor = this.orm.select({ id: floors.id }).from(floors).where(eq(floors.id, floorId)).get();
    if (!floor) throw new DomainError("Floor not found", 404);
  }

  private requireProductionUnit(productionUnitId: string): void {
    const unit = this.orm
      .select({ id: productionUnits.id })
      .from(productionUnits)
      .where(eq(productionUnits.id, productionUnitId))
      .get();
    if (!unit) throw new DomainError("Production unit not found", 404);
  }

  private requireEditableOrder(orderId: string): OrderRow {
    const order = this.selectOrderById(orderId);
    if (!order) throw new DomainError("Order not found", 404);
    if (!["open"].includes(order.status)) throw new DomainError("Order is not editable");
    return order;
  }

  private getMenuItems(ids: string[]): Map<string, MenuItemRow> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();

    const rows = this.orm
      .select({
        id: menuItems.id,
        name: menuItems.name,
        price_paise: menuItems.pricePaise,
        production_unit_id: menuItems.productionUnitId,
        unit_name: productionUnits.name,
        printer_host: productionUnits.printerHost,
        printer_port: productionUnits.printerPort,
        printer_name: productionUnits.printerName
      })
      .from(menuItems)
      .innerJoin(productionUnits, eq(productionUnits.id, menuItems.productionUnitId))
      .where(and(eq(menuItems.active, true), inArray(menuItems.id, uniqueIds)))
      .all();

    return new Map(rows.map((row) => [row.id, row]));
  }

  private getUnits(ids: string[]): Map<string, UnitRow> {
    if (ids.length === 0) return new Map();
    const rows = this.orm
      .select({
        id: productionUnits.id,
        name: productionUnits.name,
        printer_host: productionUnits.printerHost,
        printer_port: productionUnits.printerPort,
        printer_name: productionUnits.printerName
      })
      .from(productionUnits)
      .where(inArray(productionUnits.id, ids))
      .all();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private getOrderItems(orderId: string): OrderItemRow[] {
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        modifier_total_paise: orderItems.modifierTotalPaise,
        modifiers_json: orderItems.modifiersJson,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
        production_unit_id: orderItems.productionUnitId
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();
  }

  private getOrderItemByKey(orderId: string, menuItemId: string, notes: string, modifiersJson: string): OrderItemRow | undefined {
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        modifier_total_paise: orderItems.modifierTotalPaise,
        modifiers_json: orderItems.modifiersJson,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
        production_unit_id: orderItems.productionUnitId
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.menuItemId, menuItemId),
          eq(orderItems.notes, notes),
          eq(orderItems.modifiersJson, modifiersJson)
        )
      )
      .get();
  }

  private itemKey(menuItemId: string, notes: string, modifiersJson: string): string {
    return `${menuItemId}::${notes.trim()}::${modifiersJson}`;
  }

  private resolveModifiers(
    menuItemId: string,
    requested: Array<{ groupId: string; optionId: string }>
  ): ResolvedModifierSelection[] {
    const assignedGroups = this.db
      .prepare(
        `SELECT mg.id, mg.name, mg.selection_type, mg.min_selections, mg.max_selections, mg.active
         FROM menu_item_modifier_groups mimg
         JOIN modifier_groups mg ON mg.id = mimg.group_id
         WHERE mimg.menu_item_id = ? AND mg.active = 1`
      )
      .all(menuItemId) as Array<{
      id: string;
      name: string;
      selection_type: "single" | "multiple";
      min_selections: number;
      max_selections: number;
      active: number;
    }>;
    const assignedById = new Map(assignedGroups.map((group) => [group.id, group]));
    const byGroup = new Map<string, string[]>();
    for (const selection of requested) {
      if (!assignedById.has(selection.groupId)) throw new DomainError("Modifier group is not assigned to this menu item");
      byGroup.set(selection.groupId, [...(byGroup.get(selection.groupId) ?? []), selection.optionId]);
    }

    for (const group of assignedGroups) {
      const countForGroup = byGroup.get(group.id)?.length ?? 0;
      if (countForGroup < group.min_selections) throw new DomainError(`${group.name} requires at least ${group.min_selections} selection(s)`);
      if (countForGroup > group.max_selections) throw new DomainError(`${group.name} allows at most ${group.max_selections} selection(s)`);
      if (group.selection_type === "single" && countForGroup > 1) throw new DomainError(`${group.name} allows one selection`);
    }

    if (requested.length === 0) return [];
    const optionIds = [...new Set(requested.map((selection) => selection.optionId))];
    const rows = this.orm
      .select({
        id: modifierOptions.id,
        group_id: modifierOptions.groupId,
        option_name: modifierOptions.name,
        price_delta_paise: modifierOptions.priceDeltaPaise,
        active: modifierOptions.active
      })
      .from(modifierOptions)
      .where(and(eq(modifierOptions.active, true), inArray(modifierOptions.id, optionIds)))
      .all();
    const optionsById = new Map(rows.map((row) => [row.id, row]));

    return requested
      .map((selection) => {
        const group = assignedById.get(selection.groupId);
        const option = optionsById.get(selection.optionId);
        if (!group || !option || option.group_id !== group.id) throw new DomainError("Modifier option is not available");
        return {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.option_name,
          priceDeltaPaise: option.price_delta_paise
        };
      })
      .sort((left, right) => `${left.groupName}:${left.optionName}`.localeCompare(`${right.groupName}:${right.optionName}`));
  }

  private formatKitchenNotes(modifiers: ResolvedModifierSelection[], notes: string): string {
    const modifierText = modifiers.map((modifier) => `${modifier.groupName}: ${modifier.optionName}`).join("; ");
    const cleanNotes = notes.trim();
    if (modifierText && cleanNotes.startsWith(modifierText)) return cleanNotes;
    return [modifierText, cleanNotes].filter(Boolean).join(" | ");
  }

  private nextKotSequence(): number {
    const row = this.orm.select({ current: max(kots.sequence) }).from(kots).get();
    return (row?.current ?? 0) + 1;
  }

  private freeTable(tableId: string): void {
    this.orm
      .update(restaurantTables)
      .set({ status: "free", currentOrderId: null, occupiedAt: null })
      .where(eq(restaurantTables.id, tableId))
      .run();
  }

  private getSetting(key: string): string | undefined {
    const row = this.orm.select({ value: hubSettings.value }).from(hubSettings).where(eq(hubSettings.key, key)).get();
    return row?.value;
  }

  private getBillPaidPaise(billId: string): number {
    const row = this.orm.select({ paid: sum(payments.amountPaise) }).from(payments).where(eq(payments.billId, billId)).get();
    return Number(row?.paid ?? 0);
  }

  private selectOrderById(orderId: string): OrderRow | undefined {
    return this.orm
      .select({
        id: orders.id,
        table_id: orders.tableId,
        pos_day_id: orders.posDayId,
        status: orders.status,
        captain_id: orders.captainId,
        created_at: orders.createdAt,
        updated_at: orders.updatedAt
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .get();
  }

  private requireOrderById(orderId: string): OrderRow {
    const order = this.selectOrderById(orderId);
    if (!order) throw new DomainError("Order not found", 404);
    return order;
  }

  private getBillById(billId: string): BillRow | undefined {
    return this.orm
      .select({
        id: bills.id,
        order_id: bills.orderId,
        status: bills.status,
        total_paise: bills.totalPaise,
        discount_paise: bills.discountPaise,
        tip_paise: bills.tipPaise,
        final_total_paise: bills.finalTotalPaise
      })
      .from(bills)
      .where(eq(bills.id, billId))
      .get();
  }
}
