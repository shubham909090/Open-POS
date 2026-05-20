import type { PrintJobService } from "../printing/print-job-service.js";

export type PrintJobTotals = {
  printed: number;
  failed: number;
  skipped: number;
};

export function createPrintJobProcessor(printJobService: PrintJobService) {
  return async (printJobIds: string[] = []): Promise<PrintJobTotals> => {
    const totals = { printed: 0, failed: 0, skipped: 0 };
    for (const printJobId of printJobIds) {
      const result = await printJobService.processOne(printJobId);
      totals.printed += result.printed;
      totals.failed += result.failed;
      totals.skipped += result.skipped ? 1 : 0;
    }
    return totals;
  };
}
