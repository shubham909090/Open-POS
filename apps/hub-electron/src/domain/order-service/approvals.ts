import type { ManagerApprovalInput, MasterApprovalInput } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { HubOrm } from "../../db/database.js";
import { hubSettings, managerApprovals } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";

type ApprovalInput = ManagerApprovalInput | MasterApprovalInput;

export function hashApprovalPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2-sha256:210000:${salt}:${hash}`;
}

function legacyHashApprovalPin(pin: string): string {
  return createHash("sha256").update(`gaurav-pos:${pin}`).digest("hex");
}

export function verifyApprovalPin(pin: string, configuredHash: string): "valid" | "valid_legacy" | "invalid" {
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
  return legacyHashApprovalPin(pin) === configuredHash ? "valid_legacy" : "invalid";
}

export function verifyApproval(input: {
  orm: HubOrm;
  approval: ApprovalInput | undefined;
  configuredHash: string | undefined;
  settingKey: "manager_pin_hash" | "master_pin_hash";
  missingConfiguredMessage: string;
  missingApprovalMessage: string;
  invalidPinMessage: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  requestedBy: string;
}): void {
  if (!input.configuredHash) throw new DomainError(input.missingConfiguredMessage, 403);
  if (!input.approval) throw new DomainError(input.missingApprovalMessage, 403);
  const verification = verifyApprovalPin(input.approval.pin, input.configuredHash);
  if (verification === "invalid") throw new DomainError(input.invalidPinMessage, 403);
  if (verification === "valid_legacy") {
    input.orm
      .update(hubSettings)
      .set({ value: hashApprovalPin(input.approval.pin), updatedAt: new Date().toISOString() })
      .where(eq(hubSettings.key, input.settingKey))
      .run();
  }
  input.orm
    .insert(managerApprovals)
    .values({
      id: makeId("approval"),
      action: input.action,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      reason: input.approval.reason,
      approvedBy: input.approval.approvedBy,
      requestedBy: input.requestedBy,
      createdAt: new Date().toISOString()
    })
    .run();
}
