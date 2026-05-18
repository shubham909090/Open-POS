import { createHash, randomBytes, randomInt } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type {
  CreatePairingCodeInput,
  ExchangePairingCodeInput,
  RevokeDeviceInput,
  UserRole
} from "@gaurav-pos/shared";
import type { HubOrm } from "../db/database.js";
import { localDevices, pairingCodes } from "../db/drizzle-schema.js";
import { DomainError } from "./errors.js";
import { makeId } from "./ids.js";

export interface LocalDeviceSession {
  id: string;
  name: string;
  role: UserRole;
}

interface LocalDeviceRow {
  id: string;
  name: string;
  role: UserRole;
  status: string;
}

interface PairingCodeRow {
  id: string;
  deviceName: string;
  role: UserRole;
  status: string;
  expiresAt: string;
}

export class AuthService {
  constructor(private readonly db: HubOrm) {}

  seedAdminDevice(token?: string): void {
    if (!token) return;
    const now = new Date().toISOString();
    this.db
      .insert(localDevices)
      .values({
        id: "device-local-admin",
        name: "Local Admin",
        role: "admin",
        tokenHash: this.hash(token),
        status: "active",
        createdAt: now
      })
      .onConflictDoUpdate({
        target: localDevices.id,
        set: {
          name: "Local Admin",
          role: "admin",
          tokenHash: this.hash(token),
          status: "active",
          lastSeenAt: now
        }
      })
      .run();
  }

  createAdminSession(token: string, name = "Admin session"): LocalDeviceSession {
    const now = new Date().toISOString();
    const id = `device-admin-session-${randomBytes(12).toString("base64url")}`;
    this.db
      .insert(localDevices)
      .values({
        id,
        name,
        role: "admin",
        tokenHash: this.hash(token),
        status: "active",
        createdAt: now,
        lastSeenAt: now
      })
      .run();
    return { id, name, role: "admin" };
  }

  lockAdminDevice(): void {
    const now = new Date().toISOString();
    const throwawayHash = this.hash(`locked-${randomBytes(32).toString("base64url")}`);
    this.db
      .update(localDevices)
      .set({
        tokenHash: throwawayHash,
        status: "revoked",
        revokedAt: now,
        lastSeenAt: now
      })
      .where(eq(localDevices.id, "device-local-admin"))
      .run();
  }

  revokeToken(token: string | undefined): void {
    if (!token) throw new DomainError("Missing device token", 401);
    const now = new Date().toISOString();
    const result = this.db
      .update(localDevices)
      .set({ status: "revoked", revokedAt: now, lastSeenAt: now })
      .where(eq(localDevices.tokenHash, this.hash(token)))
      .run();
    if (result.changes === 0) throw new DomainError("Invalid or revoked device token", 401);
  }

  authenticate(token: string | undefined): LocalDeviceSession {
    if (!token) throw new DomainError("Missing device token", 401);
    const tokenHash = this.hash(token);
    const row = this.db
      .select({
        id: localDevices.id,
        name: localDevices.name,
        role: localDevices.role,
        status: localDevices.status
      })
      .from(localDevices)
      .where(eq(localDevices.tokenHash, tokenHash))
      .get() as LocalDeviceRow | undefined;

    if (!row || row.status !== "active") throw new DomainError("Invalid or revoked device token", 401);

    this.db.update(localDevices).set({ lastSeenAt: new Date().toISOString() }).where(eq(localDevices.id, row.id)).run();

    return {
      id: row.id,
      name: row.name,
      role: row.role
    };
  }

  createPairingCode(input: CreatePairingCodeInput): { id: string; code: string; expiresAt: string } {
    const id = makeId("pair");
    const code = this.generateCode();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000).toISOString();

    this.db
      .insert(pairingCodes)
      .values({
        id,
        codeHash: this.hash(code),
        deviceName: input.deviceName,
        role: input.role,
        status: "pending",
        expiresAt,
        createdAt: now
      })
      .run();

    return { id, code, expiresAt };
  }

  exchangePairingCode(input: ExchangePairingCodeInput): {
    deviceId: string;
    deviceName: string;
    role: UserRole;
    token: string;
  } {
    return this.db.transaction((tx) => {
      const codeHash = this.hash(input.code);
      const code = tx.select().from(pairingCodes).where(eq(pairingCodes.codeHash, codeHash)).get() as PairingCodeRow | undefined;

      if (!code || code.status !== "pending") throw new DomainError("Pairing code is invalid", 401);
      if (new Date(code.expiresAt).getTime() < Date.now()) throw new DomainError("Pairing code has expired", 401);

      const token = `hub_${randomBytes(32).toString("base64url")}`;
      const deviceId = makeId("device");
      const now = new Date().toISOString();
      const deviceName = input.deviceName || code.deviceName;

      tx.insert(localDevices)
        .values({
          id: deviceId,
          name: deviceName,
          role: code.role,
          tokenHash: this.hash(token),
          status: "active",
          createdAt: now
        })
        .run();

      tx.update(pairingCodes)
        .set({ status: "used", usedAt: now, usedDeviceId: deviceId })
        .where(eq(pairingCodes.id, code.id))
        .run();

      return { deviceId, deviceName, role: code.role, token };
    });
  }

  listDevices(): unknown[] {
    return this.db
      .select({
        id: localDevices.id,
        name: localDevices.name,
        role: localDevices.role,
        status: localDevices.status,
        created_at: localDevices.createdAt,
        last_seen_at: localDevices.lastSeenAt,
        revoked_at: localDevices.revokedAt
      })
      .from(localDevices)
      .orderBy(desc(localDevices.createdAt))
      .all();
  }

  revokeDevice(deviceId: string, _input: RevokeDeviceInput): { id: string } {
    if (deviceId === "device-local-admin") throw new DomainError("The local admin bootstrap device cannot be revoked");
    const result = this.db
      .update(localDevices)
      .set({ status: "revoked", revokedAt: new Date().toISOString() })
      .where(eq(localDevices.id, deviceId))
      .run();
    if (result.changes === 0) throw new DomainError("Device not found", 404);
    return { id: deviceId };
  }

  private generateCode(): string {
    return String(randomInt(100_000, 999_999));
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
