import type { HubBootstrap } from "./hub-client";

export interface PairingPayload {
  kind: "gaurav-pos-pairing";
  version: number;
  hubUrl: string;
  code: string;
  deviceName?: string;
  role?: string;
  expiresAt?: string;
}

export function formatRupees(paise: number) {
  const rupees = paise / 100;
  return rupees % 1 === 0 ? rupees.toFixed(0) : rupees.toFixed(2);
}

export function amountInputToPaise(value: string) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function paiseToRupeeInput(paise: number) {
  const rupees = Math.max(0, paise) / 100;
  return rupees % 1 === 0 ? String(rupees.toFixed(0)) : rupees.toFixed(2);
}

export function parsePairingPayload(value: string): PairingPayload | null {
  const trimmed = value.trim();
  if (!trimmed || /^[0-9]{6}$/.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<PairingPayload>;
    if (parsed.kind !== "gaurav-pos-pairing" || !parsed.hubUrl || !parsed.code) return null;
    return {
      kind: "gaurav-pos-pairing",
      version: parsed.version ?? 1,
      hubUrl: parsed.hubUrl,
      code: parsed.code,
      deviceName: parsed.deviceName,
      role: parsed.role,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

export function normaliseHubUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "http://192.168.1.10:3737";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function createOperationKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

export function normalisePax(value: string) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function categoryToneFor(kind?: string) {
  if (kind === "alcohol") return { icon: "A", soft: "#fef2f2", ink: "#b91c1c" };
  if (kind === "beverage") return { icon: "B", soft: "#eff6ff", ink: "#1d4ed8" };
  if (kind === "food") return { icon: "F", soft: "#ecfdf5", ink: "#0f766e" };
  return { icon: "M", soft: "#f4f4f5", ink: "#52525b" };
}

export function approvalPayload(pin: string, reason: string, approvedBy: string) {
  return {
    managerApproval: {
      pin: pin.trim(),
      reason: reason.trim(),
      approvedBy: approvedBy || "Captain app"
    }
  };
}

export function findMenuVariant(menuItem: HubBootstrap["menuItems"][number] | undefined, variantId: string | undefined) {
  const variants = menuItem?.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}
