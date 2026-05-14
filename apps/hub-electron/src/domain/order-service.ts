import {
  calculateLineTotal,
  calculateTaxComponents,
  type TaxComponentAmount,
  type CancelOrderInput,
  type CreateSaleGroupInput,
  type ClosePosDayInput,
  type CreateFloorInput,
  type CreateMenuItemInput,
  type CreateProductionUnitInput,
  type CreateTableInput,
  type DomainEvent,
  type ManagerApprovalInput,
  type ManagerPinInput,
  type MarkNcBillInput,
  type MoveOrderItemsInput,
  type MoveTableInput,
  type KotType,
  type OpenPosDayInput,
  type ReprintKotInput,
  type ReviseBillInput,
  type RetryPrintJobInput,
  type SettleBillInput,
  type SubmitOrderInput,
  type TicketTemplateInput,
  type UpdateSaleGroupInput,
  type UpdateFloorInput,
  type UpdateKotStatusInput,
  type UpdateMenuItemInput,
  type UpdateProductionUnitInput,
  type UpdateReceiptPrinterInput,
  type UpdateTableInput,
  type UserRole
} from "@gaurav-pos/shared";
import { and, count, desc, eq, inArray, max, sql, sum } from "drizzle-orm";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { HubOrm, SqliteDatabase } from "../db/database.js";
import {
  bills,
  billRevisions,
  dailyReportSnapshots,
  eventLog,
  floors,
  hubSettings,
  managerApprovals,
  kotItems,
  kots,
  menuItems,
  orderItems,
  orderMovements,
  orders,
  payments,
  posDays,
  printJobs,
  readyNotifications,
  productionUnits,
  restaurantTables,
  saleGroups,
  syncOutbox
} from "../db/drizzle-schema.js";
import { DomainError } from "./errors.js";
import { makeId } from "./ids.js";
import { renderBillTicket, renderKotTicket, type KotTicketItem } from "./tickets.js";

const DEFAULT_TAX_COMPONENTS = [
  { name: "CGST", rateBps: 250 },
  { name: "SGST", rateBps: 250 }
];

interface ActivePosDayRow {
  id: string;
  business_date: string;
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
  production_unit_id: string | null;
  sale_group_id: string;
  sale_group_name: string;
  sale_group_kind: string;
  ticket_label: string;
  tax_components_json: string;
  unit_name: string | null;
  printer_host: string | null;
  printer_port: number | null;
  printer_name: string | null;
}

interface OrderRow {
  id: string;
  table_id: string;
  pos_day_id: string;
  status: string;
  captain_id: string;
  captain_device_id: string | null;
  created_by_device_id: string | null;
  created_by_role: UserRole | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  unit_price_paise: number;
  quantity: number;
  production_unit_id: string | null;
  sale_group_id: string;
  sale_group_name_snapshot: string;
  sale_group_kind_snapshot: string;
  ticket_label_snapshot: string;
  tax_components_json: string;
  tax_paise: number;
  is_open_item: boolean;
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
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
  tax_breakdown_json: string;
  revision_number: number;
  is_nc: boolean;
  nc_reason: string | null;
}

interface SaleGroupRow {
  id: string;
  name: string;
  kind: string;
  report_label: string;
  ticket_label: "KOT" | "BOT";
  tax_components_json: string;
  default_production_unit_id: string | null;
}

interface BillTotals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  taxBreakdown: TaxComponentAmount[];
}

interface DaySummary {
  openDay: {
    id: string;
    business_date: string;
    opening_cash_paise: number;
  };
  openOrders: number;
  billedOrders: number;
  paidBills: number;
  unpaidBills: number;
  cancelledOrders: number;
  openingCashPaise: number;
  closingCashPaise: number | null;
  cashVariancePaise: number | null;
  billCount: number;
  grossSalesPaise: number;
  discountPaise: number;
  tipPaise: number;
  finalSalesPaise: number;
  cashPaymentsPaise: number;
  upiPaymentsPaise: number;
  cardPaymentsPaise: number;
  onlinePaymentsPaise: number;
  totalPaymentsPaise: number;
  nonCashPaymentsPaise: number;
  expectedClosingCashPaise: number;
  billSummaries: Array<{
    billId: string;
    orderId: string;
    tableName: string;
    status: string;
    totalPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalTotalPaise: number;
    paidPaise: number;
    settledAt: string | null;
    payments: Array<{ method: string; amountPaise: number; reference: string | null }>;
    isNc?: boolean;
    ncReason?: string | null;
    revisionNumber?: number;
  }>;
  itemSummaries: Array<{
    menuItemId: string;
    name: string;
    saleGroupId: string;
    saleGroupName: string;
    saleGroupKind: string;
    quantity: number;
    grossSalesPaise: number;
    ncQuantity: number;
    ncGrossSalesPaise: number;
  }>;
  groupSummaries: Array<{
    saleGroupId: string;
    name: string;
    kind: string;
    quantity: number;
    grossSalesPaise: number;
    taxPaise: number;
    finalSalesPaise: number;
    ncQuantity: number;
    ncGrossSalesPaise: number;
  }>;
}

interface KotItemChange {
  menuItemId: string | null;
  orderItemId: string | null;
  name: string;
  quantityDelta: number;
  productionUnitId: string | null;
  productionUnitName: string;
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  ticketLabel: string;
}

interface GroupSummaryAccumulator {
  saleGroupId: string;
  name: string;
  kind: string;
  quantity: number;
  grossSalesPaise: number;
  taxPaise: number;
  finalSalesPaise: number;
  ncQuantity: number;
  ncGrossSalesPaise: number;
}

interface RequestedOrderItem {
  itemKey: string;
  menuItemId: string | null;
  quantity: number;
  name: string;
  unitPricePaise: number;
  productionUnitId: string | null;
  saleGroupId: string;
  saleGroupName: string;
  saleGroupKind: string;
  ticketLabel: string;
  taxComponentsJson: string;
  isOpenItem: boolean;
}

interface DeviceActor {
  id: string;
  name: string;
  role: UserRole;
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

  closePosDay(input: ClosePosDayInput): { id: string; report: DaySummary } {
    const run = this.db.transaction(() => {
      const openDay = this.requireOpenPosDay();
      const openOrders = this.orm
        .select({ count: count() })
        .from(orders)
        .where(and(eq(orders.posDayId, openDay.id), inArray(orders.status, ["open", "billed"])))
        .get();

      if ((openOrders?.count ?? 0) > 0) {
        throw new DomainError("Cannot close POS day while orders are open or billed");
      }

      const now = new Date().toISOString();
      const report = this.buildDaySummary(openDay.id, input.closingCashPaise);
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

      this.orm
        .insert(dailyReportSnapshots)
        .values({
          posDayId: openDay.id,
          businessDate: report.openDay.business_date,
          status: "finalized",
          openingCashPaise: report.openingCashPaise,
          closingCashPaise: input.closingCashPaise,
          expectedClosingCashPaise: report.expectedClosingCashPaise,
          cashVariancePaise: report.cashVariancePaise ?? 0,
          billCount: report.billCount,
          openOrders: report.openOrders,
          billedOrders: report.billedOrders,
          paidBills: report.paidBills,
          unpaidBills: report.unpaidBills,
          cancelledOrders: report.cancelledOrders,
          grossSalesPaise: report.grossSalesPaise,
          discountPaise: report.discountPaise,
          tipPaise: report.tipPaise,
          finalSalesPaise: report.finalSalesPaise,
          cashPaymentsPaise: report.cashPaymentsPaise,
          upiPaymentsPaise: report.upiPaymentsPaise,
          cardPaymentsPaise: report.cardPaymentsPaise,
          onlinePaymentsPaise: report.onlinePaymentsPaise,
          totalPaymentsPaise: report.totalPaymentsPaise,
          nonCashPaymentsPaise: report.nonCashPaymentsPaise,
          billSummariesJson: JSON.stringify(report.billSummaries),
          itemSummariesJson: JSON.stringify(report.itemSummaries),
          groupSummariesJson: JSON.stringify(report.groupSummaries),
          finalizedAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: dailyReportSnapshots.posDayId,
          set: {
            status: "finalized",
            closingCashPaise: input.closingCashPaise,
            expectedClosingCashPaise: report.expectedClosingCashPaise,
            cashVariancePaise: report.cashVariancePaise ?? 0,
            billCount: report.billCount,
            openOrders: report.openOrders,
            billedOrders: report.billedOrders,
            paidBills: report.paidBills,
            unpaidBills: report.unpaidBills,
            cancelledOrders: report.cancelledOrders,
            grossSalesPaise: report.grossSalesPaise,
            discountPaise: report.discountPaise,
            tipPaise: report.tipPaise,
            finalSalesPaise: report.finalSalesPaise,
            cashPaymentsPaise: report.cashPaymentsPaise,
            upiPaymentsPaise: report.upiPaymentsPaise,
            cardPaymentsPaise: report.cardPaymentsPaise,
            onlinePaymentsPaise: report.onlinePaymentsPaise,
            totalPaymentsPaise: report.totalPaymentsPaise,
            nonCashPaymentsPaise: report.nonCashPaymentsPaise,
            billSummariesJson: JSON.stringify(report.billSummaries),
            itemSummariesJson: JSON.stringify(report.itemSummaries),
            groupSummariesJson: JSON.stringify(report.groupSummaries),
            finalizedAt: now,
            updatedAt: now
          }
        })
        .run();

      this.appendEvent("daily_report.finalized", "daily_report", openDay.id, {
        posDayId: openDay.id,
        businessDate: report.openDay.business_date,
        closedBy: input.closedBy,
        finalizedAt: now,
        ...report
      });
      this.appendEvent("pos_day.closed", "pos_day", openDay.id, { ...input, reportId: openDay.id });
      return { id: openDay.id, report };
    });

    return run();
  }

  submitOrder(input: SubmitOrderInput, actor?: DeviceActor): { orderId: string; kotIds: string[] } {
    const run = this.db.transaction(() => {
      const posDay = this.requireOpenPosDay();
      const table = this.requireTable(input.tableId);
      const now = new Date().toISOString();
      const normalizedItems = this.prepareSubmittedItems(input.items, now);
      const isNewOrder = !table.current_order_id;
      const order = table.current_order_id
        ? this.requireEditableOrder(table.current_order_id)
        : this.createOrder(this.orderInputForActor(input, actor), posDay.id, now, actor);
      this.assertCanEditOrder(order, actor);

      const previousItems = this.getOrderItems(order.id);
      const menuById = this.getMenuItems([
        ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
        ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
      ]);
      const changes = this.applyOrderItemDiff(order.id, normalizedItems, previousItems, menuById, now);
      const kotIds = this.createKotsForChanges(order, table, changes, now, isNewOrder, false);

      this.orm
        .update(orders)
        .set({ pax: input.pax, updatedAt: now })
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

  cancelOrder(orderId: string, input: CancelOrderInput): { kotIds: string[] } {
    const run = this.db.transaction(() => {
      const reason = input.reason;
      const requestedBy = input.requestedBy;
      this.verifyManagerApproval(input.managerApproval, "order.cancel", "order", orderId, requestedBy);
      const order = this.requireEditableOrder(orderId);
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      const items = this.getOrderItems(order.id).filter((item) => item.quantity > 0);
      const unitById = this.getUnits([...new Set(items.map((item) => item.production_unit_id).filter((id): id is string => Boolean(id)))]);

      const changes = items.flatMap((item): KotItemChange[] => {
        if (!item.production_unit_id) return [];
        const unit = unitById.get(item.production_unit_id);
        if (!unit) throw new DomainError(`Production unit missing for ${item.name_snapshot}`);

        return [{
          menuItemId: item.menu_item_id,
          orderItemId: item.id,
          name: item.name_snapshot,
          quantityDelta: -item.quantity,
          productionUnitId: item.production_unit_id,
          productionUnitName: unit.name,
          printerHost: unit.printer_host,
          printerPort: unit.printer_port,
          printerName: unit.printer_name,
          ticketLabel: item.ticket_label_snapshot as "KOT" | "BOT"
        }];
      });

      const kotIds = this.createKotsForChanges(order, table, changes, now, false, true, reason);

      this.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, order.id)).run();
      this.orm
        .update(orderItems)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(orderItems.orderId, order.id))
        .run();
      this.freeTable(table.id);
      this.appendEvent("order.cancelled", "order", order.id, { orderId, reason, requestedBy, kotIds });

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
        .prepare("SELECT name_snapshot, quantity_delta FROM kot_items WHERE kot_id = ?")
        .all(kotId) as Array<{ name_snapshot: string; quantity_delta: number }>;

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
          quantityDelta: item.quantity_delta
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
      this.verifyManagerApproval(input.managerApproval, "bill.reprint", "bill", billId, input.requestedBy);
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
            tax_breakdown_json: string;
            revision_number: number;
            is_nc: number;
            nc_reason: string | null;
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
        createdAt: new Date().toISOString(),
        taxBreakdown: this.parseTaxBreakdown(bill.tax_breakdown_json),
        revisionNumber: bill.revision_number,
        ncReason: bill.nc_reason,
        ...this.getTicketTemplate()
      })}\nREPRINT\nReason: ${input.reason}\nRequested by: ${input.requestedBy}\n`;

      const printJobId = this.enqueuePrintJob({
        targetType: "BILL",
        targetId: billId,
        productionUnitId: null,
        ...this.getReceiptPrinter(),
        payload
      });

      this.appendEvent("bill.reprinted", "bill", billId, { ...input, printJobId });
      this.orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();
      return { printJobId };
    });

    return run();
  }

  getOpenDay(): ActivePosDayRow | undefined {
    return this.getOpenPosDay();
  }

  listSaleGroups(includeInactive = true): unknown[] {
    const where = includeInactive ? "" : "WHERE sg.active = 1";
    return this.db
      .prepare(
        `SELECT sg.id, sg.name, sg.kind, sg.report_label, sg.ticket_label, sg.tax_components_json,
          sg.default_production_unit_id, pu.name AS default_production_unit_name, sg.active
         FROM sale_groups sg
         LEFT JOIN production_units pu ON pu.id = sg.default_production_unit_id
         ${where}
         ORDER BY sg.active DESC, sg.name`
      )
      .all();
  }

  createSaleGroup(input: CreateSaleGroupInput): { id: string } {
    if (input.defaultProductionUnitId) this.requireProductionUnit(input.defaultProductionUnitId);
    const id = this.createEntityId("sg", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: saleGroups.id }).from(saleGroups).where(eq(saleGroups.id, candidate)).get())
    );
    this.orm
      .insert(saleGroups)
      .values({
        id,
        name: input.name,
        kind: input.kind,
        reportLabel: input.reportLabel ?? input.name,
        ticketLabel: input.ticketLabel ?? "KOT",
        taxComponentsJson: JSON.stringify(input.taxComponents ?? []),
        defaultProductionUnitId: input.defaultProductionUnitId ?? null,
        active: input.active ?? true
      })
      .run();
    this.appendEvent("sale_group.created", "sale_group", id, { ...input, id });
    return { id };
  }

  updateSaleGroup(id: string, input: UpdateSaleGroupInput): { id: string } {
    if (input.defaultProductionUnitId) this.requireProductionUnit(input.defaultProductionUnitId);
    const result = this.orm
      .update(saleGroups)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.reportLabel !== undefined ? { reportLabel: input.reportLabel } : {}),
        ...(input.ticketLabel !== undefined ? { ticketLabel: input.ticketLabel } : {}),
        ...(input.taxComponents !== undefined ? { taxComponentsJson: JSON.stringify(input.taxComponents) } : {}),
        ...(input.defaultProductionUnitId !== undefined ? { defaultProductionUnitId: input.defaultProductionUnitId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      })
      .where(eq(saleGroups.id, id))
      .run();
    if (result.changes === 0) throw new DomainError("Sale group not found", 404);
    this.appendEvent("sale_group.updated", "sale_group", id, { id, ...input });
    return { id };
  }

  setManagerPin(input: ManagerPinInput): { configured: boolean } {
    const currentHash = this.getSetting("manager_pin_hash");
    if (currentHash) this.verifyManagerApproval({ pin: input.currentPin ?? "", reason: "Manager PIN changed", approvedBy: input.updatedBy }, "manager_pin.update", "hub_setting", "manager_pin");
    this.upsertSetting("manager_pin_hash", this.hashManagerPin(input.newPin));
    this.appendEvent("manager_pin.updated", "hub_setting", "manager_pin", { updatedBy: input.updatedBy });
    return { configured: true };
  }

  getTicketTemplate(): TicketTemplateInput {
    return {
      billHeader: this.getSetting("ticket_bill_header") ?? "",
      billFooter: this.getSetting("ticket_bill_footer") ?? "",
      kotHeader: this.getSetting("ticket_kot_header") ?? "",
      kotFooter: this.getSetting("ticket_kot_footer") ?? "",
      restaurantName: this.getSetting("ticket_restaurant_name") ?? "",
      taxRegistrationText: this.getSetting("ticket_tax_registration_text") ?? ""
    };
  }

  updateTicketTemplate(input: TicketTemplateInput): TicketTemplateInput {
    this.upsertSetting("ticket_bill_header", input.billHeader ?? "");
    this.upsertSetting("ticket_bill_footer", input.billFooter ?? "");
    this.upsertSetting("ticket_kot_header", input.kotHeader ?? "");
    this.upsertSetting("ticket_kot_footer", input.kotFooter ?? "");
    this.upsertSetting("ticket_restaurant_name", input.restaurantName ?? "");
    this.upsertSetting("ticket_tax_registration_text", input.taxRegistrationText ?? "");
    this.appendEvent("ticket_template.updated", "hub_setting", "ticket_template", input);
    return this.getTicketTemplate();
  }

  generateBill(orderId: string): { billId: string; totalPaise: number } {
    const run = this.db.transaction(() => {
      const order = this.requireEditableOrder(orderId);
      const table = this.requireTable(order.table_id);
      const items = this.getOrderItems(orderId).filter((item) => item.quantity > 0);
      if (items.length === 0) throw new DomainError("Cannot bill an empty order");

      const totals = this.calculateBillTotals(items);
      const billId = makeId("bill");
      const now = new Date().toISOString();

      this.orm
        .insert(bills)
        .values({
          id: billId,
          orderId,
          status: "pending",
          subtotalPaise: totals.subtotalPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          discountPaise: 0,
          tipPaise: 0,
          finalTotalPaise: totals.totalPaise,
          taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
          revisionNumber: 1,
          createdAt: now
        })
        .run();

      this.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, orderId)).run();
      this.orm.update(restaurantTables).set({ status: "billed" }).where(eq(restaurantTables.id, table.id)).run();
      this.recordBillRevision(billId, 1, totals, "Initial bill", "cashier", now);

      this.appendEvent("bill.generated", "bill", billId, { orderId, totalPaise: totals.totalPaise, taxBreakdown: totals.taxBreakdown });
      return { billId, totalPaise: totals.totalPaise };
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
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      const discountPaise = this.calculateDiscountPaise(bill.total_paise, input);
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
          settledAt: isPaid ? now : null,
          printCount: isPaid ? sql`${bills.printCount} + 1` : sql`${bills.printCount}`
        })
        .where(eq(bills.id, billId))
        .run();

      if (isPaid) {
        this.orm.update(orders).set({ status: "paid", updatedAt: now }).where(eq(orders.id, bill.order_id)).run();
        this.freeTable(order.table_id);
        const payload = renderBillTicket({
          tableName: table.name,
          billId,
          subtotalPaise: bill.subtotal_paise,
          taxPaise: bill.tax_paise,
          totalPaise: bill.total_paise,
          discountPaise,
          tipPaise,
          finalTotalPaise,
          createdAt: now,
          taxBreakdown: this.parseTaxBreakdown(bill.tax_breakdown_json),
          revisionNumber: bill.revision_number,
          ncReason: bill.nc_reason,
          ...this.getTicketTemplate()
        });
        this.enqueuePrintJob({
          targetType: "BILL",
          targetId: billId,
          productionUnitId: null,
          ...this.getReceiptPrinter(),
          payload
        });
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
        `SELECT t.id, t.floor_id, f.name AS floor_name, t.name, t.active, t.status, t.current_order_id, t.occupied_at
         FROM restaurant_tables t
         JOIN floors f ON f.id = t.floor_id
         ORDER BY t.active DESC, f.name, t.name`
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
        .prepare("SELECT name_snapshot, quantity_delta FROM kot_items WHERE kot_id = ? ORDER BY id")
        .all((row as { id: string }).id)
    }));
  }

  bootstrap(): unknown {
    return {
      openDay: this.getOpenPosDay(),
      floors: this.listFloors(),
      tables: this.listTables(),
      productionUnits: this.listProductionUnits(),
      saleGroups: this.listSaleGroups(true),
      menuItems: this.listMenuItems(true),
      ticketTemplate: this.getTicketTemplate(),
      printJobs: this.listPrintJobs(20),
      syncStatus: this.getSyncStatus()
    };
  }

  listFloors(): unknown[] {
    return this.db.prepare("SELECT id, name, active FROM floors ORDER BY active DESC, name").all();
  }

  createFloor(input: CreateFloorInput): { id: string } {
    const id = this.createEntityId("floor", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: floors.id }).from(floors).where(eq(floors.id, candidate)).get())
    );
    this.orm.insert(floors).values({ id, name: input.name, active: input.active ?? true }).run();
    this.appendEvent("floor.created", "floor", id, { ...input, id });
    return { id };
  }

  updateFloor(id: string, input: UpdateFloorInput): { id: string } {
    const result = this.orm
      .update(floors)
      .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) })
      .where(eq(floors.id, id))
      .run();
    if (result.changes === 0) throw new DomainError("Floor not found", 404);
    this.appendEvent("floor.updated", "floor", id, { id, ...input });
    return { id };
  }

  removeFloor(id: string): { id: string; deleted: boolean; active: boolean } {
    const usage = this.orm.select({ count: count() }).from(restaurantTables).where(eq(restaurantTables.floorId, id)).get()?.count ?? 0;
    if (usage > 0) {
      this.updateFloor(id, { active: false });
      return { id, deleted: false, active: false };
    }
    const result = this.orm.delete(floors).where(eq(floors.id, id)).run();
    if (result.changes === 0) throw new DomainError("Floor not found", 404);
    this.appendEvent("floor.deleted", "floor", id, { id });
    return { id, deleted: true, active: false };
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
        active: input.active ?? true,
        status: "free",
        currentOrderId: null,
        occupiedAt: null
      })
      .run();
    this.appendEvent("table.created", "table", id, { ...input, id });
    return { id };
  }

  updateTable(id: string, input: UpdateTableInput): { id: string } {
    if (input.floorId) this.requireFloor(input.floorId);
    const result = this.orm
      .update(restaurantTables)
      .set({
        ...(input.floorId !== undefined ? { floorId: input.floorId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      })
      .where(eq(restaurantTables.id, id))
      .run();
    if (result.changes === 0) throw new DomainError("Table not found", 404);
    this.appendEvent("table.updated", "table", id, { id, ...input });
    return { id };
  }

  removeTable(id: string): { id: string; deleted: boolean; active: boolean } {
    const table = this.requireTable(id);
    if (table.current_order_id) throw new DomainError("Settle or cancel the active order before removing this table");
    const usage = this.orm.select({ count: count() }).from(orders).where(eq(orders.tableId, id)).get()?.count ?? 0;
    if (usage > 0) {
      this.updateTable(id, { active: false });
      return { id, deleted: false, active: false };
    }
    const result = this.orm.delete(restaurantTables).where(eq(restaurantTables.id, id)).run();
    if (result.changes === 0) throw new DomainError("Table not found", 404);
    this.appendEvent("table.deleted", "table", id, { id });
    return { id, deleted: true, active: false };
  }

  listProductionUnits(): unknown[] {
    return this.db
      .prepare(
        `SELECT id, name, printer_mode, printer_name, printer_host, printer_port, kds_enabled, active
         FROM production_units
         ORDER BY active DESC, name`
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
        printerPort: input.printerPort ?? 9100,
        kdsEnabled: input.kdsEnabled ?? true,
        active: input.active ?? true
      })
      .run();
    this.appendEvent("production_unit.created", "production_unit", id, { ...input, id });
    return { id };
  }

  updateProductionUnit(id: string, input: UpdateProductionUnitInput): { id: string } {
    const result = this.orm
      .update(productionUnits)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.printerMode !== undefined ? { printerMode: input.printerMode } : {}),
        ...(input.printerName !== undefined ? { printerName: input.printerName } : {}),
        ...(input.printerHost !== undefined ? { printerHost: input.printerHost } : {}),
        ...(input.printerPort !== undefined ? { printerPort: input.printerPort } : {}),
        ...(input.kdsEnabled !== undefined ? { kdsEnabled: input.kdsEnabled } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      })
      .where(eq(productionUnits.id, id))
      .run();
    if (result.changes === 0) throw new DomainError("Kitchen / counter not found", 404);
    this.appendEvent("production_unit.updated", "production_unit", id, { id, ...input });
    return { id };
  }

  removeProductionUnit(id: string): { id: string; deleted: boolean; active: boolean } {
    const menuUsage = this.orm.select({ count: count() }).from(menuItems).where(eq(menuItems.productionUnitId, id)).get()?.count ?? 0;
    const orderUsage = this.orm.select({ count: count() }).from(orderItems).where(eq(orderItems.productionUnitId, id)).get()?.count ?? 0;
    const kotUsage = this.orm.select({ count: count() }).from(kots).where(eq(kots.productionUnitId, id)).get()?.count ?? 0;
    if (menuUsage + orderUsage + kotUsage > 0) {
      this.updateProductionUnit(id, { active: false });
      return { id, deleted: false, active: false };
    }
    const result = this.orm.delete(productionUnits).where(eq(productionUnits.id, id)).run();
    if (result.changes === 0) throw new DomainError("Kitchen / counter not found", 404);
    this.appendEvent("production_unit.deleted", "production_unit", id, { id });
    return { id, deleted: true, active: false };
  }

  listMenuItems(includeInactive = false): unknown[] {
    const where = includeInactive ? "" : "WHERE mi.active = 1";
    return this.db
      .prepare(
        `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id, mi.sale_group_id, mi.active,
          pu.name AS production_unit_name,
          sg.name AS sale_group_name,
          sg.kind AS sale_group_kind,
          sg.ticket_label
         FROM menu_items mi
         JOIN sale_groups sg ON sg.id = mi.sale_group_id
         LEFT JOIN production_units pu ON pu.id = mi.production_unit_id
         ${where}
         ORDER BY mi.active DESC, sg.name, mi.name`
      )
      .all();
  }

  createMenuItem(input: CreateMenuItemInput): { id: string } {
    if (input.productionUnitId) this.requireProductionUnit(input.productionUnitId);
    this.requireSaleGroup(input.saleGroupId ?? "sg-food");
    const id = this.createEntityId("menu", input.customId, (candidate) =>
      Boolean(this.orm.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, candidate)).get())
    );
    this.orm
      .insert(menuItems)
      .values({
        id,
        name: input.name,
        pricePaise: input.pricePaise,
        productionUnitId: input.productionUnitId ?? null,
        saleGroupId: input.saleGroupId ?? "sg-food",
        active: input.active ?? true
      })
      .run();
    this.appendEvent("menu_item.created", "menu_item", id, { ...input, id });
    return { id };
  }

  updateMenuItem(id: string, input: UpdateMenuItemInput): { id: string } {
    if (input.productionUnitId) this.requireProductionUnit(input.productionUnitId);
    if (input.saleGroupId) this.requireSaleGroup(input.saleGroupId);
    const existing = this.orm
      .select({
        name: menuItems.name,
        pricePaise: menuItems.pricePaise,
        productionUnitId: menuItems.productionUnitId,
        saleGroupId: menuItems.saleGroupId,
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
        productionUnitId: input.productionUnitId !== undefined ? input.productionUnitId : existing.productionUnitId,
        saleGroupId: input.saleGroupId ?? existing.saleGroupId,
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

  removeMenuItem(id: string): { id: string; deleted: boolean; active: boolean } {
    const usage = this.orm.select({ count: count() }).from(orderItems).where(eq(orderItems.menuItemId, id)).get()?.count ?? 0;
    if (usage > 0) {
      this.setMenuItemActive(id, false);
      return { id, deleted: false, active: false };
    }
    const result = this.orm.delete(menuItems).where(eq(menuItems.id, id)).run();
    if (result.changes === 0) throw new DomainError("Dish not found", 404);
    this.appendEvent("menu_item.deleted", "menu_item", id, { id });
    return { id, deleted: true, active: false };
  }

  updateKotStatus(kotId: string, input: UpdateKotStatusInput): { id: string; status: string } {
    const run = this.db.transaction(() => {
      const result = this.orm.update(kots).set({ status: input.status }).where(eq(kots.id, kotId)).run();
      if (result.changes === 0) throw new DomainError("KOT not found", 404);
      if (input.status === "ready") this.createReadyNotification(kotId);
      this.appendEvent("kot.status_changed", "kot", kotId, { kotId, status: input.status });
      return { id: kotId, status: input.status };
    });
    return run();
  }

  listReadyNotifications(actor: DeviceActor): unknown[] {
    if (actor.role !== "captain") return [];
    const rows = this.orm
      .select()
      .from(readyNotifications)
      .where(
        and(
          eq(readyNotifications.captainDeviceId, actor.id),
          eq(readyNotifications.status, "unread")
        )
      )
      .orderBy(desc(readyNotifications.createdAt))
      .limit(20)
      .all();
    const now = new Date().toISOString();
    for (const row of rows) {
      this.orm.update(readyNotifications).set({ status: "seen", acknowledgedAt: now }).where(eq(readyNotifications.id, row.id)).run();
    }
    return rows.map((row) => ({
      id: row.id,
      kotId: row.kotId,
      orderId: row.orderId,
      tableId: row.tableId,
      tableName: row.tableName,
      productionUnitName: row.productionUnitName,
      items: JSON.parse(row.itemsJson) as Array<{ name: string; quantity: number }>,
      createdAt: row.createdAt
    }));
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
         LEFT JOIN production_units pu ON pu.id = oi.production_unit_id
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
          .prepare("SELECT name_snapshot, quantity_delta FROM kot_items WHERE kot_id = ? ORDER BY id")
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
        nonCashPaymentsPaise: 0,
        expectedClosingCashPaise: 0
      };
    }

    return this.buildDaySummary(openDay.id);
  }

  listDailyReports(limit = 30): unknown[] {
    return this.db
      .prepare(
        `SELECT pos_day_id, business_date, status, bill_count, gross_sales_paise, final_sales_paise,
          total_payments_paise, cash_variance_paise, finalized_at
         FROM daily_report_snapshots
         ORDER BY business_date DESC, finalized_at DESC
         LIMIT ?`
      )
      .all(limit);
  }

  getDailyReport(posDayId: string): unknown {
    const row = this.db.prepare("SELECT * FROM daily_report_snapshots WHERE pos_day_id = ?").get(posDayId) as
      | (Record<string, unknown> & { bill_summaries_json: string; item_summaries_json: string; group_summaries_json?: string })
      | undefined;
    if (!row) throw new DomainError("Daily report not found", 404);
    return {
      ...row,
      billSummaries: JSON.parse(row.bill_summaries_json),
      itemSummaries: JSON.parse(row.item_summaries_json),
      groupSummaries: row.group_summaries_json ? JSON.parse(row.group_summaries_json) : []
    };
  }

  reviseBill(billId: string, input: ReviseBillInput): { billId: string; revisionNumber: number; totalPaise: number; kotIds: string[] } {
    const run = this.db.transaction(() => {
      this.verifyManagerApproval(input.managerApproval, "bill.revise", "bill", billId, input.managerApproval.approvedBy);
      const bill = this.getBillById(billId);
      if (!bill) throw new DomainError("Bill not found", 404);
      if (bill.status !== "pending") throw new DomainError("Only pending printed bills can be revised");
      if (this.getBillPaidPaise(billId) > 0) throw new DomainError("Remove or reverse recorded payments before revising this bill");
      const order = this.requireOrderById(bill.order_id);
      if (!["billed", "open"].includes(order.status)) throw new DomainError("Order cannot be revised");
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      const normalizedItems = this.prepareSubmittedItems(input.items, now);
      const previousItems = this.getOrderItems(order.id);
      const menuById = this.getMenuItems([
        ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
        ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
      ]);
      const changes = this.applyOrderItemDiff(order.id, normalizedItems, previousItems, menuById, now, true);
      const kotIds = this.createKotsForChanges(order, table, changes, now, false, false, input.managerApproval.reason);
      const totals = this.calculateBillTotals(this.getOrderItems(order.id).filter((item) => item.quantity > 0));
      const revisionNumber = (bill.revision_number ?? 1) + 1;

      this.orm
        .update(bills)
        .set({
          subtotalPaise: totals.subtotalPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          finalTotalPaise: Math.max(0, totals.totalPaise - bill.discount_paise + bill.tip_paise),
          taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
          revisionNumber,
          status: "pending"
        })
        .where(eq(bills.id, billId))
        .run();
      this.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, order.id)).run();
      this.orm.update(restaurantTables).set({ status: "billed" }).where(eq(restaurantTables.id, table.id)).run();
      this.recordBillRevision(billId, revisionNumber, totals, input.managerApproval.reason, input.managerApproval.approvedBy, now);
      this.appendEvent("bill.revised", "bill", billId, { billId, revisionNumber, totalPaise: totals.totalPaise, kotIds });
      return { billId, revisionNumber, totalPaise: totals.totalPaise, kotIds };
    });
    return run();
  }

  markBillNc(billId: string, input: MarkNcBillInput): { billId: string; printJobId: string } {
    const run = this.db.transaction(() => {
      this.verifyManagerApproval(input.managerApproval, "bill.nc", "bill", billId, input.managerApproval.approvedBy);
      const bill = this.getBillById(billId);
      if (!bill) throw new DomainError("Bill not found", 404);
      if (bill.status !== "pending") throw new DomainError("Only unpaid bills can be marked NC");
      const existingPaid = this.getBillPaidPaise(billId);
      if (existingPaid > 0) throw new DomainError("Remove or reverse recorded payments before marking this bill NC");
      const order = this.requireOrderById(bill.order_id);
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      this.orm
        .update(bills)
        .set({
          isNc: true,
          ncReason: input.managerApproval.reason,
          ncApprovedBy: input.managerApproval.approvedBy,
          ncMarkedAt: now,
          status: "paid",
          settledAt: now,
          printCount: sql`${bills.printCount} + 1`
        })
        .where(eq(bills.id, billId))
        .run();
      this.orm.update(orders).set({ status: "paid", updatedAt: now }).where(eq(orders.id, order.id)).run();
      this.freeTable(order.table_id);

      const printJobId = this.enqueuePrintJob({
        targetType: "BILL",
        targetId: billId,
        productionUnitId: null,
        ...this.getReceiptPrinter(),
        payload: renderBillTicket({
          tableName: table.name,
          billId,
          subtotalPaise: bill.subtotal_paise,
          taxPaise: bill.tax_paise,
          totalPaise: bill.total_paise,
          discountPaise: bill.discount_paise,
          tipPaise: bill.tip_paise,
          finalTotalPaise: bill.final_total_paise,
          createdAt: now,
          taxBreakdown: this.parseTaxBreakdown(bill.tax_breakdown_json),
          revisionNumber: bill.revision_number,
          ncReason: input.managerApproval.reason,
          ...this.getTicketTemplate()
        })
      });
      this.appendEvent("bill.nc_marked", "bill", billId, { billId, reason: input.managerApproval.reason, printJobId });
      return { billId, printJobId };
    });
    return run();
  }

  printBill(billId: string, requestedBy: string): { printJobId: string } {
    const run = this.db.transaction(() => {
      const bill = this.getBillById(billId);
      if (!bill) throw new DomainError("Bill not found", 404);
      const order = this.requireOrderById(bill.order_id);
      const table = this.requireTable(order.table_id);
      const now = new Date().toISOString();
      const printJobId = this.enqueuePrintJob({
        targetType: "BILL",
        targetId: billId,
        productionUnitId: null,
        ...this.getReceiptPrinter(),
        payload: renderBillTicket({
          tableName: table.name,
          billId,
          subtotalPaise: bill.subtotal_paise,
          taxPaise: bill.tax_paise,
          totalPaise: bill.total_paise,
          discountPaise: bill.discount_paise,
          tipPaise: bill.tip_paise,
          finalTotalPaise: bill.final_total_paise,
          createdAt: now,
          taxBreakdown: this.parseTaxBreakdown(bill.tax_breakdown_json),
          revisionNumber: bill.revision_number,
          ncReason: bill.nc_reason,
          ...this.getTicketTemplate()
        })
      });
      this.orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();
      this.appendEvent("bill.printed", "bill", billId, { billId, requestedBy, printJobId });
      return { printJobId };
    });
    return run();
  }

  moveTable(input: MoveTableInput, actor: DeviceActor): { fromTableId: string; toTableId: string; orderId: string; kotIds: string[] } {
    const run = this.db.transaction(() => {
      const fromTable = this.requireTable(input.fromTableId);
      const toTable = this.requireTable(input.toTableId);
      if (!fromTable.current_order_id) throw new DomainError("Source table has no running order");
      if (toTable.current_order_id) throw new DomainError("Target table already has a running order");
      const order = this.requireOrderById(fromTable.current_order_id);
      this.assertCanMoveOrder(order, actor, "table");
      const now = new Date().toISOString();
      this.orm.update(orders).set({ tableId: toTable.id, updatedAt: now }).where(eq(orders.id, order.id)).run();
      this.freeTable(fromTable.id);
      this.orm
        .update(restaurantTables)
        .set({ status: order.status === "billed" ? "billed" : "occupied", currentOrderId: order.id, occupiedAt: now })
        .where(eq(restaurantTables.id, toTable.id))
        .run();
      const kotIds = this.createKotsForChanges(
        order,
        { ...toTable, current_order_id: order.id, status: order.status === "billed" ? "billed" : "occupied" },
        this.getOrderItems(order.id)
          .filter((item) => item.quantity > 0)
          .map((item) => this.kotChangeFromOrderItem(item, item.quantity))
          .filter((change): change is KotItemChange => Boolean(change)),
        now,
        false,
        false,
        `Table shifted from ${fromTable.name} to ${toTable.name}: ${input.reason}`
      );
      const movementId = makeId("move");
      this.orm
        .insert(orderMovements)
        .values({
          id: movementId,
          fromTableId: fromTable.id,
          toTableId: toTable.id,
          sourceOrderId: order.id,
          movedItemsJson: JSON.stringify({ type: "table" }),
          reason: input.reason,
          movedBy: actor.name,
          createdAt: now
        })
        .run();
      this.appendEvent("table.shifted", "order", order.id, { ...input, movedBy: actor.name, movedByDeviceId: actor.id, orderId: order.id, movementId, kotIds });
      return { fromTableId: fromTable.id, toTableId: toTable.id, orderId: order.id, kotIds };
    });
    return run();
  }

  moveOrderItems(input: MoveOrderItemsInput, actor: DeviceActor): { fromOrderId: string; toOrderId: string; movementId: string; sourceKotIds: string[]; targetKotIds: string[] } {
    const run = this.db.transaction(() => {
      const fromTable = this.requireTable(input.fromTableId);
      const toTable = this.requireTable(input.toTableId);
      if (!fromTable.current_order_id) throw new DomainError("Source table has no running order");
      const fromOrder = this.requireEditableOrder(fromTable.current_order_id);
      this.assertCanMoveOrder(fromOrder, actor, "items");
      const now = new Date().toISOString();
      const posDay = this.requireOpenPosDay();
      const toOrder = toTable.current_order_id
        ? this.requireEditableOrder(toTable.current_order_id)
        : this.createOrder({ tableId: toTable.id, captainId: actor.name, pax: 1, orderType: "dine_in" }, posDay.id, now, actor);
      if (toTable.current_order_id) this.assertCanMoveOrder(toOrder, actor, "items");
      const movementPayload: Array<{ orderItemId: string; quantity: number; name: string }> = [];
      const sourceChanges: KotItemChange[] = [];
      const targetChanges: KotItemChange[] = [];

      for (const moveItem of input.items) {
        const source = this.getOrderItemById(moveItem.orderItemId);
        if (!source || source.order_id !== fromOrder.id || source.quantity < moveItem.quantity) {
          throw new DomainError("Cannot shift more items than the source table has");
        }
        const target = source.menu_item_id ? this.getOrderItemByKey(toOrder.id, source.menu_item_id) : undefined;
        let targetOrderItemId = target?.id;
        if (target) {
          this.orm
            .update(orderItems)
            .set({ quantity: target.quantity + moveItem.quantity, status: "active", updatedAt: now })
            .where(eq(orderItems.id, target.id))
            .run();
        } else {
          targetOrderItemId = makeId("item");
          this.orm
            .insert(orderItems)
            .values({
              id: targetOrderItemId,
              orderId: toOrder.id,
              menuItemId: source.menu_item_id,
              nameSnapshot: source.name_snapshot,
              unitPricePaise: source.unit_price_paise,
              quantity: moveItem.quantity,
              productionUnitId: source.production_unit_id,
              saleGroupId: source.sale_group_id,
              saleGroupNameSnapshot: source.sale_group_name_snapshot,
              saleGroupKindSnapshot: source.sale_group_kind_snapshot,
              ticketLabelSnapshot: source.ticket_label_snapshot,
              taxComponentsJson: source.tax_components_json,
              taxPaise: source.tax_paise,
              isOpenItem: Boolean(source.is_open_item),
              status: "active",
              createdAt: now,
              updatedAt: now
            })
            .run();
        }
        const sourceChange = this.kotChangeFromOrderItem(source, -moveItem.quantity);
        if (sourceChange) sourceChanges.push(sourceChange);
        const targetChange = this.kotChangeFromOrderItem(source, moveItem.quantity);
        if (targetChange) targetChanges.push({ ...targetChange, orderItemId: targetOrderItemId ?? source.id });
        const remaining = source.quantity - moveItem.quantity;
        this.orm
          .update(orderItems)
          .set({ quantity: remaining, status: remaining === 0 ? "cancelled" : "active", updatedAt: now })
          .where(eq(orderItems.id, source.id))
          .run();
        movementPayload.push({ orderItemId: source.id, quantity: moveItem.quantity, name: source.name_snapshot });
      }

      if (this.getOrderItems(fromOrder.id).every((item) => item.quantity === 0)) {
        this.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, fromOrder.id)).run();
        this.freeTable(fromTable.id);
      }
      this.orm
        .update(restaurantTables)
        .set({ status: "occupied", currentOrderId: toOrder.id, occupiedAt: sql`COALESCE(${restaurantTables.occupiedAt}, ${now})` })
        .where(eq(restaurantTables.id, toTable.id))
        .run();
      const sourceKotIds = this.createKotsForChanges(
        fromOrder,
        fromTable,
        sourceChanges,
        now,
        false,
        false,
        `Items shifted to ${toTable.name}: ${input.reason}`
      );
      const targetKotIds = this.createKotsForChanges(
        toOrder,
        { ...toTable, current_order_id: toOrder.id, status: "occupied" },
        targetChanges,
        now,
        false,
        false,
        `Items shifted from ${fromTable.name}: ${input.reason}`
      );

      const movementId = makeId("move");
      this.orm
        .insert(orderMovements)
        .values({
          id: movementId,
          fromTableId: fromTable.id,
          toTableId: toTable.id,
          sourceOrderId: fromOrder.id,
          targetOrderId: toOrder.id,
          movedItemsJson: JSON.stringify(movementPayload),
          reason: input.reason,
          movedBy: actor.name,
          createdAt: now
        })
        .run();
      this.appendEvent("order_items.shifted", "order", fromOrder.id, {
        ...input,
        movedBy: actor.name,
        movedByDeviceId: actor.id,
        toOrderId: toOrder.id,
        movementId,
        sourceKotIds,
        targetKotIds
      });
      return { fromOrderId: fromOrder.id, toOrderId: toOrder.id, movementId, sourceKotIds, targetKotIds };
    });
    return run();
  }

  private buildDaySummary(posDayId: string, closingCashPaise?: number): DaySummary {
    const openDay = this.db
      .prepare("SELECT id, business_date, opening_cash_paise FROM pos_days WHERE id = ?")
      .get(posDayId) as { id: string; business_date: string; opening_cash_paise: number } | undefined;
    if (!openDay) throw new DomainError("POS day not found", 404);

    const orders = this.db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM orders
         WHERE pos_day_id = ?
         GROUP BY status`
      )
      .all(posDayId) as Array<{ status: string; count: number }>;
    const bills = this.db
      .prepare(
        `SELECT b.status, COUNT(*) AS count
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ?
         GROUP BY b.status`
      )
      .all(posDayId) as Array<{ status: string; count: number }>;
    const payments = this.db
      .prepare(
        `SELECT p.method, COALESCE(SUM(p.amount_paise), 0) AS total
         FROM payments p
         JOIN bills b ON b.id = p.bill_id
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ? AND b.is_nc = 0
         GROUP BY p.method`
      )
      .all(posDayId) as Array<{ method: string; total: number }>;
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
         WHERE o.pos_day_id = ? AND b.is_nc = 0`
      )
      .get(posDayId) as {
      bill_count: number;
      gross_sales_paise: number;
      discount_paise: number;
      tip_paise: number;
      final_sales_paise: number;
    };
    const billRows = this.db
      .prepare(
        `SELECT b.id AS bill_id, b.order_id, b.status, b.total_paise, b.discount_paise, b.tip_paise,
          b.final_total_paise, b.settled_at, b.is_nc, b.nc_reason, b.revision_number, t.name AS table_name
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         JOIN restaurant_tables t ON t.id = o.table_id
         WHERE o.pos_day_id = ?
         ORDER BY b.created_at ASC`
      )
      .all(posDayId) as Array<{
      bill_id: string;
      order_id: string;
      table_name: string;
      status: string;
      total_paise: number;
      discount_paise: number;
      tip_paise: number;
      final_total_paise: number;
      settled_at: string | null;
      is_nc: number;
      nc_reason: string | null;
      revision_number: number;
    }>;
    const paymentRows = this.db
      .prepare(
        `SELECT p.bill_id, p.method, p.amount_paise, p.reference
         FROM payments p
         JOIN bills b ON b.id = p.bill_id
         JOIN orders o ON o.id = b.order_id
         WHERE o.pos_day_id = ? AND b.is_nc = 0
         ORDER BY p.created_at ASC`
      )
      .all(posDayId) as Array<{ bill_id: string; method: string; amount_paise: number; reference: string | null }>;
    const itemSummaries = this.db
      .prepare(
        `SELECT COALESCE(oi.menu_item_id, oi.id) AS menu_item_id, oi.name_snapshot AS name, oi.sale_group_id, oi.sale_group_name_snapshot,
          oi.sale_group_kind_snapshot,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity ELSE 0 END), 0) AS quantity,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS gross_sales_paise,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity ELSE 0 END), 0) AS nc_quantity,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS nc_gross_sales_paise
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN bills b ON b.order_id = o.id
         WHERE o.pos_day_id = ? AND oi.status != 'cancelled'
         GROUP BY COALESCE(oi.menu_item_id, oi.id), oi.name_snapshot, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot
         ORDER BY oi.name_snapshot ASC`
      )
      .all(posDayId) as Array<{
        menu_item_id: string;
        name: string;
        sale_group_id: string;
        sale_group_name_snapshot: string;
        sale_group_kind_snapshot: string;
        quantity: number;
        gross_sales_paise: number;
        nc_quantity: number;
        nc_gross_sales_paise: number;
      }>;
    const groupSummaries = this.db
      .prepare(
        `SELECT oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity ELSE 0 END), 0) AS quantity,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS gross_sales_paise,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.tax_paise ELSE 0 END), 0) AS tax_paise,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity ELSE 0 END), 0) AS nc_quantity,
          COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS nc_gross_sales_paise
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN bills b ON b.order_id = o.id
         WHERE o.pos_day_id = ? AND oi.status != 'cancelled'
         GROUP BY oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot
         ORDER BY oi.sale_group_name_snapshot`
      )
      .all(posDayId) as Array<{
        sale_group_id: string;
        sale_group_name_snapshot: string;
        sale_group_kind_snapshot: string;
        quantity: number;
        gross_sales_paise: number;
        tax_paise: number;
        nc_quantity: number;
        nc_gross_sales_paise: number;
      }>;
    const billGroupRows = this.db
      .prepare(
        `SELECT b.id AS bill_id, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot,
          COALESCE(SUM(oi.quantity * oi.unit_price_paise), 0) AS gross_sales_paise,
          COALESCE(SUM(oi.tax_paise), 0) AS tax_paise
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN bills b ON b.order_id = o.id
         WHERE o.pos_day_id = ? AND oi.status != 'cancelled' AND b.is_nc = 0
         GROUP BY b.id, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot`
      )
      .all(posDayId) as Array<{
        bill_id: string;
        sale_group_id: string;
        sale_group_name_snapshot: string;
        sale_group_kind_snapshot: string;
        gross_sales_paise: number;
        tax_paise: number;
      }>;
    const groupSummaryMap = new Map<string, GroupSummaryAccumulator>();
    for (const group of groupSummaries) {
      groupSummaryMap.set(group.sale_group_id, {
        saleGroupId: group.sale_group_id,
        name: group.sale_group_name_snapshot,
        kind: group.sale_group_kind_snapshot,
        quantity: group.quantity,
        grossSalesPaise: group.gross_sales_paise,
        taxPaise: group.tax_paise,
        finalSalesPaise: 0,
        ncQuantity: group.nc_quantity,
        ncGrossSalesPaise: group.nc_gross_sales_paise
      });
    }
    const billRowsById = new Map(billRows.map((bill) => [bill.bill_id, bill]));
    const billGroupRowsByBill = new Map<string, typeof billGroupRows>();
    for (const row of billGroupRows) {
      billGroupRowsByBill.set(row.bill_id, [...(billGroupRowsByBill.get(row.bill_id) ?? []), row]);
    }
    for (const [billId, rows] of billGroupRowsByBill.entries()) {
      const bill = billRowsById.get(billId);
      if (!bill || bill.is_nc) continue;
      const bases = rows.map((row) => row.gross_sales_paise + row.tax_paise);
      const discountShares = this.allocateByWeight(bill.discount_paise, bases);
      const tipShares = this.allocateByWeight(bill.tip_paise, bases);
      rows.forEach((row, index) => {
        const summary = groupSummaryMap.get(row.sale_group_id);
        if (!summary) return;
        summary.finalSalesPaise += row.gross_sales_paise + row.tax_paise - (discountShares[index] ?? 0) + (tipShares[index] ?? 0);
      });
    }

    const orderCounts = Object.fromEntries(orders.map((row) => [row.status, row.count]));
    const billCounts = Object.fromEntries(bills.map((row) => [row.status, row.count]));
    const paymentTotals = Object.fromEntries(payments.map((row) => [row.method, row.total]));
    const cashPaymentsPaise = paymentTotals.cash ?? 0;
    const upiPaymentsPaise = paymentTotals.upi ?? 0;
    const cardPaymentsPaise = paymentTotals.card ?? 0;
    const onlinePaymentsPaise = paymentTotals.online ?? 0;
    const totalPaymentsPaise = cashPaymentsPaise + upiPaymentsPaise + cardPaymentsPaise + onlinePaymentsPaise;
    const expectedClosingCashPaise = openDay.opening_cash_paise + cashPaymentsPaise;
    const paymentsByBill = new Map<string, Array<{ method: string; amountPaise: number; reference: string | null }>>();
    for (const payment of paymentRows) {
      const list = paymentsByBill.get(payment.bill_id) ?? [];
      list.push({ method: payment.method, amountPaise: payment.amount_paise, reference: payment.reference });
      paymentsByBill.set(payment.bill_id, list);
    }

    return {
      openDay,
      openOrders: orderCounts.open ?? 0,
      billedOrders: orderCounts.billed ?? 0,
      paidBills: billCounts.paid ?? 0,
      unpaidBills: billCounts.pending ?? 0,
      cancelledOrders: orderCounts.cancelled ?? 0,
      openingCashPaise: openDay.opening_cash_paise,
      closingCashPaise: closingCashPaise ?? null,
      cashVariancePaise: closingCashPaise === undefined ? null : closingCashPaise - expectedClosingCashPaise,
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
      expectedClosingCashPaise,
      billSummaries: billRows.map((bill) => ({
        billId: bill.bill_id,
        orderId: bill.order_id,
        tableName: bill.table_name,
        status: bill.status,
        totalPaise: bill.total_paise,
        discountPaise: bill.discount_paise,
        tipPaise: bill.tip_paise,
        finalTotalPaise: bill.final_total_paise,
        paidPaise: (paymentsByBill.get(bill.bill_id) ?? []).reduce((total, payment) => total + payment.amountPaise, 0),
        settledAt: bill.settled_at,
        payments: paymentsByBill.get(bill.bill_id) ?? [],
        isNc: Boolean(bill.is_nc),
        ncReason: bill.nc_reason,
        revisionNumber: bill.revision_number
      })),
      itemSummaries: itemSummaries.map((item) => ({
        menuItemId: item.menu_item_id,
        name: item.name,
        saleGroupId: item.sale_group_id,
        saleGroupName: item.sale_group_name_snapshot,
        saleGroupKind: item.sale_group_kind_snapshot,
        quantity: item.quantity,
        grossSalesPaise: item.gross_sales_paise,
        ncQuantity: item.nc_quantity,
        ncGrossSalesPaise: item.nc_gross_sales_paise
      })),
      groupSummaries: [...groupSummaryMap.values()]
    };
  }

  private prepareSubmittedItems(items: SubmitOrderInput["items"], now: string): RequestedOrderItem[] {
    return items
      .filter((item) => item.quantity > 0)
      .map((item) => {
        if (item.menuItemId) {
          const menuItem = this.getMenuItems([item.menuItemId]).get(item.menuItemId);
          if (!menuItem) throw new DomainError(`Menu item ${item.menuItemId} is not available`);
          if (item.unitPricePaise !== undefined && item.unitPricePaise !== menuItem.price_paise) {
            this.verifyManagerApproval(item.managerApproval, "order_item.price_edit", "menu_item", menuItem.id, item.managerApproval?.approvedBy ?? "cashier");
          }
          return {
            itemKey: this.itemKey(menuItem.id),
            menuItemId: menuItem.id,
            quantity: item.quantity,
            name: menuItem.name,
            unitPricePaise: item.unitPricePaise ?? menuItem.price_paise,
            productionUnitId: item.productionUnitId !== undefined ? item.productionUnitId : menuItem.production_unit_id,
            saleGroupId: menuItem.sale_group_id,
            saleGroupName: menuItem.sale_group_name,
            saleGroupKind: menuItem.sale_group_kind,
            ticketLabel: menuItem.ticket_label,
            taxComponentsJson: menuItem.tax_components_json,
            isOpenItem: false
          };
        }

        const saleGroup = this.requireSaleGroup(item.saleGroupId ?? "sg-food");
        if (!item.openPricePaise) throw new DomainError("Open item price is required");
        const productionUnitId = item.productionUnitId !== undefined ? item.productionUnitId : saleGroup.default_production_unit_id;
        if (productionUnitId) this.requireProductionUnit(productionUnitId);
        const existingOpenItemId = item.orderItemId?.trim();
        return {
          itemKey: existingOpenItemId ? `open:${existingOpenItemId}` : `open:${makeId("line")}`,
          menuItemId: null,
          quantity: item.quantity,
          name: item.openName ?? "Open item",
          unitPricePaise: item.openPricePaise,
          productionUnitId,
          saleGroupId: saleGroup.id,
          saleGroupName: saleGroup.name,
          saleGroupKind: saleGroup.kind,
          ticketLabel: saleGroup.ticket_label,
          taxComponentsJson: saleGroup.tax_components_json,
          isOpenItem: true
        };
      });
  }

  private calculateBillTotals(items: OrderItemRow[]): BillTotals {
    const taxByName = new Map<string, number>();
    let subtotalPaise = 0;
    let taxPaise = 0;
    for (const item of items) {
      const lineSubtotal = calculateLineTotal(item.unit_price_paise, item.quantity);
      subtotalPaise += lineSubtotal;
      const components = calculateTaxComponents(lineSubtotal, this.parseTaxComponents(item.tax_components_json));
      const itemTax = components.reduce((total, component) => total + component.amountPaise, 0);
      taxPaise += itemTax;
      for (const component of components) {
        const key = `${item.sale_group_name_snapshot} ${component.name}`.trim();
        taxByName.set(key, (taxByName.get(key) ?? 0) + component.amountPaise);
      }
      this.orm.update(orderItems).set({ taxPaise: itemTax }).where(eq(orderItems.id, item.id)).run();
    }
    return {
      subtotalPaise,
      taxPaise,
      totalPaise: subtotalPaise + taxPaise,
      taxBreakdown: [...taxByName.entries()].map(([name, amountPaise]) => ({ name, rateBps: 0, amountPaise }))
    };
  }

  private parseTaxComponents(value: string | null | undefined): Array<{ name: string; rateBps: number }> {
    if (!value) return DEFAULT_TAX_COMPONENTS;
    try {
      const parsed = JSON.parse(value) as Array<{ name?: unknown; rateBps?: unknown }>;
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TAX_COMPONENTS;
      return parsed
        .map((component) => ({ name: String(component.name ?? "Tax"), rateBps: Number(component.rateBps ?? 0) }))
        .filter((component) => component.name && Number.isFinite(component.rateBps));
    } catch {
      return DEFAULT_TAX_COMPONENTS;
    }
  }

  private parseTaxBreakdown(value: string | null | undefined): TaxComponentAmount[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as TaxComponentAmount[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private recordBillRevision(billId: string, revisionNumber: number, totals: BillTotals, reason: string, changedBy: string, now: string): void {
    this.orm
      .insert(billRevisions)
      .values({
        id: makeId("billrev"),
        billId,
        revisionNumber,
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        discountPaise: 0,
        tipPaise: 0,
        finalTotalPaise: totals.totalPaise,
        taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
        reason,
        approvedBy: changedBy,
        createdAt: now
      })
      .run();
  }

  private hashManagerPin(pin: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256").toString("hex");
    return `pbkdf2-sha256:210000:${salt}:${hash}`;
  }

  private legacyHashManagerPin(pin: string): string {
    return createHash("sha256").update(`gaurav-pos:${pin}`).digest("hex");
  }

  private verifyManagerPin(pin: string, configuredHash: string): "valid" | "valid_legacy" | "invalid" {
    const parts = configuredHash.split(":");
    if (parts[0] === "pbkdf2-sha256" && parts.length === 4) {
      const iterations = Number(parts[1]);
      const salt = parts[2];
      const hash = parts[3];
      if (!Number.isInteger(iterations) || iterations < 100_000 || !salt || !hash) return "invalid";
      const expected = Buffer.from(hash, "hex");
      if (expected.length === 0) return "invalid";
      const actual = pbkdf2Sync(pin, salt, iterations, expected.length, "sha256");
      return timingSafeEqual(actual, expected) ? "valid" : "invalid";
    }
    return this.legacyHashManagerPin(pin) === configuredHash ? "valid_legacy" : "invalid";
  }

  private verifyManagerApproval(
    approval: ManagerApprovalInput | undefined,
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy = "cashier"
  ): void {
    const configuredHash = this.getSetting("manager_pin_hash");
    if (!configuredHash) throw new DomainError("Set a manager PIN before using manager-only actions", 403);
    if (!approval) throw new DomainError("Manager approval is required for this action", 403);
    const verification = this.verifyManagerPin(approval.pin, configuredHash);
    if (verification === "invalid") throw new DomainError("Manager PIN is incorrect", 403);
    if (verification === "valid_legacy") this.upsertSetting("manager_pin_hash", this.hashManagerPin(approval.pin));
    this.orm
      .insert(managerApprovals)
      .values({
        id: makeId("approval"),
        action,
        aggregateType,
        aggregateId,
        reason: approval.reason,
        approvedBy: approval.approvedBy,
        requestedBy,
        createdAt: new Date().toISOString()
      })
      .run();
  }

  private upsertSetting(key: string, value: string): void {
    const now = new Date().toISOString();
    this.orm
      .insert(hubSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: hubSettings.key, set: { value, updatedAt: now } })
      .run();
  }

  private requireSaleGroup(id: string): SaleGroupRow {
    const group = this.db
      .prepare(
        `SELECT id, name, kind, report_label, ticket_label, tax_components_json, default_production_unit_id
         FROM sale_groups
         WHERE id = ? AND active = 1`
      )
      .get(id) as SaleGroupRow | undefined;
    if (!group) throw new DomainError("Sale group not found", 404);
    return group;
  }

  private orderInputForActor(input: SubmitOrderInput, actor?: DeviceActor): Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string } {
    return {
      tableId: input.tableId,
      captainId: actor?.name || input.captainId || "cashier",
      pax: input.pax,
      orderType: input.orderType
    };
  }

  private assertCanEditOrder(order: OrderRow, actor?: DeviceActor): void {
    if (!actor || ["admin", "cashier", "waiter"].includes(actor.role)) return;
    if (actor.role === "captain" && order.captain_device_id === actor.id) return;
    throw new DomainError("Captain devices can only edit their own running tables", 403);
  }

  private assertCanMoveOrder(order: OrderRow, actor: DeviceActor, action: "table" | "items"): void {
    if (["admin", "cashier"].includes(actor.role)) {
      if (action === "items" && order.status !== "open") throw new DomainError("Only running tables can have selected items shifted");
      if (action === "table" && !["open", "billed"].includes(order.status)) throw new DomainError("Only running or billed tables can be shifted");
      return;
    }
    if (actor.role !== "captain") throw new DomainError("Only captains can shift tables from the APK", 403);
    if (order.status !== "open") throw new DomainError("Captains can shift only running tables before billing", 403);
    if (order.captain_device_id !== actor.id) throw new DomainError("Captains can shift only their own tables", 403);
  }

  private createOrder(input: Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string }, posDayId: string, now: string, actor?: DeviceActor): OrderRow {
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
        captainDeviceId: actor?.role === "captain" ? actor.id : null,
        createdByDeviceId: actor?.id ?? null,
        createdByRole: actor?.role ?? null,
        createdAt: now,
        updatedAt: now
      })
      .run();

    return this.requireEditableOrder(orderId);
  }

  private applyOrderItemDiff(
    orderId: string,
    requestedItems: RequestedOrderItem[],
    previousItems: OrderItemRow[],
    menuById: Map<string, MenuItemRow>,
    now: string,
    cancelMissing = false
  ): KotItemChange[] {
    const previousByKey = new Map(previousItems.map((item) => [this.itemKey(item.menu_item_id, item.id), item]));
    const requestedByKey = new Map<string, RequestedOrderItem>();

    for (const item of requestedItems) {
      const menuItem = item.menuItemId ? menuById.get(item.menuItemId) : undefined;
      if (item.menuItemId && !menuItem) throw new DomainError(`Menu item ${item.menuItemId} is not available`);
      const key = item.itemKey;
      const current = requestedByKey.get(key);
      const previous = previousByKey.get(key);
      requestedByKey.set(key, {
        itemKey: key,
        menuItemId: item.menuItemId,
        quantity: (current?.quantity ?? previous?.quantity ?? 0) + item.quantity,
        name: item.name,
        unitPricePaise: item.unitPricePaise,
        productionUnitId: item.productionUnitId,
        saleGroupId: item.saleGroupId,
        saleGroupName: item.saleGroupName,
        saleGroupKind: item.saleGroupKind,
        ticketLabel: item.ticketLabel,
        taxComponentsJson: item.taxComponentsJson,
        isOpenItem: item.isOpenItem
      });
    }

    const changes: KotItemChange[] = [];
    const allKeys = new Set(cancelMissing ? [...requestedByKey.keys(), ...previousByKey.keys()] : [...requestedByKey.keys()]);

    for (const key of allKeys) {
      const previous = previousByKey.get(key);
      const requested = requestedByKey.get(key);
      const menuItemId = requested?.menuItemId ?? previous?.menu_item_id;
      let changedOrderItemId = previous?.id ?? null;

      const menuItem = menuItemId ? menuById.get(menuItemId) : undefined;
      if (menuItemId && !menuItem) throw new DomainError(`Menu item ${menuItemId} is not available`);

      const oldQuantity = previous?.quantity ?? 0;
      const newQuantity = requested?.quantity ?? 0;
      const delta = newQuantity - oldQuantity;
      const unitPricePaise = requested?.unitPricePaise ?? previous?.unit_price_paise ?? menuItem?.price_paise ?? 0;
      const productionUnitId = requested?.productionUnitId ?? previous?.production_unit_id ?? menuItem?.production_unit_id ?? null;
      const saleGroupId = requested?.saleGroupId ?? previous?.sale_group_id ?? menuItem?.sale_group_id ?? "sg-food";
      const saleGroupName = requested?.saleGroupName ?? previous?.sale_group_name_snapshot ?? menuItem?.sale_group_name ?? "Food";
      const saleGroupKind = requested?.saleGroupKind ?? previous?.sale_group_kind_snapshot ?? menuItem?.sale_group_kind ?? "food";
      const ticketLabel = (requested?.ticketLabel ?? previous?.ticket_label_snapshot ?? menuItem?.ticket_label ?? "KOT") as "KOT" | "BOT";
      const taxComponentsJson = requested?.taxComponentsJson ?? previous?.tax_components_json ?? menuItem?.tax_components_json ?? "[]";
      const isOpenItem = requested?.isOpenItem ?? Boolean(previous?.is_open_item);

      if (newQuantity > 0 && previous) {
        this.orm
          .update(orderItems)
          .set({
            quantity: newQuantity,
            status: "active",
            updatedAt: now,
            unitPricePaise,
            productionUnitId,
            saleGroupId,
            saleGroupNameSnapshot: saleGroupName,
            saleGroupKindSnapshot: saleGroupKind,
            ticketLabelSnapshot: ticketLabel,
            taxComponentsJson,
            isOpenItem
          })
          .where(eq(orderItems.id, previous.id))
          .run();
      } else if (newQuantity > 0) {
        const orderItemId = makeId("item");
        changedOrderItemId = orderItemId;
        this.orm
          .insert(orderItems)
          .values({
            id: orderItemId,
            orderId,
            menuItemId: menuItem?.id ?? null,
            nameSnapshot: requested?.name ?? menuItem?.name ?? "Open item",
            unitPricePaise,
            quantity: newQuantity,
            productionUnitId,
            saleGroupId,
            saleGroupNameSnapshot: saleGroupName,
            saleGroupKindSnapshot: saleGroupKind,
            ticketLabelSnapshot: ticketLabel,
            taxComponentsJson,
            isOpenItem,
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

      if (delta !== 0 && productionUnitId) {
        const unit = menuItem ? null : this.getUnit(productionUnitId);
        changes.push({
          menuItemId: menuItem?.id ?? null,
          orderItemId: changedOrderItemId,
          name: requested?.name ?? menuItem?.name ?? "Open item",
          quantityDelta: delta,
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

  private createKotsForChanges(
    order: OrderRow,
    table: TableRow,
    changes: KotItemChange[],
    now: string,
    isNewOrder: boolean,
    forceCancelled: boolean,
    reason?: string
  ): string[] {
    const meaningfulChanges = changes.filter((change) => change.quantityDelta !== 0 && change.productionUnitId);
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
      const key = `${change.productionUnitId}:${type}:${change.ticketLabel}`;
      grouped.set(key, [...(grouped.get(key) ?? []), change]);
    }

    const kotIds: string[] = [];
    for (const [key, items] of grouped) {
      const [productionUnitId, type, ticketLabel] = key.split(":") as [string, KotType, "KOT" | "BOT"];
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
            quantityDelta: item.quantityDelta
          })
          .run();
        ticketItems.push({ name: item.name, quantityDelta: item.quantityDelta });
      }

      const payload = renderKotTicket({
        sequence,
        type,
        tableName: table.name,
        productionUnitName: firstItem.productionUnitName,
        captainId: order.captain_id,
        createdAt: now,
        reason,
        items: ticketItems,
        ticketLabel,
        header: this.getTicketTemplate().kotHeader,
        footer: this.getTicketTemplate().kotFooter
      });

      this.enqueuePrintJob({
        targetType: ticketLabel,
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
    targetType: "KOT" | "BOT" | "BILL";
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
      .select({ id: posDays.id, business_date: posDays.businessDate, opening_cash_paise: posDays.openingCashPaise })
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

    const placeholders = uniqueIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT mi.id, mi.name, mi.price_paise,
          COALESCE(mi.production_unit_id, sg.default_production_unit_id) AS production_unit_id,
          sg.id AS sale_group_id,
          sg.name AS sale_group_name,
          sg.kind AS sale_group_kind,
          sg.ticket_label,
          sg.tax_components_json,
          pu.name AS unit_name,
          pu.printer_host,
          pu.printer_port,
          pu.printer_name
         FROM menu_items mi
         JOIN sale_groups sg ON sg.id = mi.sale_group_id
         LEFT JOIN production_units pu ON pu.id = COALESCE(mi.production_unit_id, sg.default_production_unit_id)
         WHERE mi.id IN (${placeholders})`
      )
      .all(...uniqueIds) as MenuItemRow[];

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

  private kotChangeFromOrderItem(item: OrderItemRow, quantityDelta: number): KotItemChange | null {
    if (!item.production_unit_id || quantityDelta === 0) return null;
    const unit = this.getUnit(item.production_unit_id);
    return {
      menuItemId: item.menu_item_id,
      orderItemId: item.id,
      name: item.name_snapshot,
      quantityDelta,
      productionUnitId: item.production_unit_id,
      productionUnitName: unit?.name ?? "Kitchen",
      printerHost: unit?.printer_host ?? null,
      printerPort: unit?.printer_port ?? null,
      printerName: unit?.printer_name ?? null,
      ticketLabel: item.ticket_label_snapshot
    };
  }

  private getOrderItems(orderId: string): OrderItemRow[] {
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        quantity: orderItems.quantity,
        production_unit_id: orderItems.productionUnitId,
        sale_group_id: orderItems.saleGroupId,
        sale_group_name_snapshot: orderItems.saleGroupNameSnapshot,
        sale_group_kind_snapshot: orderItems.saleGroupKindSnapshot,
        ticket_label_snapshot: orderItems.ticketLabelSnapshot,
        tax_components_json: orderItems.taxComponentsJson,
        tax_paise: orderItems.taxPaise,
        is_open_item: orderItems.isOpenItem
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();
  }

  private getOrderItemByKey(orderId: string, menuItemId: string): OrderItemRow | undefined {
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        quantity: orderItems.quantity,
        production_unit_id: orderItems.productionUnitId,
        sale_group_id: orderItems.saleGroupId,
        sale_group_name_snapshot: orderItems.saleGroupNameSnapshot,
        sale_group_kind_snapshot: orderItems.saleGroupKindSnapshot,
        ticket_label_snapshot: orderItems.ticketLabelSnapshot,
        tax_components_json: orderItems.taxComponentsJson,
        tax_paise: orderItems.taxPaise,
        is_open_item: orderItems.isOpenItem
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.menuItemId, menuItemId)
        )
      )
      .get();
  }

  private getOrderItemByKeyOrName(orderId: string, menuItemId: string | null, name: string): OrderItemRow | undefined {
    if (menuItemId) return this.getOrderItemByKey(orderId, menuItemId);
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        quantity: orderItems.quantity,
        production_unit_id: orderItems.productionUnitId,
        sale_group_id: orderItems.saleGroupId,
        sale_group_name_snapshot: orderItems.saleGroupNameSnapshot,
        sale_group_kind_snapshot: orderItems.saleGroupKindSnapshot,
        ticket_label_snapshot: orderItems.ticketLabelSnapshot,
        tax_components_json: orderItems.taxComponentsJson,
        tax_paise: orderItems.taxPaise,
        is_open_item: orderItems.isOpenItem
      })
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

  private getUnit(productionUnitId: string): UnitRow | undefined {
    return this.orm
      .select({
        id: productionUnits.id,
        name: productionUnits.name,
        printer_host: productionUnits.printerHost,
        printer_port: productionUnits.printerPort,
        printer_name: productionUnits.printerName
      })
      .from(productionUnits)
      .where(eq(productionUnits.id, productionUnitId))
      .get();
  }

  private createReadyNotification(kotId: string): void {
    const row = this.db
      .prepare(
        `SELECT k.id, k.order_id, k.production_unit_id, o.table_id, o.captain_id, o.captain_device_id,
          t.name AS table_name, pu.name AS production_unit_name
         FROM kots k
         JOIN orders o ON o.id = k.order_id
         JOIN restaurant_tables t ON t.id = o.table_id
         JOIN production_units pu ON pu.id = k.production_unit_id
         WHERE k.id = ?`
      )
      .get(kotId) as
      | {
          id: string;
          order_id: string;
          production_unit_id: string;
          table_id: string;
          captain_id: string;
          captain_device_id: string | null;
          table_name: string;
          production_unit_name: string;
        }
      | undefined;
    if (!row || !row.captain_device_id) return;
    const exists = this.orm.select({ id: readyNotifications.id }).from(readyNotifications).where(eq(readyNotifications.kotId, kotId)).get();
    if (exists) return;
    const items = this.db
      .prepare("SELECT name_snapshot, ABS(quantity_delta) AS quantity FROM kot_items WHERE kot_id = ? AND quantity_delta > 0 ORDER BY id")
      .all(kotId) as Array<{ name_snapshot: string; quantity: number }>;
    this.orm
      .insert(readyNotifications)
      .values({
        id: makeId("ready"),
        kotId,
        orderId: row.order_id,
        tableId: row.table_id,
        tableName: row.table_name,
        productionUnitId: row.production_unit_id,
        productionUnitName: row.production_unit_name,
        captainDeviceId: row.captain_device_id,
        captainId: row.captain_id,
        itemsJson: JSON.stringify(items.map((item) => ({ name: item.name_snapshot, quantity: item.quantity }))),
        status: "unread",
        createdAt: new Date().toISOString()
      })
      .run();
  }

  private getOrderItemById(orderItemId: string): OrderItemRow | undefined {
    return this.orm
      .select({
        id: orderItems.id,
        order_id: orderItems.orderId,
        menu_item_id: orderItems.menuItemId,
        name_snapshot: orderItems.nameSnapshot,
        unit_price_paise: orderItems.unitPricePaise,
        quantity: orderItems.quantity,
        production_unit_id: orderItems.productionUnitId,
        sale_group_id: orderItems.saleGroupId,
        sale_group_name_snapshot: orderItems.saleGroupNameSnapshot,
        sale_group_kind_snapshot: orderItems.saleGroupKindSnapshot,
        ticket_label_snapshot: orderItems.ticketLabelSnapshot,
        tax_components_json: orderItems.taxComponentsJson,
        tax_paise: orderItems.taxPaise,
        is_open_item: orderItems.isOpenItem
      })
      .from(orderItems)
      .where(eq(orderItems.id, orderItemId))
      .get();
  }

  private itemKey(menuItemId: string | null, orderItemId?: string): string {
    return menuItemId ? `menu:${menuItemId}` : `open:${orderItemId ?? makeId("line")}`;
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

  private calculateDiscountPaise(totalPaise: number, input: SettleBillInput): number {
    if (input.discountType === "percent") {
      const percent = Math.min(100, input.discountValue ?? 0);
      return Math.round((totalPaise * percent) / 100);
    }
    return Math.min(totalPaise, Math.round(input.discountValue ?? 0));
  }

  private allocateByWeight(totalPaise: number, bases: number[]): number[] {
    if (totalPaise <= 0 || bases.length === 0) return bases.map(() => 0);
    const baseTotal = bases.reduce((total, base) => total + Math.max(0, base), 0);
    if (baseTotal <= 0) return bases.map(() => 0);
    const shares = bases.map((base) => Math.floor((totalPaise * Math.max(0, base)) / baseTotal));
    let remainder = totalPaise - shares.reduce((total, share) => total + share, 0);
    for (let index = 0; remainder > 0 && index < shares.length; index += 1) {
      if ((bases[index] ?? 0) <= 0) continue;
      shares[index] = (shares[index] ?? 0) + 1;
      remainder -= 1;
    }
    return shares;
  }

  private selectOrderById(orderId: string): OrderRow | undefined {
    const row = this.orm
      .select({
        id: orders.id,
        table_id: orders.tableId,
        pos_day_id: orders.posDayId,
        status: orders.status,
        captain_id: orders.captainId,
        captain_device_id: orders.captainDeviceId,
        created_by_device_id: orders.createdByDeviceId,
        created_by_role: orders.createdByRole,
        created_at: orders.createdAt,
        updated_at: orders.updatedAt
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .get();
    return row ? { ...row, created_by_role: row.created_by_role as UserRole | null } : undefined;
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
        subtotal_paise: bills.subtotalPaise,
        tax_paise: bills.taxPaise,
        total_paise: bills.totalPaise,
        discount_paise: bills.discountPaise,
        tip_paise: bills.tipPaise,
        final_total_paise: bills.finalTotalPaise,
        tax_breakdown_json: bills.taxBreakdownJson,
        revision_number: bills.revisionNumber,
        is_nc: bills.isNc,
        nc_reason: bills.ncReason
      })
      .from(bills)
      .where(eq(bills.id, billId))
      .get();
  }
}
