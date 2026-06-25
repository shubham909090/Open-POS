import {
  hubConnectionSettingsSchema,
  managerPinSchema,
  managerPinUnlockSchema,
  printLayoutSettingsSchema,
  setMasterPinSchema,
  tallyExportSettingsSchema,
  ticketTemplateSchema,
  updateCloudBackupSchema,
  updateBillPrintersSchema,
  updatePrinterOutputModeSchema,
  updateReceiptPrinterSchema
} from "@gaurav-pos/shared";
import { DomainError } from "../domain/errors.js";
import { listSystemPrinters } from "../printing/printer-discovery.js";
import type { HeaderRequest, HubRouteContext } from "./route-context.js";

type LocalRequest = HeaderRequest & {
  ip?: string;
  socket?: { remoteAddress?: string };
};

function isLocalRequest(request: LocalRequest): boolean {
  const address = request.ip || request.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address === "localhost";
}

export function registerSettingsRoutes({ app, input, auth }: HubRouteContext): void {
  const { adminOnly, captainOrAdmin } = auth;

  const requireManagerPinHeader = (request: HeaderRequest): void => {
    const rawPin = request.headers["x-manager-pin"];
    const pin = typeof rawPin === "string" ? rawPin : "";
    input.orderService.verifyManagerPinForSession(managerPinUnlockSchema.parse({ pin }).pin);
  };

  app.get("/settings/receipt-printer", { preHandler: captainOrAdmin }, async () => input.orderService.getReceiptPrinter());
  app.get("/settings/bill-printers", { preHandler: captainOrAdmin }, async () => input.orderService.getBillPrinters());
  app.get("/settings/printer-mode", { preHandler: adminOnly }, async () => ({ mode: input.orderService.getPrinterOutputMode() }));
  app.put("/settings/printer-mode", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updatePrinterOutputMode(updatePrinterOutputModeSchema.parse(request.body).mode);
    input.eventBus.publish({ type: "printer_output_mode.updated", result });
    return result;
  });

  app.get("/system-printers", { preHandler: adminOnly }, async (request) => {
    const query = request.query as { refresh?: string };
    return listSystemPrinters({ forceRefresh: query.refresh === "1" || query.refresh === "true" });
  });
  app.put("/settings/receipt-printer", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateReceiptPrinter(updateReceiptPrinterSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
    return result;
  });
  app.put("/settings/bill-printers", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateBillPrinters(updateBillPrintersSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
    return result;
  });

  app.put("/settings/manager-pin", async (request) => {
    if (input.orderService.isManagerPinConfigured()) await adminOnly(request);
    else if (!isLocalRequest(request)) throw new DomainError("Create the first Manager PIN from the hub PC.", 403);
    const result = input.orderService.setManagerPin(managerPinSchema.parse(request.body));
    input.eventBus.publish({ type: "manager_pin.updated", result });
    return result;
  });
  app.get("/settings/master-pin/status", { preHandler: adminOnly }, async () => ({ masterPinConfigured: input.orderService.isMasterPinConfigured() }));
  app.put("/settings/master-pin", { preHandler: adminOnly }, async (request) => {
    const wasConfigured = input.orderService.isMasterPinConfigured();
    const result = input.orderService.setMasterPin(setMasterPinSchema.parse(request.body));
    input.eventBus.publish({ type: wasConfigured ? "master_pin.updated" : "master_pin.created", result });
    return result;
  });

  app.get("/settings/hub-connection", { preHandler: adminOnly }, async (request) => {
    const query = request.query as { reveal?: string };
    const reveal = query.reveal === "1" || query.reveal === "true";
    if (reveal) requireManagerPinHeader(request);
    return input.orderService.getHubConnectionSettings(reveal);
  });
  app.put("/settings/hub-connection", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const result = input.orderService.updateHubConnectionSettings(hubConnectionSettingsSchema.parse(request.body));
    input.eventBus.publish({ type: "hub_connection.updated", result });
    return result;
  });
  app.get("/settings/cloud-backup", { preHandler: adminOnly }, async () => ({ enabled: input.orderService.isCloudBackupEnabled() }));
  app.put("/settings/cloud-backup", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateCloudBackupEnabled(updateCloudBackupSchema.parse(request.body));
    input.eventBus.publish({ type: "cloud_backup.updated", result });
    return result;
  });
  app.get("/settings/tally-export", { preHandler: captainOrAdmin }, async () => input.orderService.getTallyExportSettings());
  app.put("/settings/tally-export", { preHandler: captainOrAdmin }, async (request) => {
    const parsed = tallyExportSettingsSchema.safeParse(request.body);
    if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Invalid Tally export settings", 400);
    const result = input.orderService.updateTallyExportSettings(parsed.data);
    input.eventBus.publish({ type: "tally_export_settings.updated", result });
    return result;
  });
  app.post("/settings/hub-connection/test", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const settings = input.orderService.getHubConnectionRuntimeSettings();
    if (!settings.cloudUrl || !settings.installationId || !settings.syncSecret) {
      return { status: "missing", message: "Cloud connection details are incomplete." };
    }
    try {
      const response = await fetch(`${settings.cloudUrl}/pos/license-check`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pos-sync-secret": settings.syncSecret,
          "x-pos-installation-secret": settings.syncSecret,
          "x-pos-installation-id": settings.installationId
        },
        body: JSON.stringify({})
      });
      if (response.status === 401 || response.status === 403) return { status: "unauthorized", message: "Cloud rejected these connection details." };
      if (!response.ok) return { status: "server_error", message: `Cloud returned HTTP ${response.status}.` };
      return { status: "connected", message: "Cloud connection works." };
    } catch (error) {
      return { status: "server_error", message: error instanceof Error ? error.message : "Cloud connection test failed." };
    }
  });

  app.get("/settings/ticket-template", { preHandler: captainOrAdmin }, async () => input.orderService.getTicketTemplate());
  app.put("/settings/ticket-template", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateTicketTemplate(ticketTemplateSchema.parse(request.body));
    input.eventBus.publish({ type: "ticket_template.updated", result });
    return result;
  });
  app.get("/print-layouts", { preHandler: captainOrAdmin }, async () => input.orderService.getPrintLayouts());
  app.put("/print-layouts/:scope", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const params = request.params as { scope: string };
    const result = input.orderService.updatePrintLayout(printLayoutSettingsSchema.parse({ ...(request.body as Record<string, unknown>), scope: params.scope }));
    input.eventBus.publish({ type: "print_layout.updated", result });
    return result;
  });
}
