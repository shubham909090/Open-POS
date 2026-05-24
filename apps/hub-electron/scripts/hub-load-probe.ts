import { performance } from "node:perf_hooks";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchMenuItems } from "@gaurav-pos/shared";
import { HubDatabase } from "../src/db/database.js";
import { OrderService } from "../src/domain/order-service.js";
import { ConvexSyncBridge } from "../src/sync/convex-sync.js";

type Metric = { name: string; ms: number; note?: string };

function time<T>(name: string, fn: () => T, metrics: Metric[], note?: string): T {
  const start = performance.now();
  const value = fn();
  metrics.push({ name, ms: performance.now() - start, note });
  return value;
}

async function timeAsync<T>(name: string, fn: () => Promise<T>, metrics: Metric[], note?: string): Promise<T> {
  const start = performance.now();
  const value = await fn();
  metrics.push({ name, ms: performance.now() - start, note });
  return value;
}

function buildMenuCsv(rows: number): string {
  const header = "name,price,kitchen_or_counter,sale_category,active";
  const body = Array.from({ length: rows }, (_, index) => {
    const group = index % 5 === 0 ? "Beverage" : "Food";
    const unit = index % 7 === 0 ? "Bar" : "Kitchen";
    return `Load Item ${String(index + 1).padStart(3, "0")},${100 + (index % 40) * 5},${unit},${group},true`;
  });
  return [header, ...body].join("\n");
}

function percentile(values: number[], pct: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length))] ?? 0;
}

const dbPath = join(tmpdir(), `gaurav-pos-load-${Date.now()}.sqlite`);
const database = new HubDatabase(dbPath);
database.migrate();
database.seedDemoData();
const orderService = new OrderService(database.orm);
const metrics: Metric[] = [];

try {
  const importResult = time("csv.import.500", () => orderService.importMenuItemsFromCsv(buildMenuCsv(500)), metrics);
  const bootstrap = time("bootstrap.after_import", () => orderService.bootstrap(), metrics);
  const boot = bootstrap as { menuItems: Array<{ id: string; name: string; active: boolean; sale_group_kind: string }> };
  metrics.at(-1)!.note = `${boot.menuItems.length} menu items`;

  const activeMenu = boot.menuItems.filter((item) => item.active);
  time("menu.search.blank.food.limit80", () => searchMenuItems(activeMenu, "", { saleGroupKind: "food", limit: 80 }), metrics);
  time("menu.search.fuzzy.500", () => searchMenuItems(activeMenu, "lod itam 33", { limit: 8 }), metrics);

  for (let index = 5; index <= 50; index += 1) {
    orderService.createTable({ customId: `load-table-${index}`, floorId: "floor-main", name: `L${index}`, active: true });
  }

  const orderMenuItems = activeMenu.slice(0, 30);
  time(
    "orders.submit.50_tables_x20_items",
    () => {
      for (let table = 1; table <= 50; table += 1) {
        const tableId = table <= 4 ? `table-t${table}` : `load-table-${table}`;
        orderService.submitOrder({
          tableId,
          pax: 4,
          orderType: "dine_in",
          printMode: "kot",
          items: orderMenuItems.slice(0, 20).map((item, itemIndex) => ({
            menuItemId: item.id,
            quantity: (itemIndex % 3) + 1
          }))
        });
      }
    },
    metrics,
    "KOT-only to measure order/KDS DB path without printer IO"
  );

  const tableTimings: number[] = [];
  for (let table = 1; table <= 50; table += 1) {
    const tableId = table <= 4 ? `table-t${table}` : `load-table-${table}`;
    const start = performance.now();
    orderService.getTableOrder(tableId);
    tableTimings.push(performance.now() - start);
  }
  metrics.push({ name: "table_order.50_tables.p95", ms: percentile(tableTimings, 95) });

  time("bootstrap.50_running_tables", () => orderService.bootstrap(), metrics);

  const unusedItem = activeMenu.at(-1);
  if (unusedItem) {
    time("menu.remove.unused_service_only", () => orderService.removeMenuItem(unusedItem.id), metrics, unusedItem.name);
    time("bootstrap.after_remove", () => orderService.bootstrap(), metrics);
  }

  database.db
    .prepare(
      `INSERT INTO hub_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run("license_last_online_check_at", new Date().toISOString(), new Date().toISOString());
  let backupRows = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { rows?: unknown[] };
    backupRows = body.rows?.length ?? 0;
    return new Response(JSON.stringify({ upserted: backupRows, skipped: 0 }), { status: 200 });
  };
  try {
    const syncBridge = new ConvexSyncBridge(database.orm, "https://perf.convex.site", "perf-secret", "perf-install");
    await timeAsync("cloud_backup.batch100", () => syncBridge.pushPending(), metrics);
    metrics.at(-1)!.note = `${backupRows} backup rows`;
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.table(
    metrics.map((metric) => ({
      metric: metric.name,
      ms: Number(metric.ms.toFixed(2)),
      note: metric.note ?? ""
    }))
  );
  console.log(JSON.stringify({ imported: importResult.created, failed: importResult.failed, dbPath }, null, 2));
} finally {
  database.db.close();
  rmSync(dbPath, { force: true });
}
