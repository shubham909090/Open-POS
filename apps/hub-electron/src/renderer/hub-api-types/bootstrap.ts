import type { Floor, MenuItem, PosDay, ProductionUnit, SaleGroup, Table } from "./catalog.js";
import type { HubConnectionSettings, PrintJob, PrintLayouts } from "./printing.js";

export interface Bootstrap {
  currentBusinessDay: PosDay;
  floors: Floor[];
  tables: Table[];
  productionUnits: ProductionUnit[];
  saleGroups: SaleGroup[];
  menuItems: MenuItem[];
  menuPopularity?: Array<{ menuItemId: string; quantity: number }>;
  ticketTemplate?: {
    billHeader: string;
    billFooter: string;
    kotHeader: string;
    kotFooter: string;
    restaurantName: string;
    restaurantAddress: string;
    taxRegistrationText: string;
    lineWidthChars: number;
  };
  printLayouts?: PrintLayouts;
  printJobs: PrintJob[];
  syncStatus: {
    counts?: Record<string, number>;
    lastEvent?: unknown;
    commandFailures?: Array<{ commandId: string; type: string; error: string; failedAt: string }>;
  };
  setup?: {
    printerOutputMode: "test" | "live";
    managerPinConfigured?: boolean;
    masterPinConfigured?: boolean;
    cloudBackupEnabled?: boolean;
    hubConnection?: HubConnectionSettings;
    license?: {
      status: "missing" | "active" | "warning" | "locked";
      reason?: string;
      message: string;
      checkedAt?: string;
      licenseValidUntil?: string;
      leaseExpiresAt?: string;
      hoursUntilOfflineLock?: number;
    };
  };
}
