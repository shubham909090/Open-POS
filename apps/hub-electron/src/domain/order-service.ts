import {
  calculateLineTotal,
  calculateTax,
  type ClosePosDayInput,
  type CreateFloorInput,
  type CreateMenuItemInput,
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
import type { HubOrm, SqliteDatabase } from "../db/database.js";
import { DomainError } from "./errors.js";
import { makeId } from "./ids.js";
import { renderBillTicket, renderKotTicket, type KotTicketItem } from "./tickets.js";

const DEFAULT_GST_BPS = 500;

interface ActivePosDayRow {
  id: string;
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
}

interface KotItemChange {
  menuItemId: string;
  orderItemId: string | null;
  name: string;
  quantityDelta: number;
  notes: string;
  productionUnitId: string;
  productionUnitName: string;
  printerHost: string;
  printerPort: number;
  printerName: string | null;
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

    this.db
      .prepare(
        `INSERT INTO pos_days
          (id, outlet_id, business_date, status, opening_cash_paise, opened_by, opened_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?)`
      )
      .run(id, input.outletId, input.businessDate, input.openingCashPaise, input.openedBy, now);

    this.appendEvent("pos_day.opened", "pos_day", id, { ...input, id });
    return { id };
  }

  closePosDay(input: ClosePosDayInput): { id: string } {
    const openDay = this.requireOpenPosDay();
    const openOrders = this.db
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('open', 'billed')")
      .get() as { count: number };

    if (openOrders.count > 0) {
      throw new DomainError("Cannot close POS day while orders are open or billed");
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE pos_days
         SET status = 'closed', closing_cash_paise = ?, closed_by = ?, closed_at = ?
         WHERE id = ?`
      )
      .run(input.closingCashPaise, input.closedBy, now, openDay.id);

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

      const menuById = this.getMenuItems(input.items.map((item) => item.menuItemId));
      const previousItems = this.getOrderItems(order.id);
      const changes = this.applyOrderItemDiff(order.id, input.items, previousItems, menuById, now);
      const kotIds = this.createKotsForChanges(order, table, changes, now, isNewOrder, false);

      this.db
        .prepare("UPDATE orders SET pax = ?, notes = ?, updated_at = ? WHERE id = ?")
        .run(input.pax, input.notes ?? null, now, order.id);

      this.db
        .prepare(
          `UPDATE restaurant_tables
           SET status = 'occupied', current_order_id = ?, occupied_at = COALESCE(occupied_at, ?)
           WHERE id = ?`
        )
        .run(order.id, now, table.id);

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
          productionUnitId: item.production_unit_id,
          productionUnitName: unit.name,
          printerHost: unit.printer_host,
          printerPort: unit.printer_port,
          printerName: unit.printer_name
        };
      });

      const kotIds = this.createKotsForChanges(order, table, changes, now, false, true, reason);

      this.db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, order.id);
      this.db
        .prepare("UPDATE order_items SET status = 'cancelled', updated_at = ? WHERE order_id = ?")
        .run(now, order.id);
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

      this.db
        .prepare(
          `INSERT INTO bills
            (id, order_id, status, subtotal_paise, tax_paise, total_paise, created_at)
           VALUES (?, ?, 'pending', ?, ?, ?, ?)`
        )
        .run(billId, orderId, subtotalPaise, taxPaise, totalPaise, now);

      this.db.prepare("UPDATE orders SET status = 'billed', updated_at = ? WHERE id = ?").run(now, orderId);

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

  settleBill(billId: string, input: SettleBillInput): { billId: string } {
    const run = this.db.transaction(() => {
      const bill = this.db.prepare("SELECT * FROM bills WHERE id = ?").get(billId) as BillRow | undefined;
      if (!bill) throw new DomainError("Bill not found", 404);
      if (bill.status !== "pending") throw new DomainError("Bill is not pending");
      if (input.amountPaise < bill.total_paise) throw new DomainError("Payment amount is less than bill total");

      const order = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(bill.order_id) as OrderRow;
      const now = new Date().toISOString();
      const paymentId = makeId("pay");

      this.db
        .prepare(
          `INSERT INTO payments (id, bill_id, method, amount_paise, received_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(paymentId, billId, input.method, input.amountPaise, input.receivedBy, now);

      this.db.prepare("UPDATE bills SET status = 'paid', settled_at = ? WHERE id = ?").run(now, billId);
      this.db.prepare("UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ?").run(now, bill.order_id);
      this.freeTable(order.table_id);

      this.appendEvent("bill.settled", "bill", billId, { ...input, paymentId });
      return { billId };
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
      printJobs: this.listPrintJobs(20),
      syncStatus: this.getSyncStatus()
    };
  }

  listFloors(): unknown[] {
    return this.db.prepare("SELECT id, name FROM floors ORDER BY name").all();
  }

  createFloor(input: CreateFloorInput): { id: string } {
    const id = makeId("floor");
    this.db.prepare("INSERT INTO floors (id, name) VALUES (?, ?)").run(id, input.name);
    this.appendEvent("floor.created", "floor", id, { ...input, id });
    return { id };
  }

  createTable(input: CreateTableInput): { id: string } {
    this.requireFloor(input.floorId);
    const id = makeId("table");
    this.db
      .prepare(
        `INSERT INTO restaurant_tables
          (id, floor_id, name, status, current_order_id, occupied_at)
         VALUES (?, ?, ?, 'free', NULL, NULL)`
      )
      .run(id, input.floorId, input.name);
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
    const id = makeId("unit");
    const printerMode = input.printerMode ?? "system";
    this.db
      .prepare(
        `INSERT INTO production_units (id, name, printer_mode, printer_name, printer_host, printer_port, kds_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        printerMode,
        input.printerName ?? null,
        input.printerHost ?? "",
        input.printerPort,
        input.kdsEnabled ? 1 : 0
      );
    this.appendEvent("production_unit.created", "production_unit", id, { ...input, id });
    return { id };
  }

  listMenuItems(includeInactive = false): unknown[] {
    const where = includeInactive ? "" : "WHERE mi.active = 1";
    return this.db
      .prepare(
        `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id, mi.active, pu.name AS production_unit_name
         FROM menu_items mi
         JOIN production_units pu ON pu.id = mi.production_unit_id
         ${where}
         ORDER BY mi.name`
      )
      .all();
  }

  createMenuItem(input: CreateMenuItemInput): { id: string } {
    this.requireProductionUnit(input.productionUnitId);
    const id = makeId("menu");
    this.db
      .prepare(
        `INSERT INTO menu_items (id, name, price_paise, production_unit_id, active)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, input.name, input.pricePaise, input.productionUnitId, input.active ? 1 : 0);
    this.appendEvent("menu_item.created", "menu_item", id, { ...input, id });
    return { id };
  }

  updateMenuItem(id: string, input: UpdateMenuItemInput): { id: string } {
    if (input.productionUnitId) this.requireProductionUnit(input.productionUnitId);
    const existing = this.db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as
      | { name: string; price_paise: number; production_unit_id: string; active: number }
      | undefined;
    if (!existing) throw new DomainError("Menu item not found", 404);

    this.db
      .prepare(
        `UPDATE menu_items
         SET name = ?, price_paise = ?, production_unit_id = ?, active = ?
         WHERE id = ?`
      )
      .run(
        input.name ?? existing.name,
        input.pricePaise ?? existing.price_paise,
        input.productionUnitId ?? existing.production_unit_id,
        input.active === undefined ? existing.active : input.active ? 1 : 0,
        id
      );

    this.appendEvent("menu_item.updated", "menu_item", id, { id, ...input });
    return { id };
  }

  setMenuItemActive(id: string, active: boolean): { id: string; active: boolean } {
    const result = this.db.prepare("UPDATE menu_items SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    if (result.changes === 0) throw new DomainError("Menu item not found", 404);
    this.appendEvent("menu_item.active_changed", "menu_item", id, { id, active });
    return { id, active };
  }

  updateKotStatus(kotId: string, input: UpdateKotStatusInput): { id: string; status: string } {
    const result = this.db.prepare("UPDATE kots SET status = ? WHERE id = ?").run(input.status, kotId);
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
    const payments = bill
      ? this.db.prepare("SELECT * FROM payments WHERE bill_id = ? ORDER BY created_at").all((bill as { id: string }).id)
      : [];

    return { order, items, kots, bill: bill ?? null, payments };
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
    const upsert = this.db.prepare(
      `INSERT INTO hub_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    const run = this.db.transaction(() => {
      upsert.run("receipt_printer_mode", input.printerMode ?? "system", now);
      upsert.run("receipt_printer_name", input.printerName ?? "", now);
      upsert.run("receipt_printer_host", input.printerHost ?? "", now);
      upsert.run("receipt_printer_port", String(input.printerPort), now);
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
        unpaidBills: 0,
        cashPaymentsPaise: 0,
        upiPaymentsPaise: 0,
        cardPaymentsPaise: 0
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

    const orderCounts = Object.fromEntries(orders.map((row) => [row.status, row.count]));
    const billCounts = Object.fromEntries(bills.map((row) => [row.status, row.count]));
    const paymentTotals = Object.fromEntries(payments.map((row) => [row.method, row.total]));

    return {
      openDay,
      openOrders: orderCounts.open ?? 0,
      billedOrders: orderCounts.billed ?? 0,
      unpaidBills: billCounts.pending ?? 0,
      cashPaymentsPaise: paymentTotals.cash ?? 0,
      upiPaymentsPaise: paymentTotals.upi ?? 0,
      cardPaymentsPaise: paymentTotals.card ?? 0
    };
  }

  private createOrder(input: SubmitOrderInput, posDayId: string, now: string): OrderRow {
    const orderId = makeId("order");
    this.db
      .prepare(
        `INSERT INTO orders
          (id, table_id, pos_day_id, order_type, status, pax, captain_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
      )
      .run(orderId, input.tableId, posDayId, input.orderType, input.pax, input.captainId, input.notes ?? null, now, now);

    return this.requireEditableOrder(orderId);
  }

  private applyOrderItemDiff(
    orderId: string,
    requestedItems: SubmitOrderInput["items"],
    previousItems: OrderItemRow[],
    menuById: Map<string, MenuItemRow>,
    now: string
  ): KotItemChange[] {
    const previousByKey = new Map(previousItems.map((item) => [this.itemKey(item.menu_item_id, item.notes), item]));
    const requestedByKey = new Map<string, { menuItemId: string; quantity: number; notes: string }>();

    for (const item of requestedItems) {
      const notes = item.notes ?? "";
      const key = this.itemKey(item.menuItemId, notes);
      const current = requestedByKey.get(key);
      requestedByKey.set(key, {
        menuItemId: item.menuItemId,
        quantity: (current?.quantity ?? 0) + item.quantity,
        notes
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
      const notes = requested?.notes ?? previous?.notes ?? "";

      if (newQuantity > 0 && previous) {
        this.db
          .prepare("UPDATE order_items SET quantity = ?, status = 'active', updated_at = ? WHERE id = ?")
          .run(newQuantity, now, previous.id);
      } else if (newQuantity > 0) {
        const orderItemId = makeId("item");
        this.db
          .prepare(
            `INSERT INTO order_items
              (id, order_id, menu_item_id, name_snapshot, unit_price_paise, quantity, notes,
               production_unit_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          )
          .run(
            orderItemId,
            orderId,
            menuItem.id,
            menuItem.name,
            menuItem.price_paise,
            newQuantity,
            notes,
            menuItem.production_unit_id,
            now,
            now
          );
      } else if (previous) {
        this.db
          .prepare("UPDATE order_items SET quantity = 0, status = 'cancelled', updated_at = ? WHERE id = ?")
          .run(now, previous.id);
      }

      if (delta !== 0) {
        const orderItem = previous ?? this.getOrderItemByKey(orderId, menuItem.id, notes);
        changes.push({
          menuItemId: menuItem.id,
          orderItemId: orderItem?.id ?? null,
          name: menuItem.name,
          quantityDelta: delta,
          notes,
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
      this.db
        .prepare(
          `INSERT INTO kots
            (id, order_id, production_unit_id, type, status, sequence, reason, created_at)
           VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`
        )
        .run(kotId, order.id, productionUnitId, type, sequence, reason ?? null, now);

      const ticketItems: KotTicketItem[] = [];
      for (const item of items) {
        const kotItemId = makeId("kotitem");
        this.db
          .prepare(
            `INSERT INTO kot_items
              (id, kot_id, order_item_id, menu_item_id, name_snapshot, quantity_delta, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(kotItemId, kotId, item.orderItemId, item.menuItemId, item.name, item.quantityDelta, item.notes);
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
    this.db
      .prepare(
        `INSERT INTO print_jobs
          (id, target_type, target_id, production_unit_id, printer_host, printer_port, printer_name,
           status, attempts, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`
      )
      .run(
        id,
        input.targetType,
        input.targetId,
        input.productionUnitId,
        input.printerHost,
        input.printerPort,
        input.printerName,
        input.payload,
        now,
        now
      );
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

    this.db
      .prepare(
        `INSERT INTO event_log
          (event_id, type, aggregate_type, aggregate_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(event.eventId, event.type, event.aggregateType, event.aggregateId, JSON.stringify(event.payload), event.createdAt);

    this.db
      .prepare(
        `INSERT INTO sync_outbox (event_id, status, attempts, created_at, updated_at)
         VALUES (?, 'pending', 0, ?, ?)`
      )
      .run(event.eventId, event.createdAt, event.createdAt);

    return event;
  }

  private getOpenPosDay(): ActivePosDayRow | undefined {
    return this.db.prepare("SELECT id FROM pos_days WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get() as
      | ActivePosDayRow
      | undefined;
  }

  private requireOpenPosDay(): ActivePosDayRow {
    const openDay = this.getOpenPosDay();
    if (!openDay) throw new DomainError("Open a POS day before taking orders");
    return openDay;
  }

  private requireTable(tableId: string): TableRow {
    const table = this.db.prepare("SELECT * FROM restaurant_tables WHERE id = ?").get(tableId) as TableRow | undefined;
    if (!table) throw new DomainError("Table not found", 404);
    return table;
  }

  private requireFloor(floorId: string): void {
    const floor = this.db.prepare("SELECT id FROM floors WHERE id = ?").get(floorId);
    if (!floor) throw new DomainError("Floor not found", 404);
  }

  private requireProductionUnit(productionUnitId: string): void {
    const unit = this.db.prepare("SELECT id FROM production_units WHERE id = ?").get(productionUnitId);
    if (!unit) throw new DomainError("Production unit not found", 404);
  }

  private requireEditableOrder(orderId: string): OrderRow {
    const order = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as (OrderRow & {
      created_at: string;
      updated_at: string;
    }) | undefined;
    if (!order) throw new DomainError("Order not found", 404);
    if (!["open"].includes(order.status)) throw new DomainError("Order is not editable");
    return order;
  }

  private getMenuItems(ids: string[]): Map<string, MenuItemRow> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id,
          pu.name AS unit_name, pu.printer_host, pu.printer_port, pu.printer_name
         FROM menu_items mi
         JOIN production_units pu ON pu.id = mi.production_unit_id
         WHERE mi.active = 1 AND mi.id IN (${placeholders})`
      )
      .all(...uniqueIds) as MenuItemRow[];

    return new Map(rows.map((row) => [row.id, row]));
  }

  private getUnits(ids: string[]): Map<string, UnitRow> {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT id, name, printer_host, printer_port, printer_name FROM production_units WHERE id IN (${placeholders})`)
      .all(...ids) as UnitRow[];
    return new Map(rows.map((row) => [row.id, row]));
  }

  private getOrderItems(orderId: string): OrderItemRow[] {
    return this.db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId) as OrderItemRow[];
  }

  private getOrderItemByKey(orderId: string, menuItemId: string, notes: string): OrderItemRow | undefined {
    return this.db
      .prepare("SELECT * FROM order_items WHERE order_id = ? AND menu_item_id = ? AND notes = ?")
      .get(orderId, menuItemId, notes) as OrderItemRow | undefined;
  }

  private itemKey(menuItemId: string, notes: string): string {
    return `${menuItemId}::${notes.trim()}`;
  }

  private nextKotSequence(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM kots").get() as { next: number };
    return row.next;
  }

  private freeTable(tableId: string): void {
    this.db
      .prepare("UPDATE restaurant_tables SET status = 'free', current_order_id = NULL, occupied_at = NULL WHERE id = ?")
      .run(tableId);
  }

  private getSetting(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM hub_settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }
}
