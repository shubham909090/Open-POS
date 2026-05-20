import { HubDatabase } from "../db/database.js";
import { AuthService } from "../domain/auth-service.js";
import { OrderService } from "../domain/order-service.js";

export function createTestHub() {
  const database = new HubDatabase(":memory:");
  database.migrate();
  database.seedDemoData();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice("test-admin-token");
  const orderService = new OrderService(database.orm);
  return { database, authService, orderService };
}

export function insertDailySnapshot(
  database: ReturnType<typeof createTestHub>["database"],
  input: {
    id: string;
    businessDate: string;
    billCount: number;
    finalSalesPaise: number;
    cashPaise?: number;
    upiPaise?: number;
    cardPaise?: number;
    onlinePaise?: number;
    itemSummaries?: unknown[];
    groupSummaries?: unknown[];
    billSummaries?: unknown[];
    status?: "finalized" | "active";
  }
) {
  const status = input.status ?? "finalized";
  database.db
    .prepare(
      `INSERT INTO pos_days (id, outlet_id, business_date, status, period_start_at, period_end_at, created_at, finalized_at)
       VALUES (?, 'outlet-main', ?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.businessDate, status, `${input.businessDate}T00:30:00.000Z`, `${input.businessDate}T18:30:00.000Z`, `${input.businessDate}T00:30:00.000Z`, status === "finalized" ? `${input.businessDate}T19:00:00.000Z` : null);
  if (status !== "finalized") {
    database.db
      .prepare(
        `INSERT INTO orders (id, table_id, pos_day_id, order_type, status, pax, captain_id, created_at, updated_at)
         VALUES (?, 'table-t1', ?, 'dine_in', 'open', 1, 'captain-test', ?, ?)`
      )
      .run(`order-${input.id}`, input.id, `${input.businessDate}T12:00:00.000Z`, `${input.businessDate}T12:00:00.000Z`);
    return;
  }
  const cash = input.cashPaise ?? 0;
  const upi = input.upiPaise ?? 0;
  const card = input.cardPaise ?? 0;
  const online = input.onlinePaise ?? 0;
  const totalPayments = cash + upi + card + online;
  database.db
    .prepare(
      `INSERT INTO daily_report_snapshots (
        pos_day_id, business_date, status, bill_count, open_orders, billed_orders, paid_bills, unpaid_bills, cancelled_orders,
        gross_sales_paise, discount_paise, tip_paise, final_sales_paise,
        cash_payments_paise, upi_payments_paise, card_payments_paise, online_payments_paise, total_payments_paise, non_cash_payments_paise,
        bill_summaries_json, item_summaries_json, group_summaries_json, finalized_at, updated_at
      ) VALUES (?, ?, 'finalized', ?, 0, 0, ?, 0, 0, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.businessDate,
      input.billCount,
      input.billCount,
      input.finalSalesPaise,
      input.finalSalesPaise,
      cash,
      upi,
      card,
      online,
      totalPayments,
      upi + card + online,
      JSON.stringify(input.billSummaries ?? []),
      JSON.stringify(input.itemSummaries ?? []),
      JSON.stringify(input.groupSummaries ?? []),
      `${input.businessDate}T19:00:00.000Z`,
      `${input.businessDate}T19:00:00.000Z`
    );
}
