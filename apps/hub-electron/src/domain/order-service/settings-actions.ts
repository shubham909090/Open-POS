import type {
  DomainEvent,
  HubConnectionSettingsInput,
  ManagerApprovalInput,
  ManagerPinInput,
  MasterApprovalInput,
  PrintLayoutSettingsInput,
  SetMasterPinInput,
  TicketTemplateInput
} from "@gaurav-pos/shared";

import { DomainError } from "../errors.js";
import { hashApprovalPin, verifyApprovalPin } from "./approvals.js";
import { printLayoutKey } from "./printer-settings.js";
import {
  buildPrintLayoutForWrite,
  ensureHubConnectionSettings as ensureHubConnectionSettingsModel,
  readHubConnectionRuntimeSettings,
  readHubConnectionSettings,
  readPrintLayout,
  readTicketTemplate,
  writeHubConnectionSettings,
  writeTicketTemplate
} from "./settings-models.js";

export type SettingsActionContext = {
  readSetting: (key: string) => string | undefined;
  writeSetting: (key: string, value: string) => void;
  listProductionUnits: () => unknown[];
  requireProductionUnit: (productionUnitId: string) => void;
  verifyManagerApproval: (input: ManagerApprovalInput | undefined, action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  verifyMasterApproval: (input: MasterApprovalInput | undefined, action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function setManagerPin(ctx: SettingsActionContext, input: ManagerPinInput): { configured: boolean } {
  const currentHash = ctx.readSetting("manager_pin_hash");
  if (currentHash) {
    ctx.verifyManagerApproval(
      { pin: input.currentPin ?? "", reason: "Manager PIN changed", approvedBy: input.updatedBy },
      "manager_pin.update",
      "hub_setting",
      "manager_pin"
    );
  }
  ctx.writeSetting("manager_pin_hash", hashApprovalPin(input.newPin));
  ctx.appendEvent("manager_pin.updated", "hub_setting", "manager_pin", { updatedBy: input.updatedBy });
  return { configured: true };
}

export function setMasterPin(ctx: SettingsActionContext, input: SetMasterPinInput): { configured: boolean } {
  const currentHash = ctx.readSetting("master_pin_hash");
  if (currentHash) {
    ctx.verifyMasterApproval(
      input.currentPin ? { pin: input.currentPin, reason: "Master PIN changed", approvedBy: input.updatedBy } : undefined,
      "master_pin.update",
      "hub_setting",
      "master_pin",
      input.updatedBy
    );
  }
  ctx.writeSetting("master_pin_hash", hashApprovalPin(input.newPin));
  ctx.appendEvent(currentHash ? "master_pin.updated" : "master_pin.created", "hub_setting", "master_pin", { updatedBy: input.updatedBy });
  return { configured: true };
}

export function isManagerPinConfigured(ctx: SettingsActionContext): boolean {
  return Boolean(ctx.readSetting("manager_pin_hash"));
}

export function isMasterPinConfigured(ctx: SettingsActionContext): boolean {
  return Boolean(ctx.readSetting("master_pin_hash"));
}

export function verifyManagerPinForSession(ctx: SettingsActionContext, pin: string): void {
  const configuredHash = ctx.readSetting("manager_pin_hash");
  if (!configuredHash) throw new DomainError("Create a Manager PIN before unlocking setup", 403);
  const verification = verifyApprovalPin(pin, configuredHash);
  if (verification === "invalid") throw new DomainError("Manager PIN is incorrect", 403);
  if (verification === "valid_legacy") ctx.writeSetting("manager_pin_hash", hashApprovalPin(pin));
}

export function getHubConnectionSettings(
  ctx: SettingsActionContext,
  reveal = false
): {
  configured: boolean;
  cloudUrl: string;
  installationId: string;
  syncSecret: string;
  hubPublicUrl: string;
} {
  return readHubConnectionSettings(ctx.readSetting, reveal);
}

export function getHubConnectionRuntimeSettings(ctx: SettingsActionContext): HubConnectionSettingsInput {
  return readHubConnectionRuntimeSettings(ctx.readSetting);
}

export function updateHubConnectionSettings(ctx: SettingsActionContext, input: HubConnectionSettingsInput): { configured: boolean } {
  const result = writeHubConnectionSettings(ctx.readSetting, ctx.writeSetting, input);
  ctx.appendEvent("hub_connection.updated", "hub_setting", "hub_connection", {
    cloudUrl: input.cloudUrl,
    installationId: input.installationId,
    hubPublicUrl: input.hubPublicUrl,
    syncSecretConfigured: Boolean(input.syncSecret)
  });
  return result;
}

export function ensureHubConnectionSettings(ctx: SettingsActionContext, input: HubConnectionSettingsInput): void {
  ensureHubConnectionSettingsModel(ctx.readSetting, ctx.writeSetting, input);
}

export function getTicketTemplate(ctx: SettingsActionContext): TicketTemplateInput {
  return readTicketTemplate((scope, productionUnitId) => getPrintLayout(ctx, scope, productionUnitId));
}

export function updateTicketTemplate(ctx: SettingsActionContext, input: TicketTemplateInput): TicketTemplateInput {
  writeTicketTemplate(ctx.readSetting, ctx.writeSetting, input);
  ctx.appendEvent("ticket_template.updated", "hub_setting", "ticket_template", input);
  return getTicketTemplate(ctx);
}

export function getPrintLayouts(ctx: SettingsActionContext): {
  default: PrintLayoutSettingsInput;
  receipt: PrintLayoutSettingsInput;
  units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettingsInput }>;
} {
  const units = (ctx.listProductionUnits() as Array<{ id: string; name: string }>).map((unit) => ({
    productionUnitId: unit.id,
    name: unit.name,
    layout: getPrintLayout(ctx, "unit", unit.id)
  }));
  return {
    default: getPrintLayout(ctx, "default"),
    receipt: getPrintLayout(ctx, "receipt"),
    units
  };
}

export function getPrintLayout(ctx: SettingsActionContext, scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string): PrintLayoutSettingsInput {
  return readPrintLayout(ctx.readSetting, scope, productionUnitId);
}

export function updatePrintLayout(ctx: SettingsActionContext, input: PrintLayoutSettingsInput): PrintLayoutSettingsInput {
  if (input.scope === "unit" && !input.productionUnitId) throw new DomainError("Choose a kitchen or counter for this layout");
  if (input.scope === "unit" && input.productionUnitId) ctx.requireProductionUnit(input.productionUnitId);
  const layout = buildPrintLayoutForWrite(ctx.readSetting, input);
  const key = printLayoutKey(input.scope, input.productionUnitId);
  ctx.writeSetting(key, JSON.stringify(layout));
  ctx.appendEvent("print_layout.updated", "hub_setting", key, {
    scope: input.scope,
    productionUnitId: input.productionUnitId ?? null
  });
  return layout;
}
