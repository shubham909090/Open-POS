import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { HubConnectionSettingsInput } from "@gaurav-pos/shared";
import type { HubOrm } from "../db/database.js";
import { cloudCommandFailures, eventLog, hubSettings, localDevices, menuItemVariants, menuItems, productionUnits, syncOutbox } from "../db/drizzle-schema.js";

interface OutboxRow {
  id: number;
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: string;
  createdAt: string;
}

interface CloudCommand {
  commandId: string;
  type:
    | "device.revoked"
    | "device.updated"
    | "menu_item.upsert"
    | "menu_item.disabled"
    | "production_unit.upsert"
    | "receipt_printer.updated";
  payloadJson: string;
  createdAt: string;
}

type LocalWriteDb = Pick<HubOrm, "insert" | "update">;

export class ConvexSyncBridge {
  constructor(
    private readonly db: HubOrm,
    private readonly convexUrl: string | undefined,
    private readonly syncSecret: string | undefined,
    private readonly installationId?: string,
    private readonly settingsProvider?: () => HubConnectionSettingsInput
  ) {}

  pendingEvents(limit = 100): OutboxRow[] {
    return this.db
      .select({
        id: syncOutbox.id,
        eventId: syncOutbox.eventId,
        type: eventLog.type,
        aggregateType: eventLog.aggregateType,
        aggregateId: eventLog.aggregateId,
        payload: eventLog.payload,
        createdAt: eventLog.createdAt
      })
      .from(syncOutbox)
      .innerJoin(eventLog, eq(eventLog.eventId, syncOutbox.eventId))
      .where(and(inArray(syncOutbox.status, ["pending", "failed"]), lt(syncOutbox.attempts, 10)))
      .orderBy(asc(syncOutbox.createdAt))
      .limit(limit)
      .all() as OutboxRow[];
  }

  async pushPending(): Promise<{ pushed: number; skipped: boolean }> {
    const events = this.pendingEvents();
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId || events.length === 0) {
      return { pushed: 0, skipped: true };
    }

    const response = await fetch(`${config.cloudUrl}/pos/ingest-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pos-sync-secret": config.syncSecret,
        "x-pos-installation-secret": config.syncSecret,
        "x-pos-installation-id": config.installationId
      },
      body: JSON.stringify({
        events: events.map((event) => ({
          eventId: event.eventId,
          type: event.type,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payloadJson: event.payload,
          createdAt: event.createdAt
        }))
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const message = `Convex sync failed with ${response.status}${body.error ? `: ${body.error}` : ""}`;
      this.markFailed(events, message);
      throw new Error(message);
    }

    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      for (const event of events) {
        tx.update(syncOutbox).set({ status: "synced", updatedAt: now }).where(eq(syncOutbox.id, event.id)).run();
      }
    });

    return { pushed: events.length, skipped: false };
  }

  requeueFailedEvents(): { requeued: number } {
    const result = this.db
      .update(syncOutbox)
      .set({ status: "pending", attempts: 0, lastError: null, updatedAt: new Date().toISOString() })
      .where(eq(syncOutbox.status, "failed"))
      .run();
    return { requeued: Number(result.changes ?? 0) };
  }

  async pullCloudSnapshot(): Promise<{ applied: number; failed: number; skipped: boolean; cursor?: string }> {
    const config = this.resolveConfig();
    if (!config.cloudUrl || !config.syncSecret || !config.installationId) {
      return { applied: 0, failed: 0, skipped: true };
    }

    const cursor = this.getSetting("cloud_snapshot_cursor");
    const response = await fetch(`${config.cloudUrl}/pos/pull-hub-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pos-sync-secret": config.syncSecret,
        "x-pos-installation-secret": config.syncSecret,
        "x-pos-installation-id": config.installationId
      },
      body: JSON.stringify({ cursor })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Convex pull failed with ${response.status}${body.error ? `: ${body.error}` : ""}`);
    }

    const body = (await response.json()) as { cursor?: string; commands?: CloudCommand[] };
    const commands = body.commands ?? [];
    let applied = 0;
    let failed = 0;
    this.db.transaction((tx) => {
      for (const command of commands) {
        try {
          this.applyCommand(command, tx);
          applied += 1;
        } catch (error) {
          failed += 1;
          this.recordCommandFailure(command, error, tx);
        }
      }
      if (body.cursor) this.upsertSetting("cloud_snapshot_cursor", body.cursor, tx);
    });

    return { applied, failed, skipped: false, cursor: body.cursor };
  }

  private applyCommand(command: CloudCommand, db: LocalWriteDb): void {
    const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (command.type === "device.revoked") {
      const hubDeviceId = this.requiredHubDeviceId(payload);
      if (hubDeviceId === "device-local-admin") return;
      db.update(localDevices)
        .set({ status: "revoked", revokedAt: now })
        .where(eq(localDevices.id, hubDeviceId))
        .run();
      return;
    }

    if (command.type === "device.updated") {
      const hubDeviceId = this.requiredHubDeviceId(payload);
      if (hubDeviceId === "device-local-admin") return;
      const update: { name?: string; role?: string; status?: string } = {};
      if (typeof payload.name === "string") update.name = payload.name;
      if (typeof payload.role === "string") update.role = payload.role;
      if (typeof payload.status === "string") update.status = payload.status;
      if (Object.keys(update).length > 0) {
        db.update(localDevices).set(update).where(eq(localDevices.id, hubDeviceId)).run();
      }
      return;
    }

    if (command.type === "production_unit.upsert") {
      const id = this.requiredString(payload.id, "production unit id");
      db.insert(productionUnits)
        .values({
          id,
          name: this.requiredString(payload.name, "production unit name"),
          printerMode: typeof payload.printerMode === "string" ? payload.printerMode : "network",
          printerName: typeof payload.printerName === "string" ? payload.printerName : null,
          printerHost: typeof payload.printerHost === "string" ? payload.printerHost : "",
          printerPort: typeof payload.printerPort === "number" ? payload.printerPort : 9100,
          kdsEnabled: typeof payload.kdsEnabled === "boolean" ? payload.kdsEnabled : true,
          active: typeof payload.active === "boolean" ? payload.active : true
        })
        .onConflictDoUpdate({
          target: productionUnits.id,
          set: {
            name: this.requiredString(payload.name, "production unit name"),
            printerMode: typeof payload.printerMode === "string" ? payload.printerMode : "network",
            printerName: typeof payload.printerName === "string" ? payload.printerName : null,
            printerHost: typeof payload.printerHost === "string" ? payload.printerHost : "",
            printerPort: typeof payload.printerPort === "number" ? payload.printerPort : 9100,
            kdsEnabled: typeof payload.kdsEnabled === "boolean" ? payload.kdsEnabled : true,
            active: typeof payload.active === "boolean" ? payload.active : true
          }
        })
        .run();
      return;
    }

    if (command.type === "menu_item.upsert") {
      const id = this.requiredString(payload.id, "menu item id");
      const pricePaise = this.requiredNumber(payload.pricePaise, "menu item price");
      db.insert(menuItems)
        .values({
          id,
          name: this.requiredString(payload.name, "menu item name"),
          pricePaise,
          productionUnitId: typeof payload.productionUnitId === "string" && payload.productionUnitId ? payload.productionUnitId : null,
          active: typeof payload.active === "boolean" ? payload.active : true
        })
        .onConflictDoUpdate({
          target: menuItems.id,
          set: {
            name: this.requiredString(payload.name, "menu item name"),
            pricePaise,
            productionUnitId: typeof payload.productionUnitId === "string" && payload.productionUnitId ? payload.productionUnitId : null,
            active: typeof payload.active === "boolean" ? payload.active : true
          }
        })
        .run();
      db.insert(menuItemVariants)
        .values({
          id: `${id}-default`,
          menuItemId: id,
          label: "Regular",
          kind: "default",
          pricePaise,
          volumeMl: null,
          inventoryAction: "none",
          sortOrder: 0,
          active: true
        })
        .onConflictDoUpdate({
          target: [menuItemVariants.menuItemId, menuItemVariants.kind],
          set: { pricePaise, active: typeof payload.active === "boolean" ? payload.active : true }
        })
        .run();
      return;
    }

    if (command.type === "menu_item.disabled") {
      const id = this.requiredString(payload.id, "menu item id");
      db.update(menuItems).set({ active: false }).where(eq(menuItems.id, id)).run();
      return;
    }

    if (command.type === "receipt_printer.updated") {
      this.upsertSetting("receipt_printer_mode", typeof payload.printerMode === "string" ? payload.printerMode : "system", db);
      this.upsertSetting("receipt_printer_name", typeof payload.printerName === "string" ? payload.printerName : "", db);
      this.upsertSetting("receipt_printer_host", typeof payload.printerHost === "string" ? payload.printerHost : "", db);
      this.upsertSetting(
        "receipt_printer_port",
        String(typeof payload.printerPort === "number" ? payload.printerPort : 9100),
        db
      );
    }
  }

  private markFailed(events: OutboxRow[], message: string): void {
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      for (const event of events) {
        tx.update(syncOutbox)
          .set({
            status: "failed",
            attempts: sql`${syncOutbox.attempts} + 1`,
            lastError: message,
            updatedAt: now
          })
          .where(eq(syncOutbox.id, event.id))
          .run();
      }
    });
  }

  private recordCommandFailure(command: CloudCommand, error: unknown, db: LocalWriteDb): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Cloud command failed";
    db.insert(cloudCommandFailures)
      .values({
        commandId: command.commandId,
        type: command.type,
        payloadJson: command.payloadJson,
        error: message,
        failedAt: now,
        createdAt: command.createdAt
      })
      .onConflictDoUpdate({
        target: cloudCommandFailures.commandId,
        set: { type: command.type, payloadJson: command.payloadJson, error: message, failedAt: now }
      })
      .run();
  }

  private getSetting(key: string): string | undefined {
    return this.db.select({ value: hubSettings.value }).from(hubSettings).where(eq(hubSettings.key, key)).get()?.value;
  }

  private resolveConfig(): HubConnectionSettingsInput {
    const provided = this.settingsProvider?.();
    return {
      cloudUrl: provided?.cloudUrl || this.getSetting("hub_connection_cloud_url") || this.convexUrl || "",
      installationId: provided?.installationId || this.getSetting("hub_connection_installation_id") || this.installationId || "",
      syncSecret: provided?.syncSecret || this.getSetting("hub_connection_sync_secret") || this.syncSecret || "",
      hubPublicUrl: provided?.hubPublicUrl || this.getSetting("hub_connection_public_url") || ""
    };
  }

  private upsertSetting(key: string, value: string, db: LocalWriteDb = this.db): void {
    db.insert(hubSettings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: hubSettings.key, set: { value, updatedAt: new Date().toISOString() } })
      .run();
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) throw new Error(`Cloud command missing ${label}`);
    return value;
  }

  private requiredNumber(value: unknown, label: string): number {
    if (typeof value !== "number") throw new Error(`Cloud command missing ${label}`);
    return value;
  }

  private requiredHubDeviceId(payload: Record<string, unknown>): string {
    const hubDeviceId = typeof payload.hubDeviceId === "string" ? payload.hubDeviceId : undefined;
    const legacyLocalDeviceId = typeof payload.localDeviceId === "string" ? payload.localDeviceId : undefined;
    const value = hubDeviceId ?? legacyLocalDeviceId;
    if (!value) throw new Error("Cloud command missing hub device id");
    return value;
  }
}
