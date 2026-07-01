import { v } from "convex/values";

export const backupDomainValues = [
  "pos_days",
  "orders",
  "order_items",
  "bills",
  "bill_revisions",
  "bill_modification_audits",
  "payments",
  "sale_groups",
  "floors",
  "restaurant_tables",
  "production_units",
  "menu_items",
  "menu_item_variants",
  "alcohol_profiles",
  "alcohol_stock_levels",
  "alcohol_recipe_ingredients",
  "alcohol_stock_movements"
] as const;

export type BackupDomain = (typeof backupDomainValues)[number];
export type BackupBatchRow = {
  domain: BackupDomain;
  localId: string;
  businessDate?: string;
  localUpdatedAt?: string;
  payloadJson: string;
  payloadHash: string;
  deletedAt?: string;
  sourceVersion: number;
};

export const backupDomainValidator = v.union(
  v.literal("pos_days"),
  v.literal("orders"),
  v.literal("order_items"),
  v.literal("bills"),
  v.literal("bill_revisions"),
  v.literal("bill_modification_audits"),
  v.literal("payments"),
  v.literal("sale_groups"),
  v.literal("floors"),
  v.literal("restaurant_tables"),
  v.literal("production_units"),
  v.literal("menu_items"),
  v.literal("menu_item_variants"),
  v.literal("alcohol_profiles"),
  v.literal("alcohol_stock_levels"),
  v.literal("alcohol_recipe_ingredients"),
  v.literal("alcohol_stock_movements")
);

export const licenseStatusValidator = v.union(
  v.literal("active"),
  v.literal("redeemed"),
  v.literal("revoked"),
  v.literal("expired")
);

export const activationStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("reset"),
  v.literal("revoked")
);

export const leaseStatusValidator = v.union(
  v.literal("active"),
  v.literal("warning"),
  v.literal("expired"),
  v.literal("suspended"),
  v.literal("revoked")
);

export const backupBatchRowValidator = v.object({
  domain: backupDomainValidator,
  localId: v.string(),
  businessDate: v.optional(v.string()),
  localUpdatedAt: v.optional(v.string()),
  payloadJson: v.string(),
  payloadHash: v.string(),
  deletedAt: v.optional(v.string()),
  sourceVersion: v.number()
});

export const backupRestorePageValidator = v.object({
  cursor: v.optional(v.string()),
  rows: v.array(
    v.object({
      domain: backupDomainValidator,
      localId: v.string(),
      businessDate: v.optional(v.string()),
      localUpdatedAt: v.optional(v.string()),
      payloadJson: v.string(),
      payloadHash: v.string(),
      deletedAt: v.optional(v.string()),
      sourceVersion: v.number(),
      updatedAt: v.string()
    })
  )
});

export function isBackupDomain(value: string): value is BackupDomain {
  return (backupDomainValues as readonly string[]).includes(value);
}

export function normalizeSetupKey(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function sha256Hex(input: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)).then((buffer) =>
    Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

export function addMonthsUtc(startIso: string, months: number) {
  const start = new Date(startIso);
  const result = new Date(start.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

export function addDaysUtc(startIso: string, days: number) {
  const start = new Date(startIso);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
