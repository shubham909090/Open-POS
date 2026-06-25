export type { TallyExportSettingsInput as TallyExportSettings } from "@gaurav-pos/shared";

export interface PrintJob {
  id: string;
  target_type: string;
  target_id: string;
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

export interface BillPrinterProfile {
  label: string;
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

export interface PrintLayoutSettings {
  scope: "default" | "receipt" | "unit";
  productionUnitId?: string;
  restaurantName: string;
  restaurantAddress: string;
  taxRegistrationText: string;
  billHeader: string;
  billFooter: string;
  kotHeader: string;
  kotFooter: string;
  lineWidthChars: number;
  headerAlign: "left" | "center";
  footerAlign: "left" | "center";
  sectionStyles: Record<string, { size: "small" | "normal" | "large"; bold: boolean; align: "left" | "center" | "right" }>;
  topPaddingLines: number;
  feedLines: number;
  showTable: boolean;
  showCaptain: boolean;
  showDateTime: boolean;
  showBillId: boolean;
  showTaxBreakup: boolean;
  showPaymentSplit: boolean;
  showDiscountTip: boolean;
  showNcReprintRevision: boolean;
}

export interface PrintLayouts {
  default: PrintLayoutSettings;
  receipt: PrintLayoutSettings;
  units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettings }>;
}
