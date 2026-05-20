import type { HubConnectionSettingsInput, PrintLayoutSettingsInput, TicketTemplateInput } from "@gaurav-pos/shared";

import {
  defaultPrintLayout,
  printLayoutKey,
  type SettingReader
} from "./printer-settings.js";

export type SettingWriter = (key: string, value: string) => void;

export function readHubConnectionSettings(read: SettingReader, reveal = false): {
  configured: boolean;
  cloudUrl: string;
  installationId: string;
  syncSecret: string;
  hubPublicUrl: string;
} {
  const syncSecret = read("hub_connection_sync_secret") ?? "";
  return {
    configured: Boolean((read("hub_connection_cloud_url") ?? "") && (read("hub_connection_installation_id") ?? "") && syncSecret),
    cloudUrl: read("hub_connection_cloud_url") ?? "",
    installationId: read("hub_connection_installation_id") ?? "",
    syncSecret: reveal && syncSecret ? syncSecret : syncSecret ? "••••••••••••" : "",
    hubPublicUrl: read("hub_connection_public_url") ?? ""
  };
}

export function readHubConnectionRuntimeSettings(read: SettingReader): HubConnectionSettingsInput {
  return {
    cloudUrl: read("hub_connection_cloud_url") ?? "",
    installationId: read("hub_connection_installation_id") ?? "",
    syncSecret: read("hub_connection_sync_secret") ?? "",
    hubPublicUrl: read("hub_connection_public_url") ?? ""
  };
}

export function writeHubConnectionSettings(read: SettingReader, write: SettingWriter, input: HubConnectionSettingsInput): { configured: boolean } {
  const existingSecret = read("hub_connection_sync_secret") ?? "";
  const nextSecret = input.syncSecret?.includes("•") ? existingSecret : (input.syncSecret ?? "");
  write("hub_connection_cloud_url", input.cloudUrl ?? "");
  write("hub_connection_installation_id", input.installationId ?? "");
  write("hub_connection_sync_secret", nextSecret);
  write("hub_connection_public_url", input.hubPublicUrl ?? "");
  return { configured: readHubConnectionSettings(read, false).configured };
}

export function ensureHubConnectionSettings(read: SettingReader, write: SettingWriter, input: HubConnectionSettingsInput): void {
  if (!input.cloudUrl && !input.installationId && !input.syncSecret && !input.hubPublicUrl) return;
  if (!read("hub_connection_cloud_url") && input.cloudUrl) write("hub_connection_cloud_url", input.cloudUrl);
  if (!read("hub_connection_installation_id") && input.installationId) write("hub_connection_installation_id", input.installationId);
  if (!read("hub_connection_sync_secret") && input.syncSecret) write("hub_connection_sync_secret", input.syncSecret);
  if (!read("hub_connection_public_url") && input.hubPublicUrl) write("hub_connection_public_url", input.hubPublicUrl);
}

export function readTicketTemplate(getPrintLayout: (scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string) => PrintLayoutSettingsInput): TicketTemplateInput {
  const layout = getPrintLayout("default");
  return {
    billHeader: layout.billHeader,
    billFooter: layout.billFooter,
    kotHeader: layout.kotHeader,
    kotFooter: layout.kotFooter,
    restaurantName: layout.restaurantName,
    restaurantAddress: layout.restaurantAddress,
    taxRegistrationText: layout.taxRegistrationText,
    lineWidthChars: layout.lineWidthChars
  };
}

export function writeTicketTemplate(read: SettingReader, write: SettingWriter, input: TicketTemplateInput): void {
  write("ticket_bill_header", input.billHeader ?? "");
  write("ticket_bill_footer", input.billFooter ?? "");
  write("ticket_kot_header", input.kotHeader ?? "");
  write("ticket_kot_footer", input.kotFooter ?? "");
  write("ticket_restaurant_name", input.restaurantName ?? "");
  write("ticket_restaurant_address", input.restaurantAddress ?? "");
  write("ticket_tax_registration_text", input.taxRegistrationText ?? "");
  write("ticket_line_width_chars", String(input.lineWidthChars ?? 42));
  write("print_layout_default", JSON.stringify({ ...defaultPrintLayout(read, "default"), ...input }));
}

export function readPrintLayout(read: SettingReader, scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string): PrintLayoutSettingsInput {
  const key = printLayoutKey(scope, productionUnitId);
  const stored = read(key);
  const fallback = defaultPrintLayout(read, scope, productionUnitId);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored) as Partial<PrintLayoutSettingsInput>;
    return {
      ...fallback,
      ...parsed,
      sectionStyles: { ...fallback.sectionStyles, ...(parsed.sectionStyles ?? {}) },
      scope,
      productionUnitId
    };
  } catch {
    return fallback;
  }
}

export function buildPrintLayoutForWrite(read: SettingReader, input: PrintLayoutSettingsInput): PrintLayoutSettingsInput {
  const fallback = defaultPrintLayout(read, input.scope, input.productionUnitId);
  return { ...fallback, ...input, sectionStyles: { ...fallback.sectionStyles, ...input.sectionStyles } };
}
