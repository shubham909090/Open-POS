import type { LogoPrintSettings, PrintLayoutSettingsInput as PrintLayoutSettings } from "@gaurav-pos/shared";

export type { TallyExportSettingsInput as TallyExportSettings } from "@gaurav-pos/shared";

export interface PrintJob {
  id: string;
  target_type: string;
  target_id: string;
  table_name?: string | null;
  bill_number?: number | null;
  ticket_sequence?: number | null;
  printer_name?: string | null;
  status: string;
  attempts: number;
  last_error?: string | null;
  created_at: string;
}

export interface PrintProcessSummary {
  printed: number;
  failed: number;
  skipped?: number;
}

export interface SystemPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: string;
}

export type BillPrinterSlot = "default" | "alternate";

export interface BillPrinterProfile extends LogoPrintSettings {
  label: string;
  /** Physical roll override; null means the bill layout's paper width applies. */
  paperWidthMm: 45 | 50 | 58 | 80 | null;
  /** Payment QR size for this printer, already resolved from the legacy shared size. */
  paymentQrSizeMm: number;
  printerMode: "system" | "network";
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  configured: boolean;
}

export interface BillPrinters {
  default: BillPrinterProfile;
  alternate: BillPrinterProfile;
}

export interface HubConnectionSettings {
  configured: boolean;
  cloudUrl: string;
  installationId: string;
  syncSecret: string;
  hubPublicUrl: string;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

export type { PrintLayoutSettingsInput as PrintLayoutSettings } from "@gaurav-pos/shared";

export interface PrintLayouts {
  default: PrintLayoutSettings;
  receipt: PrintLayoutSettings;
  units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettings }>;
}
