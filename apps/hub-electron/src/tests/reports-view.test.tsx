// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const historyEditBillMock = vi.fn();
const billPrintersMock = vi.fn();
const rangeReportMock = vi.fn();
const rangeReportCsvMock = vi.fn();
const rangeReportTallyMock = vi.fn();
const tallyExportSettingsMock = vi.fn();
const updateTallyExportSettingsMock = vi.fn();
const backupsMock = vi.fn();
const pendingRestoreMock = vi.fn();
const createBackupMock = vi.fn();
const scheduleRestoreMock = vi.fn();
const deleteBackupMock = vi.fn();
const cancelPendingRestoreMock = vi.fn();
const restartPendingRestoreMock = vi.fn();

describe("reports history payment edit", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    historyEditBillMock.mockReset();
    billPrintersMock.mockReset();
    rangeReportMock.mockReset();
    rangeReportCsvMock.mockReset();
    rangeReportTallyMock.mockReset();
    tallyExportSettingsMock.mockReset();
    updateTallyExportSettingsMock.mockReset();
    backupsMock.mockReset();
    pendingRestoreMock.mockReset();
    createBackupMock.mockReset();
    scheduleRestoreMock.mockReset();
    deleteBackupMock.mockReset();
    cancelPendingRestoreMock.mockReset();
    restartPendingRestoreMock.mockReset();
  });

  it("requires exact edited payment split and sends shared reference with history edit", async () => {
    const { ReportsView } = await importReportsView();
    historyEditBillMock.mockResolvedValue({ billId: "bill-1", revisionNumber: 2, totalPaise: 50_000, printJobId: "print-1", modified: true });
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Master PIN"), { target: { value: "9876" } });

    const saveButton = screen.getByRole("button", { name: "Save + Print" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("History Cash amount"), { target: { value: "200" } });
    expect(screen.getByText("₹300.00 remaining")).toBeTruthy();
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.focus(screen.getByLabelText("History UPI amount"));
    expect(screen.getByLabelText<HTMLInputElement>("History UPI amount").value).toBe("300");
    expect(screen.getByText("Payment exact")).toBeTruthy();
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("UPI ref, card slip, or owner note"), { target: { value: "UPI-7788" } });
    fireEvent.click(saveButton);
    fireEvent.click(await screen.findByRole("button", { name: /Default printer/ }));

    await waitFor(() => expect(historyEditBillMock).toHaveBeenCalled());
    expect(historyEditBillMock).toHaveBeenCalledWith(
      "bill-1",
      expect.objectContaining({
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" },
        payments: [
          { method: "cash", amountPaise: 20_000, reference: "UPI-7788" },
          { method: "upi", amountPaise: 30_000, reference: "UPI-7788" }
        ]
      }),
      expect.any(String),
      "default"
    );
  });

  it("switches to monthly range reports, shows missing dates, and lazily loads bill history", async () => {
    const { ReportsView } = await importReportsView();
    rangeReportMock.mockResolvedValue(rangeSummary(false));
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("tab", { name: "Monthly / Range" }));

    expect(await screen.findByText("Finalized business days only")).toBeTruthy();
    expect(await screen.findByText("Some selected dates have no finalized report.")).toBeTruthy();
    expect(screen.getByText("Missing: 2026-05-02")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Download Tally" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Daily breakdown")).toBeTruthy();
    expect(screen.getByText("Bill history is collapsed for performance.")).toBeTruthy();

    rangeReportMock.mockResolvedValue(rangeSummary(true));
    fireEvent.click(screen.getByRole("button", { name: "Load bill history" }));

    await waitFor(() => expect(rangeReportMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), true));
  });

  it("downloads complete range exports as CSV and Tally files", async () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:report-export") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    rangeReportMock.mockResolvedValue(rangeSummary(false, { missingDates: [], groupSummaries: [foodGroupSummary()] }));
    rangeReportCsvMock.mockResolvedValue(downloadedFile("gaurav-pos-report-2026-05-01-to-2026-05-03.zip"));
    rangeReportTallyMock.mockResolvedValue(downloadedFile("tally-vouchers-2026-05-01-to-2026-05-03.xml"));

    const { ReportsView } = await importReportsView();
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("tab", { name: "Monthly / Range" }));

    const csvButton = await screen.findByRole("button", { name: "Download CSV" });
    const tallyButton = await screen.findByRole("button", { name: "Download Tally" });
    expect((csvButton as HTMLButtonElement).disabled).toBe(false);
    expect((tallyButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(csvButton);
    await waitFor(() => expect(rangeReportCsvMock).toHaveBeenCalledWith(expect.any(String), expect.any(String)));

    fireEvent.click(tallyButton);
    await waitFor(() => expect(rangeReportTallyMock).toHaveBeenCalledWith(expect.any(String), expect.any(String)));

    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  });

  it("saves Tally ledger settings from the range report", async () => {
    rangeReportMock.mockResolvedValue(rangeSummary(false, { missingDates: [], groupSummaries: [foodGroupSummary()] }));
    updateTallyExportSettingsMock.mockImplementation(async (payload: unknown) => payload);

    const { ReportsView } = await importReportsView();
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("tab", { name: "Monthly / Range" }));
    fireEvent.click(await screen.findByText("Tally ledger settings"));
    fireEvent.change(await screen.findByLabelText("Cash ledger"), { target: { value: "Main Cash" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Tally settings" }));

    await waitFor(() => expect(updateTallyExportSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
      cashLedgerName: "Main Cash",
      saleLedgerNames: expect.objectContaining({ "sg-food": "Sales - Food" }),
    })));
  });

  it("blocks Tally download until edited ledger settings are saved", async () => {
    rangeReportMock.mockResolvedValue(rangeSummary(false, { missingDates: [], groupSummaries: [foodGroupSummary()] }));
    updateTallyExportSettingsMock.mockImplementation(async (payload: unknown) => payload);

    const { ReportsView } = await importReportsView();
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("tab", { name: "Monthly / Range" }));
    const csvButton = await screen.findByRole("button", { name: "Download CSV" });
    const tallyButton = await screen.findByRole("button", { name: "Download Tally" });

    fireEvent.click(await screen.findByText("Tally ledger settings"));
    fireEvent.change(await screen.findByLabelText("Cash ledger"), { target: { value: "Main Cash" } });

    expect(screen.getByText("Save Tally settings before Tally export.")).toBeTruthy();
    expect((csvButton as HTMLButtonElement).disabled).toBe(false);
    expect((tallyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(csvButton);
    await waitFor(() => expect(rangeReportCsvMock).toHaveBeenCalledWith(expect.any(String), expect.any(String)));
    expect(rangeReportTallyMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save Tally settings" }));
    await waitFor(() => expect(updateTallyExportSettingsMock).toHaveBeenCalled());
    await waitFor(() => expect((tallyButton as HTMLButtonElement).disabled).toBe(false));
  });

  it("creates manual backups and guards restore and delete with filename confirmation", async () => {
    const backup = manualBackup();
    const approval = { pin: "9876", reason: "Backup action", approvedBy: "owner" };
    const requestManagerApproval = vi.fn().mockResolvedValue(approval);
    backupsMock.mockResolvedValue([backup]);
    pendingRestoreMock.mockResolvedValue(null);
    createBackupMock.mockResolvedValue({ ...backup, label: "Before tax change" });
    scheduleRestoreMock.mockResolvedValue({ scheduled: true, restartRequired: true, restartNow: false, backup });
    deleteBackupMock.mockResolvedValue({ deleted: true, fileName: backup.fileName });

    const { ReportsView } = await importReportsView();
    renderReportsView(ReportsView, { requestManagerApproval });

    fireEvent.click(await screen.findByRole("tab", { name: "Backups" }));
    expect(await screen.findByText("Before festival menu")).toBeTruthy();
    expect(screen.getByText(backup.fileName)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Backup name"), { target: { value: "Before tax change" } });
    fireEvent.click(screen.getByRole("button", { name: /Create backup/ }));
    await waitFor(() => expect(createBackupMock).toHaveBeenCalledWith("Before tax change"));

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const scheduleButton = screen.getByRole("button", { name: "Schedule restore" });
    expect((scheduleButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Filename confirmation"), { target: { value: backup.fileName } });
    expect((scheduleButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(scheduleButton);

    await waitFor(() => expect(scheduleRestoreMock).toHaveBeenCalledWith({
      fileName: backup.fileName,
      confirmationText: backup.fileName,
      restartNow: false,
      masterApproval: approval,
    }));
    expect(requestManagerApproval).toHaveBeenCalledWith(expect.objectContaining({
      pinLabel: "Master PIN",
      approvedBy: "owner",
      danger: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const deleteButton = screen.getByRole("button", { name: "Delete backup" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Filename confirmation"), { target: { value: backup.fileName } });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteBackupMock).toHaveBeenCalledWith(backup.fileName, {
      confirmationText: backup.fileName,
      masterApproval: approval,
    }));
  });

  it("shows pending restore banner and handles restart and cancel approvals", async () => {
    const backup = manualBackup();
    const secondBackup = manualBackup({
      fileName: "after-tax-change-2026-05-20T11-00-00-000Z.sqlite",
      label: "After tax change",
    });
    const approval = { pin: "9876", reason: "Pending restore", approvedBy: "owner" };
    const requestManagerApproval = vi.fn().mockResolvedValue(approval);
    backupsMock.mockResolvedValue([backup, secondBackup]);
    pendingRestoreMock.mockResolvedValue({ requestedAt: "2026-05-20T10:00:00.000Z", backup });
    restartPendingRestoreMock.mockResolvedValue({ restarting: true, pendingRestore: { requestedAt: "2026-05-20T10:00:00.000Z", backup } });
    cancelPendingRestoreMock.mockResolvedValue({ canceled: true });

    const { ReportsView } = await importReportsView();
    renderReportsView(ReportsView, { requestManagerApproval });

    fireEvent.click(await screen.findByRole("tab", { name: "Backups" }));
    expect(await screen.findByText(/Restore pending: Before festival menu/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Restore" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Restart Hub now" }));
    await waitFor(() => expect(restartPendingRestoreMock).toHaveBeenCalledWith(approval));

    fireEvent.click(screen.getByRole("button", { name: "Cancel pending restore" }));
    await waitFor(() => expect(cancelPendingRestoreMock).toHaveBeenCalledWith(approval));
  });
});

async function importReportsView() {
  billPrintersMock.mockResolvedValue({
    default: { label: "Main bill printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, configured: true },
    alternate: { label: "Second bill printer", printerMode: "system", printerPort: 9100, configured: false }
  });
  if (!backupsMock.getMockImplementation()) backupsMock.mockResolvedValue([]);
  if (!pendingRestoreMock.getMockImplementation()) pendingRestoreMock.mockResolvedValue(null);
  if (!rangeReportCsvMock.getMockImplementation()) rangeReportCsvMock.mockResolvedValue(downloadedFile("range-report.zip"));
  if (!rangeReportTallyMock.getMockImplementation()) rangeReportTallyMock.mockResolvedValue(downloadedFile("range-report.xml"));
  if (!tallyExportSettingsMock.getMockImplementation()) tallyExportSettingsMock.mockResolvedValue(tallySettings());
  if (!updateTallyExportSettingsMock.getMockImplementation()) updateTallyExportSettingsMock.mockImplementation(async (payload: unknown) => payload);
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      currentBusinessDaySummary: vi.fn().mockResolvedValue(summary()),
      dailyReports: vi.fn().mockResolvedValue([]),
      dailyReport: vi.fn(),
      rangeReport: rangeReportMock,
      rangeReportCsv: rangeReportCsvMock,
      rangeReportTally: rangeReportTallyMock,
      tallyExportSettings: tallyExportSettingsMock,
      updateTallyExportSettings: updateTallyExportSettingsMock,
      alcoholStockMovements: vi.fn().mockResolvedValue([]),
      bootstrap: vi.fn().mockResolvedValue({ menuItems: [], setup: { masterPinConfigured: true } }),
      backups: backupsMock,
      pendingRestore: pendingRestoreMock,
      createBackup: createBackupMock,
      scheduleRestore: scheduleRestoreMock,
      deleteBackup: deleteBackupMock,
      cancelPendingRestore: cancelPendingRestoreMock,
      restartPendingRestore: restartPendingRestoreMock,
      historyEditBill: historyEditBillMock,
      historyReprintBill: vi.fn(),
      billPrinters: billPrintersMock
    }
  }));
  return import("../renderer/components/reports/reports-view.js");
}

function rangeSummary(includeBills: boolean, overrides: Record<string, unknown> = {}) {
  return {
    range: { from: "2026-05-01", to: "2026-05-03" },
    availableDays: [
      {
        pos_day_id: "day-1",
        business_date: "2026-05-01",
        status: "finalized",
        bill_count: 1,
        gross_sales_paise: 50_000,
        discount_paise: 0,
        tip_paise: 0,
        final_sales_paise: 50_000,
        cash_payments_paise: 50_000,
        upi_payments_paise: 0,
        card_payments_paise: 0,
        online_payments_paise: 0,
        total_payments_paise: 50_000,
        finalized_at: "2026-05-01T19:00:00.000Z"
      }
    ],
    missingDates: ["2026-05-02"],
    unfinalizedDates: [],
    openOrders: 0,
    billedOrders: 0,
    paidBills: 1,
    unpaidBills: 0,
    cancelledOrders: 0,
    billCount: 1,
    grossSalesPaise: 50_000,
    discountPaise: 0,
    tipPaise: 0,
    finalSalesPaise: 50_000,
    cashPaymentsPaise: 50_000,
    upiPaymentsPaise: 0,
    cardPaymentsPaise: 0,
    onlinePaymentsPaise: 0,
    totalPaymentsPaise: 50_000,
    nonCashPaymentsPaise: 0,
    itemSummaries: [],
    groupSummaries: [],
    ...(includeBills ? { billSummaries: summary().billSummaries } : {}),
    ...overrides,
  };
}

function foodGroupSummary() {
  return {
    saleGroupId: "sg-food",
    name: "Food",
    kind: "food",
    quantity: 1,
    grossSalesPaise: 50_000,
    taxPaise: 0,
    finalSalesPaise: 50_000,
    ncQuantity: 0,
    ncGrossSalesPaise: 0,
  };
}

function tallySettings() {
  return {
    voucherTypeName: "Sales",
    cashLedgerName: "Cash",
    upiLedgerName: "UPI",
    cardLedgerName: "Card",
    onlineLedgerName: "Online",
    discountLedgerName: "Discounts Given",
    tipLedgerName: "Tips Received",
    saleLedgerNames: {},
  };
}

function downloadedFile(fileName: string) {
  return { blob: new Blob(["ok"]), fileName };
}

function renderReportsView(
  ReportsView: typeof import("../renderer/components/reports/reports-view.js").ReportsView,
  options: { requestManagerApproval?: ReturnType<typeof vi.fn> } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsView requestManagerApproval={options.requestManagerApproval ?? vi.fn()} />
    </QueryClientProvider>
  );
}

function manualBackup(overrides: Partial<ReturnType<typeof manualBackupShape>> = {}) {
  return { ...manualBackupShape(), ...overrides };
}

function manualBackupShape() {
  return {
    fileName: "before-festival-menu-2026-05-20T10-00-00-000Z.sqlite",
    path: "/tmp/backups/before-festival-menu-2026-05-20T10-00-00-000Z.sqlite",
    label: "Before festival menu",
    kind: "manual" as const,
    sizeBytes: 1024 * 512,
    createdAt: "2026-05-20T10:00:00.000Z",
  };
}

function summary() {
  return {
    businessDay: { id: "day-1", business_date: "2026-05-20", period_start_at: "", period_end_at: "", status: "active" },
    billCount: 1,
    orderCount: 1,
    cancelledOrders: 0,
    grossSalesPaise: 50_000,
    taxPaise: 0,
    discountPaise: 0,
    tipPaise: 0,
    finalSalesPaise: 50_000,
    cashPaymentsPaise: 50_000,
    upiPaymentsPaise: 0,
    cardPaymentsPaise: 0,
    onlinePaymentsPaise: 0,
    totalPaymentsPaise: 50_000,
    nonCashPaymentsPaise: 0,
    billSummaries: [
      {
        billId: "bill-1",
        billNumber: 7,
        orderId: "order-1",
        tableName: "T1",
        status: "paid",
        subtotalPaise: 50_000,
        taxPaise: 0,
        totalPaise: 50_000,
        discountPaise: 0,
        tipPaise: 0,
        finalTotalPaise: 50_000,
        paidPaise: 50_000,
        settledAt: "2026-05-20T10:00:00.000Z",
        payments: [{ method: "cash", amountPaise: 50_000, reference: null }],
        items: [
          {
            orderItemId: "order-item-1",
            menuItemId: "item-1",
            menuItemVariantId: null,
            saleGroupId: "sg-food",
            productionUnitId: "unit-kitchen",
            name: "Dal Fry",
            quantity: 1,
            unitPricePaise: 50_000,
            lineTotalPaise: 50_000
          }
        ],
        isNc: false,
        revisionNumber: 1,
        modified: false
      }
    ],
    itemSummaries: [],
    groupSummaries: []
  };
}
