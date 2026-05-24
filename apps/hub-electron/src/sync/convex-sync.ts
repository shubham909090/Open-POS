import { createHash, randomUUID, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HubConnectionSettingsInput } from "@gaurav-pos/shared";
import type { HubOrm } from "../db/database.js";
import { finalizeBusinessDay } from "../domain/order-service/business-day-lifecycle.js";

type BackupDomain =
  | "pos_days"
  | "orders"
  | "order_items"
  | "bills"
  | "bill_revisions"
  | "payments"
  | "sale_groups"
  | "floors"
  | "restaurant_tables"
  | "production_units"
  | "menu_items"
  | "menu_item_variants"
  | "alcohol_profiles"
  | "alcohol_stock_levels"
  | "alcohol_recipe_ingredients"
  | "alcohol_stock_movements";

type BackupRow = {
  domain: BackupDomain;
  localId: string;
  businessDate?: string;
  localUpdatedAt?: string;
  payloadJson: string;
  payloadHash: string;
  sourceVersion: number;
  deletedAt?: string;
};

type RestoreKind = "order_history" | "menu_catalog" | "alcohol_stock" | "table_layout";
type RestorePullRow = BackupRow & {
  updatedAt: string;
  deletedAt?: string;
};

type BackupScanRow = Record<string, unknown> & {
  __local_id?: string;
  __business_date?: string | null;
  __local_updated_at?: string | null;
};

type LicenseLease = {
  payloadJson: string;
  signature: string;
  algorithm: string;
  keyId: string;
};

type LicenseResponse = {
  restaurantId: string;
  installationId: string;
  syncSecret: string;
  lease: LicenseLease;
  checkedAt: string;
  licenseValidUntil: string;
  leaseExpiresAt: string;
  status: "active" | "warning" | "expired" | "suspended" | "revoked";
  offlineWarningDays: number;
  offlineLockDays: number;
};

export type LicenseVerifierOptions = {
  publicKeyPem?: string;
  allowDevSignatures?: boolean;
  devSigningSecret?: string;
};

export type LicenseLockState = {
  status: "missing" | "active" | "warning" | "locked";
  reason?: "missing_license" | "expired" | "suspended" | "revoked" | "offline_stale" | "clock_rollback" | "invalid_signature";
  message: string;
  checkedAt?: string;
  licenseValidUntil?: string;
  leaseExpiresAt?: string;
  hoursUntilOfflineLock?: number;
};

type DomainQuery = {
  domain: BackupDomain;
  sql: string;
};

const BACKUP_BATCH_LIMIT = 100;
const SOURCE_VERSION = 1;
const LICENSE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;
const restoreDomains: Record<RestoreKind, BackupDomain[]> = {
  order_history: [
    "floors",
    "restaurant_tables",
    "sale_groups",
    "production_units",
    "menu_items",
    "menu_item_variants",
    "pos_days",
    "orders",
    "order_items",
    "bills",
    "bill_revisions",
    "payments"
  ],
  menu_catalog: ["sale_groups", "production_units", "menu_items", "menu_item_variants"],
  alcohol_stock: ["alcohol_profiles", "alcohol_stock_levels", "alcohol_recipe_ingredients", "alcohol_stock_movements"],
  table_layout: ["floors", "restaurant_tables"]
};
const businessDateRestoreDomains = new Set<BackupDomain>(["pos_days", "orders", "order_items", "bills", "bill_revisions", "payments"]);
const wipeSql: Record<RestoreKind, string[]> = {
  order_history: [
    "DELETE FROM ready_notifications",
    "DELETE FROM kot_items",
    "DELETE FROM kots",
    "DELETE FROM order_movements",
    "DELETE FROM payments",
    "DELETE FROM bill_revisions",
    "DELETE FROM bills",
    "DELETE FROM order_items",
    "DELETE FROM orders",
    "DELETE FROM daily_report_snapshots",
    "DELETE FROM pos_days",
    "UPDATE restaurant_tables SET status = 'free', current_order_id = NULL, occupied_at = NULL"
  ],
  menu_catalog: [
    "DELETE FROM alcohol_recipe_ingredients",
    "DELETE FROM alcohol_profiles",
    "DELETE FROM menu_item_variants",
    "DELETE FROM menu_items",
    "DELETE FROM production_units",
    "DELETE FROM sale_groups"
  ],
  alcohol_stock: [
    "DELETE FROM alcohol_stock_movements",
    "DELETE FROM alcohol_recipe_ingredients",
    "DELETE FROM alcohol_stock_levels",
    "DELETE FROM alcohol_profiles"
  ],
  table_layout: [
    "DELETE FROM restaurant_tables",
    "DELETE FROM floors"
  ]
};
const restoreTableByDomain: Record<BackupDomain, string> = {
  pos_days: "pos_days",
  orders: "orders",
  order_items: "order_items",
  bills: "bills",
  bill_revisions: "bill_revisions",
  payments: "payments",
  sale_groups: "sale_groups",
  floors: "floors",
  restaurant_tables: "restaurant_tables",
  production_units: "production_units",
  menu_items: "menu_items",
  menu_item_variants: "menu_item_variants",
  alcohol_profiles: "alcohol_profiles",
  alcohol_stock_levels: "alcohol_stock_levels",
  alcohol_recipe_ingredients: "alcohol_recipe_ingredients",
  alcohol_stock_movements: "alcohol_stock_movements"
};
const restorePrimaryKeys: Record<BackupDomain, string[]> = {
  pos_days: ["id"],
  orders: ["id"],
  order_items: ["id"],
  bills: ["id"],
  bill_revisions: ["id"],
  payments: ["id"],
  sale_groups: ["id"],
  floors: ["id"],
  restaurant_tables: ["id"],
  production_units: ["id"],
  menu_items: ["id"],
  menu_item_variants: ["id"],
  alcohol_profiles: ["menu_item_id"],
  alcohol_stock_levels: ["menu_item_id"],
  alcohol_recipe_ingredients: ["id"],
  alcohol_stock_movements: ["id"]
};

const backupDomainQueries: DomainQuery[] = [
  {
    domain: "pos_days",
    sql: `SELECT p.*, p.id AS __local_id, p.business_date AS __business_date,
            COALESCE(p.finalized_at, p.created_at) AS __local_updated_at
          FROM pos_days p
          WHERE p.status = 'finalized' AND p.id > ?
          ORDER BY p.id
          LIMIT ?`
  },
  {
    domain: "orders",
    sql: `SELECT o.*, o.id AS __local_id, pd.business_date AS __business_date, o.updated_at AS __local_updated_at
          FROM orders o
          JOIN pos_days pd ON pd.id = o.pos_day_id
          WHERE o.status IN ('paid', 'cancelled') AND o.id > ?
          ORDER BY o.id
          LIMIT ?`
  },
  {
    domain: "order_items",
    sql: `SELECT oi.*, oi.id AS __local_id, pd.business_date AS __business_date, oi.updated_at AS __local_updated_at
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN pos_days pd ON pd.id = o.pos_day_id
          WHERE o.status IN ('paid', 'cancelled') AND oi.id > ?
          ORDER BY oi.id
          LIMIT ?`
  },
  {
    domain: "bills",
    sql: `SELECT b.*, b.id AS __local_id, pd.business_date AS __business_date,
            COALESCE(b.settled_at, b.created_at) AS __local_updated_at
          FROM bills b
          JOIN orders o ON o.id = b.order_id
          JOIN pos_days pd ON pd.id = o.pos_day_id
          WHERE (b.status = 'paid' OR b.is_nc = 1) AND b.id > ?
          ORDER BY b.id
          LIMIT ?`
  },
  {
    domain: "bill_revisions",
    sql: `SELECT br.*, br.id AS __local_id, pd.business_date AS __business_date, br.created_at AS __local_updated_at
          FROM bill_revisions br
          JOIN bills b ON b.id = br.bill_id
          JOIN orders o ON o.id = b.order_id
          JOIN pos_days pd ON pd.id = o.pos_day_id
          WHERE (b.status = 'paid' OR b.is_nc = 1) AND br.id > ?
          ORDER BY br.id
          LIMIT ?`
  },
  {
    domain: "payments",
    sql: `SELECT pay.*, pay.id AS __local_id, pd.business_date AS __business_date, pay.created_at AS __local_updated_at
          FROM payments pay
          JOIN bills b ON b.id = pay.bill_id
          JOIN orders o ON o.id = b.order_id
          JOIN pos_days pd ON pd.id = o.pos_day_id
          WHERE (b.status = 'paid' OR b.is_nc = 1) AND pay.id > ?
          ORDER BY pay.id
          LIMIT ?`
  },
  {
    domain: "sale_groups",
    sql: `SELECT sg.*, sg.id AS __local_id, sg.id AS __local_updated_at
          FROM sale_groups sg
          WHERE sg.id > ?
          ORDER BY sg.id
          LIMIT ?`
  },
  {
    domain: "floors",
    sql: `SELECT f.*, f.id AS __local_id, f.id AS __local_updated_at
          FROM floors f
          WHERE f.id > ?
          ORDER BY f.id
          LIMIT ?`
  },
  {
    domain: "restaurant_tables",
    sql: `SELECT rt.id, rt.floor_id, rt.name, rt.active, rt.sort_order,
            rt.id AS __local_id, rt.id AS __local_updated_at
          FROM restaurant_tables rt
          WHERE rt.id > ?
          ORDER BY rt.id
          LIMIT ?`
  },
  {
    domain: "production_units",
    sql: `SELECT pu.*, pu.id AS __local_id, pu.id AS __local_updated_at
          FROM production_units pu
          WHERE pu.id > ?
          ORDER BY pu.id
          LIMIT ?`
  },
  {
    domain: "menu_items",
    sql: `SELECT mi.*, mi.id AS __local_id, mi.id AS __local_updated_at
          FROM menu_items mi
          WHERE mi.id > ?
          ORDER BY mi.id
          LIMIT ?`
  },
  {
    domain: "menu_item_variants",
    sql: `SELECT miv.*, miv.id AS __local_id, miv.id AS __local_updated_at
          FROM menu_item_variants miv
          WHERE miv.id > ?
          ORDER BY miv.id
          LIMIT ?`
  },
  {
    domain: "alcohol_profiles",
    sql: `SELECT ap.*, ap.menu_item_id AS __local_id, ap.menu_item_id AS __local_updated_at
          FROM alcohol_profiles ap
          WHERE ap.menu_item_id > ?
          ORDER BY ap.menu_item_id
          LIMIT ?`
  },
  {
    domain: "alcohol_stock_levels",
    sql: `SELECT asl.*, asl.menu_item_id AS __local_id, asl.updated_at AS __local_updated_at
          FROM alcohol_stock_levels asl
          WHERE asl.menu_item_id > ?
          ORDER BY asl.menu_item_id
          LIMIT ?`
  },
  {
    domain: "alcohol_recipe_ingredients",
    sql: `SELECT ari.*, ari.id AS __local_id, ari.id AS __local_updated_at
          FROM alcohol_recipe_ingredients ari
          WHERE ari.id > ?
          ORDER BY ari.id
          LIMIT ?`
  },
  {
    domain: "alcohol_stock_movements",
    sql: `SELECT asm.*, asm.id AS __local_id, asm.created_at AS __local_updated_at
          FROM alcohol_stock_movements asm
          WHERE asm.id > ?
          ORDER BY asm.id
          LIMIT ?`
  }
];

export class ConvexSyncBridge {
  constructor(
    private readonly db: HubOrm,
    private readonly convexUrl: string | undefined,
    private readonly syncSecret: string | undefined,
    private readonly installationId?: string,
    private readonly settingsProvider?: () => HubConnectionSettingsInput,
    private readonly licenseVerifier: LicenseVerifierOptions = {}
  ) {}

  pendingEvents(): [] {
    return [];
  }

  async pushPending(): Promise<{ pushed: number; skipped: boolean }> {
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId) {
      return { pushed: 0, skipped: true };
    }

    await this.refreshLicenseIfDue(config).catch((error) => {
      this.writeSetting("license_last_error", error instanceof Error ? error.message : "License check failed");
    });

    const backupBatch = this.collectBackupRows(BACKUP_BATCH_LIMIT);
    const { rows } = backupBatch;
    this.archiveLegacyEventOutbox();
    if (rows.length === 0) return { pushed: 0, skipped: true };

    const response = await fetch(`${config.cloudUrl}/pos/backup/push`, {
      method: "POST",
      headers: this.authHeaders(config),
      body: JSON.stringify({ rows })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const message = `Cloud backup failed with ${response.status}${body.error ? `: ${body.error}` : ""}`;
      this.writeSetting("cloud_backup_last_error", message);
      throw new Error(message);
    }

    this.writeSetting("cloud_backup_last_success_at", new Date().toISOString());
    this.writeSetting("cloud_backup_last_error", "");
    this.markTombstonesPushed(backupBatch.tombstoneIds);
    return { pushed: rows.length, skipped: false };
  }

  requeueFailedEvents(): { requeued: number } {
    return { requeued: 0 };
  }

  async pullCloudSnapshot(): Promise<{ applied: number; failed: number; skipped: boolean; cursor?: string }> {
    return { applied: 0, failed: 0, skipped: false, cursor: this.getSetting("cloud_snapshot_cursor") };
  }

  async activateLicense(input: { cloudUrl: string; setupKey: string; hubLabel?: string }): Promise<LicenseLockState> {
    const cloudUrl = input.cloudUrl.trim().replace(/\/+$/, "");
    if (!cloudUrl) throw new Error("Cloud URL is required");
    const hubFingerprint = this.ensureHubFingerprint();
    const response = await fetch(`${cloudUrl}/pos/activate-license`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setupKey: input.setupKey,
        hubFingerprint,
        hubLabel: input.hubLabel
      })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `License activation failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as LicenseResponse;
    this.storeLicenseResponse(body);
    this.writeSetting("hub_connection_cloud_url", cloudUrl);
    this.writeSetting("hub_connection_installation_id", body.installationId);
    this.writeSetting("hub_connection_sync_secret", body.syncSecret);
    this.writeSetting("license_restaurant_id", body.restaurantId);
    this.writeSetting("license_activated_at", body.checkedAt);
    return this.getLicenseState();
  }

  async checkLicenseOnline(): Promise<LicenseLockState> {
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId) {
      this.writeSetting("license_status", "missing");
      return this.getLicenseState();
    }
    const response = await fetch(`${config.cloudUrl}/pos/license-check`, {
      method: "POST",
      headers: this.authHeaders(config),
      body: JSON.stringify({ hubFingerprint: this.ensureHubFingerprint() })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `License check failed with HTTP ${response.status}`);
    }
    this.storeLicenseResponse((await response.json()) as LicenseResponse);
    return this.getLicenseState();
  }

  getLicenseState(now = new Date()): LicenseLockState {
    const payloadJson = this.getSetting("license_lease_payload_json");
    const signature = this.getSetting("license_lease_signature");
    const algorithm = this.getSetting("license_lease_algorithm");
    const checkedAt = this.getSetting("license_last_online_check_at");
    if (!payloadJson || !signature || !algorithm || !checkedAt) {
      return { status: "missing", reason: "missing_license", message: "Activate this hub with a setup key before using cloud backup." };
    }

    if (!this.verifyLease({ payloadJson, signature, algorithm, keyId: this.getSetting("license_lease_key_id") ?? "default" })) {
      return { status: "locked", reason: "invalid_signature", message: "License lease signature is invalid. Connect to the internet and check license." };
    }

    const payload = JSON.parse(payloadJson) as {
      status?: string;
      checkedAt?: string;
      licenseValidUntil?: string;
      leaseExpiresAt?: string;
      offlineWarningDays?: number;
      offlineLockDays?: number;
    };
    const checkedTime = new Date(payload.checkedAt ?? checkedAt).getTime();
    const nowTime = now.getTime();
    if (nowTime + CLOCK_ROLLBACK_TOLERANCE_MS < checkedTime) {
      return { status: "locked", reason: "clock_rollback", message: "System clock moved backwards. Connect to the internet to refresh the license." };
    }

    const licenseValidUntil = payload.licenseValidUntil ?? this.getSetting("license_valid_until") ?? "";
    const leaseExpiresAt = payload.leaseExpiresAt ?? this.getSetting("license_lease_expires_at") ?? "";
    if (payload.status === "suspended") return { status: "locked", reason: "suspended", message: "License is suspended. Contact support.", checkedAt, licenseValidUntil, leaseExpiresAt };
    if (payload.status === "revoked") return { status: "locked", reason: "revoked", message: "License is revoked. Contact support.", checkedAt, licenseValidUntil, leaseExpiresAt };
    if (payload.status === "expired" || (licenseValidUntil && nowTime > new Date(licenseValidUntil).getTime())) {
      return { status: "locked", reason: "expired", message: "License expired. Contact support to renew.", checkedAt, licenseValidUntil, leaseExpiresAt };
    }

    const warningDays = payload.offlineWarningDays ?? 25;
    const lockDays = payload.offlineLockDays ?? 30;
    const staleHours = Math.floor((nowTime - checkedTime) / (60 * 60 * 1000));
    const lockHours = lockDays * 24;
    if (staleHours >= lockHours) {
      return { status: "locked", reason: "offline_stale", message: "License must be checked online before service can continue.", checkedAt, licenseValidUntil, leaseExpiresAt, hoursUntilOfflineLock: 0 };
    }
    if (staleHours >= warningDays * 24) {
      return {
        status: "warning",
        message: "Connect to the internet soon to keep this POS unlocked.",
        checkedAt,
        licenseValidUntil,
        leaseExpiresAt,
        hoursUntilOfflineLock: lockHours - staleHours
      };
    }

    return { status: "active", message: "License is active.", checkedAt, licenseValidUntil, leaseExpiresAt, hoursUntilOfflineLock: lockHours - staleHours };
  }

  async fetchBackupManifest(): Promise<unknown> {
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId) return { manifests: [] };
    const response = await fetch(`${config.cloudUrl}/pos/backup/manifest`, {
      method: "POST",
      headers: this.authHeaders(config),
      body: JSON.stringify({})
    });
    if (!response.ok) throw new Error(`Cloud backup manifest failed with HTTP ${response.status}`);
    return response.json();
  }

  async restoreFromCloud(input: { kind: RestoreKind; throughBusinessDate?: string }): Promise<{ restored: true; imported: number; kind: RestoreKind }> {
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId) throw new Error("Cloud connection is not configured");
    this.assertNoActiveService();
    if (input.kind === "order_history" && !input.throughBusinessDate) throw new Error("Order restore needs a through business date");

    const tempDir = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-"));
    const rollbackPath = join(tempDir, `rollback-${Date.now()}.sqlite`);
    const previousForeignKeys = this.db.$client.pragma("foreign_keys", { simple: true }) as number;
    await this.db.$client.backup(rollbackPath);
    let imported = 0;

    try {
      this.db.$client.pragma("foreign_keys = OFF");
      const wipe = this.db.$client.transaction(() => {
        for (const statement of wipeSql[input.kind]) this.db.$client.prepare(statement).run();
      });
      wipe();
      for (const domain of restoreDomains[input.kind]) {
        const throughBusinessDate = input.kind === "order_history" && businessDateRestoreDomains.has(domain) ? input.throughBusinessDate : undefined;
        await this.pullRestoreDomainPages(config, domain, throughBusinessDate, (rows) => {
          const importPage = this.db.$client.transaction(() => {
            for (const row of rows) {
              this.importRestoreRow(domain, row);
              imported += 1;
            }
          });
          importPage();
        });
      }
      const validate = this.db.$client.transaction(() => {
        if (input.kind === "order_history") this.rebuildReportSnapshots();
        const foreignKeyProblems = this.db.$client.pragma("foreign_key_check") as unknown[];
        if (foreignKeyProblems.length > 0) throw new Error("Restore failed foreign key validation");
      });
      validate();
      this.db.$client.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
      const integrity = this.db.$client.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") throw new Error("Restore failed SQLite integrity check");
      rmSync(tempDir, { recursive: true, force: true });
      return { restored: true, imported, kind: input.kind };
    } catch (error) {
      this.db.$client.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
      this.writeSetting("cloud_restore_failed_rollback_path", rollbackPath);
      throw error;
    }
  }

  private async refreshLicenseIfDue(config: HubConnectionSettingsInput): Promise<void> {
    const last = this.getSetting("license_last_online_check_at");
    if (last && Date.now() - new Date(last).getTime() < LICENSE_CHECK_INTERVAL_MS) return;
    await this.checkLicenseOnlineWithConfig(config);
  }

  private async checkLicenseOnlineWithConfig(config: HubConnectionSettingsInput): Promise<void> {
    const response = await fetch(`${config.cloudUrl}/pos/license-check`, {
      method: "POST",
      headers: this.authHeaders(config),
      body: JSON.stringify({ hubFingerprint: this.ensureHubFingerprint() })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `License check failed with HTTP ${response.status}`);
    }
    this.storeLicenseResponse((await response.json()) as LicenseResponse);
  }

  private collectBackupRows(limit: number): { rows: BackupRow[]; tombstoneIds: number[] } {
    const tombstones = this.collectPendingTombstones(limit);
    const rows: BackupRow[] = [...tombstones.rows];
    let domainIndex = Number(this.getSetting("cloud_backup_domain_index") ?? "0");
    if (!Number.isInteger(domainIndex) || domainIndex < 0 || domainIndex >= backupDomainQueries.length) domainIndex = 0;

    for (let visited = 0; visited < backupDomainQueries.length && rows.length < limit; visited += 1) {
      const query = backupDomainQueries[domainIndex]!;
      const remaining = limit - rows.length;
      const scanned = this.scanDomain(query, remaining);
      rows.push(...scanned.rows);
      domainIndex = (domainIndex + 1) % backupDomainQueries.length;
      this.writeSetting("cloud_backup_domain_index", String(domainIndex));
    }

    return { rows, tombstoneIds: tombstones.ids };
  }

  private collectPendingTombstones(limit: number): { rows: BackupRow[]; ids: number[] } {
    const rows = this.db.$client
      .prepare(
        `SELECT id, domain, local_id, business_date, deleted_at
         FROM cloud_backup_tombstones
         WHERE pushed_at IS NULL
         ORDER BY id ASC
         LIMIT ?`
      )
      .all(limit) as Array<{ id: number; domain: BackupDomain; local_id: string; business_date: string | null; deleted_at: string }>;
    const payloadJson = "{}";
    const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
    return {
      ids: rows.map((row) => row.id),
      rows: rows.map((row) => ({
        domain: row.domain,
        localId: row.local_id,
        ...(row.business_date ? { businessDate: row.business_date } : {}),
        localUpdatedAt: row.deleted_at,
        payloadJson,
        payloadHash,
        sourceVersion: SOURCE_VERSION,
        deletedAt: row.deleted_at
      }))
    };
  }

  private markTombstonesPushed(ids: number[]): void {
    if (ids.length === 0) return;
    const pushedAt = new Date().toISOString();
    const update = this.db.$client.prepare("UPDATE cloud_backup_tombstones SET pushed_at = ? WHERE id = ?");
    const run = this.db.$client.transaction(() => {
      for (const id of ids) update.run(pushedAt, id);
    });
    run();
  }

  private async pullRestoreDomainPages(
    config: HubConnectionSettingsInput,
    domain: BackupDomain,
    throughBusinessDate: string | undefined,
    onPage: (rows: RestorePullRow[]) => void
  ): Promise<void> {
    let cursor: string | undefined;
    do {
      const response = await fetch(`${config.cloudUrl}/pos/backup/restore-page`, {
        method: "POST",
        headers: this.authHeaders(config),
        body: JSON.stringify({ domain, throughBusinessDate, cursor, limit: BACKUP_BATCH_LIMIT })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Restore pull failed for ${domain} with HTTP ${response.status}`);
      }
      const body = (await response.json()) as { cursor?: string; rows?: RestorePullRow[] };
      const pageRows = body.rows ?? [];
      if (pageRows.length > 0) onPage(pageRows);
      cursor = body.cursor && (body.rows?.length ?? 0) > 0 ? body.cursor : undefined;
    } while (cursor);
  }

  private importRestoreRow(domain: BackupDomain, row: RestorePullRow): void {
    if (row.deletedAt) return;
    const table = restoreTableByDomain[domain];
    const primaryKeys = restorePrimaryKeys[domain];
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    if (domain === "restaurant_tables") {
      payload.status = "free";
      payload.current_order_id = null;
      payload.occupied_at = null;
    }
    const keys = Object.keys(payload);
    if (keys.length === 0) return;
    const conflictSet = keys.filter((key) => !primaryKeys.includes(key));
    const insertSql = [
      `INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(", ")})`,
      `VALUES (${keys.map((key) => `@${key}`).join(", ")})`,
      conflictSet.length > 0
        ? `ON CONFLICT(${primaryKeys.map((key) => `"${key}"`).join(", ")}) DO UPDATE SET ${conflictSet.map((key) => `"${key}" = excluded."${key}"`).join(", ")}`
        : `ON CONFLICT(${primaryKeys.map((key) => `"${key}"`).join(", ")}) DO NOTHING`
    ].join(" ");
    this.db.$client.prepare(insertSql).run(payload);
  }

  private rebuildReportSnapshots(): void {
    const days = this.db.$client
      .prepare("SELECT id FROM pos_days WHERE status = 'finalized' ORDER BY business_date ASC")
      .all() as Array<{ id: string }>;
    for (const day of days) {
      finalizeBusinessDay({
        orm: this.db,
        db: this.db.$client,
        posDayId: day.id,
        appendEvent: () => undefined
      });
    }
  }

  private assertNoActiveService(): void {
    const orderBlocker = this.db.$client
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('open', 'billed')")
      .get() as { count: number };
    const tableBlocker = this.db.$client
      .prepare("SELECT COUNT(*) AS count FROM restaurant_tables WHERE status IN ('occupied', 'billed')")
      .get() as { count: number };
    if ((orderBlocker.count ?? 0) > 0 || (tableBlocker.count ?? 0) > 0) {
      throw new Error("Finish or cancel all open and billed tables before restoring from cloud");
    }
  }

  private scanDomain(query: DomainQuery, limit: number): { rows: BackupRow[] } {
    const cursorKey = `cloud_backup_cursor_${query.domain}`;
    const cursor = this.getSetting(cursorKey) ?? "";
    let rows = this.db.$client.prepare(query.sql).all(cursor, limit) as BackupScanRow[];
    if (rows.length === 0 && cursor) {
      this.writeSetting(cursorKey, "");
      rows = this.db.$client.prepare(query.sql).all("", limit) as BackupScanRow[];
    }
    if (rows.length > 0) this.writeSetting(cursorKey, String(rows.at(-1)?.__local_id ?? ""));
    return { rows: rows.map((row) => this.toBackupRow(query.domain, row)) };
  }

  private toBackupRow(domain: BackupDomain, row: BackupScanRow): BackupRow {
    const localId = String(row.__local_id ?? "");
    const payload = Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("__")));
    const payloadJson = JSON.stringify(payload);
    return {
      domain,
      localId,
      ...(typeof row.__business_date === "string" ? { businessDate: row.__business_date } : {}),
      ...(typeof row.__local_updated_at === "string" ? { localUpdatedAt: row.__local_updated_at } : {}),
      payloadJson,
      payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
      sourceVersion: SOURCE_VERSION
    };
  }

  private archiveLegacyEventOutbox(): void {
    this.db.$client
      .prepare(
        `UPDATE sync_outbox
         SET status = 'synced',
             last_error = 'deprecated: cloud backup stores rows, not raw events',
             updated_at = ?
         WHERE status IN ('pending', 'failed')`
      )
      .run(new Date().toISOString());
  }

  private storeLicenseResponse(body: LicenseResponse): void {
    if (!this.verifyLease(body.lease)) throw new Error("License lease signature is invalid");
    this.writeSetting("license_lease_payload_json", body.lease.payloadJson);
    this.writeSetting("license_lease_signature", body.lease.signature);
    this.writeSetting("license_lease_algorithm", body.lease.algorithm);
    this.writeSetting("license_lease_key_id", body.lease.keyId);
    this.writeSetting("license_last_online_check_at", body.checkedAt);
    this.writeSetting("license_valid_until", body.licenseValidUntil);
    this.writeSetting("license_lease_expires_at", body.leaseExpiresAt);
    this.writeSetting("license_status", body.status);
    this.writeSetting("hub_connection_installation_id", body.installationId);
    this.writeSetting("hub_connection_sync_secret", body.syncSecret);
  }

  private verifyLease(lease: LicenseLease): boolean {
    if (lease.algorithm === "DEV-SHA256") {
      const allowDevSignatures = this.licenseVerifier.allowDevSignatures === true || process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES === "1";
      if (!allowDevSignatures) return false;
      const devSecret = this.licenseVerifier.devSigningSecret ?? process.env.POS_LICENSE_DEV_SIGNING_SECRET;
      if (!devSecret) return false;
      const expected = createHash("sha256").update(`${lease.payloadJson}.${devSecret}`).digest();
      const received = Buffer.from(lease.signature, "hex");
      return expected.length === received.length && timingSafeEqual(expected, received);
    }
    if (lease.algorithm !== "RSASSA-PKCS1-v1_5-SHA256") return false;
    const publicKeyPem = this.licenseVerifier.publicKeyPem;
    if (!publicKeyPem) return false;
    return verifySignature(
      "RSA-SHA256",
      Buffer.from(lease.payloadJson),
      publicKeyPem.replace(/\\n/g, "\n"),
      Buffer.from(lease.signature, "base64")
    );
  }

  private authHeaders(config: HubConnectionSettingsInput): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-pos-sync-secret": config.syncSecret ?? "",
      "x-pos-installation-secret": config.syncSecret ?? "",
      "x-pos-installation-id": config.installationId ?? ""
    };
  }

  private ensureHubFingerprint(): string {
    const existing = this.getSetting("license_hub_fingerprint");
    if (existing) return existing;
    const next = `hubfp_${randomUUID()}`;
    this.writeSetting("license_hub_fingerprint", next);
    return next;
  }

  private getSetting(key: string): string | undefined {
    const row = this.db.$client.prepare("SELECT value FROM hub_settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  private writeSetting(key: string, value: string): void {
    this.db.$client
      .prepare(
        `INSERT INTO hub_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, new Date().toISOString());
  }

  private resolveConfig(): HubConnectionSettingsInput {
    const provided = this.settingsProvider?.();
    return {
      cloudUrl: (provided?.cloudUrl || this.getSetting("hub_connection_cloud_url") || this.convexUrl || "").replace(/\/+$/, ""),
      installationId: provided?.installationId || this.getSetting("hub_connection_installation_id") || this.installationId || "",
      syncSecret: provided?.syncSecret || this.getSetting("hub_connection_sync_secret") || this.syncSecret || "",
      hubPublicUrl: provided?.hubPublicUrl || this.getSetting("hub_connection_public_url") || ""
    };
  }
}
