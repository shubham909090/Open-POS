// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { printLayoutSettingsSchema } from "@gaurav-pos/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrinterSetupCard } from "../renderer/components/setup/printer-setup-card.js";
import { SettingsPageContext } from "../renderer/components/setup/setup-card.js";
import {
  hubApi,
  type BillPrinters,
  type Bootstrap,
} from "../renderer/hub-api.js";

vi.mock("../renderer/hub-api.js", () => ({
  hubApi: {
    billPrinters: vi.fn(),
    systemPrinters: vi.fn(),
    printLayouts: vi.fn(),
    paymentQr: vi.fn(),
    updateBillPrinters: vi.fn(),
    updatePrinterMode: vi.fn(),
    testBillPrint: vi.fn(),
    testKotPrint: vi.fn(),
    updatePrintLayout: vi.fn(),
    restaurantBranding: vi.fn(),
  },
}));

const initialPrinters: BillPrinters = {
  default: {
    label: "Cash counter",
    printerMode: "system",
    printerName: "EPSON",
    printerHost: null,
    printerPort: 9100,
    paperWidthMm: null,
    paymentQrSizeMm: 32,
    configured: true,
  },
  alternate: {
    label: "Downstairs",
    printerMode: "network",
    printerName: null,
    printerHost: "192.168.1.71",
    printerPort: 9100,
    paperWidthMm: 58,
    paymentQrSizeMm: 38,
    configured: true,
  },
};

const backgroundPrinters: BillPrinters = {
  default: {
    ...initialPrinters.default,
    label: "Background counter label",
    printerName: "BACKGROUND-EPSON",
  },
  alternate: {
    ...initialPrinters.alternate,
    label: "Background downstairs label",
    printerHost: "192.168.1.99",
  },
};

const bootstrap: Bootstrap = {
  currentBusinessDay: {
    id: "day-main",
    business_date: "2026-11-03",
    period_start_at: "2026-11-03T00:00:00.000Z",
    period_end_at: "2026-11-04T00:00:00.000Z",
    status: "active",
  },
  floors: [],
  tables: [],
  productionUnits: [{ id: "unit-kitchen", name: "Kitchen", active: true }],
  saleGroups: [],
  menuItems: [],
  printJobs: [],
  syncStatus: {},
  setup: { printerOutputMode: "test" },
};

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
});

function renderPrinterSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  clients.push(client);
  client.setQueryData(["bill-printers"], initialPrinters);
  client.setQueryData(
    ["system-printers"],
    [{ name: "EPSON", displayName: "EPSON", isDefault: true }],
  );
  client.setQueryData(["print-layouts"], {
    default: printLayoutSettingsSchema.parse({ scope: "default" }),
    receipt: printLayoutSettingsSchema.parse({ scope: "receipt" }),
    units: [
      {
        productionUnitId: "unit-kitchen",
        name: "Kitchen",
        layout: printLayoutSettingsSchema.parse({
          scope: "unit",
          productionUnitId: "unit-kitchen",
        }),
      },
    ],
  });
  client.setQueryData(["payment-qr"], { qr: null });
  client.setQueryData(["restaurant-branding"], { branding: { restaurantName: "Saffron Table", logoImageDataUrl: null, updatedAt: null } });
  render(
    <QueryClientProvider client={client}>
      <SettingsPageContext.Provider value>
        <PrinterSetupCard
          bootstrap={bootstrap}
          setNotice={vi.fn()}
          requestManagerApproval={vi.fn()}
          onChanged={vi.fn()}
        />
      </SettingsPageContext.Provider>
    </QueryClientProvider>,
  );
  return client;
}

async function replaceBackgroundCache(client: QueryClient) {
  await act(async () => {
    client.setQueryData(["bill-printers"], backgroundPrinters);
  });
  // This heading uses server data, so observing it proves the replacement has
  // rendered before checking that the independently edited form survived.
  await waitFor(() => {
    expect(screen.getByText("PC · BACKGROUND-EPSON")).toBeTruthy();
  });
}

describe("printer profile drafts", () => {
  it("keeps unsaved receipt and kitchen layouts after a background refresh fails", async () => {
    const client = renderPrinterSettings();
    const footer = () =>
      screen.getByRole<HTMLInputElement>("textbox", { name: "Footer text" });
    fireEvent.change(footer(), { target: { value: "Unsaved receipt footer" } });
    const layoutFor = screen.getByRole("combobox", { name: "Layout for" });
    fireEvent.change(layoutFor, { target: { value: "unit-kitchen" } });
    fireEvent.change(footer(), { target: { value: "Unsaved kitchen footer" } });
    vi.mocked(hubApi.printLayouts).mockRejectedValueOnce(
      new Error("Layout refresh failed"),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["print-layouts"] });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Layout refresh failed",
      ),
    );
    expect(footer().value).toBe("Unsaved kitchen footer");
    vi.mocked(hubApi.printLayouts).mockResolvedValueOnce(
      client.getQueryData(["print-layouts"])!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry layouts" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(footer().value).toBe("Unsaved kitchen footer");
    fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), {
      target: { value: "receipt" },
    });
    expect(footer().value).toBe("Unsaved receipt footer");
  });

  it("keeps an unsaved printer edit when background query data changes", async () => {
    const client = renderPrinterSettings();
    fireEvent.click(screen.getByRole("button", { name: "Edit Cash counter" }));
    const editor = within(screen.getByRole("form", { name: "Edit Cash counter" }));
    fireEvent.change(editor.getByRole("textbox", { name: "Printer label" }), { target: { value: "My counter draft" } });
    // No text change here: the connection choice alone must survive a refresh.
    fireEvent.click(editor.getByRole("radio", { name: "LAN printer" }));

    await replaceBackgroundCache(client);

    const form = within(screen.getByRole("form", { name: "Edit My counter draft" }));
    expect(form.getByRole<HTMLInputElement>("textbox", { name: "Printer label" }).value).toBe("My counter draft");
    expect(form.getByRole("radio", { name: "LAN printer" }).getAttribute("aria-checked")).toBe("true");
    expect(form.getByRole("textbox", { name: "Printer IP" })).toBeTruthy();
    expect(form.queryByRole("combobox", { name: "Installed printer" })).toBeNull();
  });

  it("saves logo, roll and QR settings for one printer and keeps the other printer's sizes", async () => {
    renderPrinterSettings();
    vi.mocked(hubApi.updateBillPrinters).mockResolvedValueOnce(initialPrinters);
    fireEvent.click(screen.getByRole("button", { name: "Edit Cash counter" }));
    const editor = within(screen.getByRole("form", { name: "Edit Cash counter" }));
    fireEvent.change(editor.getByRole("combobox", { name: /Paper roll/ }), { target: { value: "80" } });
    fireEvent.change(editor.getByRole("slider", { name: "Payment QR printed size in millimetres" }), { target: { value: "40" } });
    fireEvent.click(editor.getByRole("radio", { name: "Custom" }));
    fireEvent.change(editor.getByRole("slider", { name: "Logo printed width in millimetres" }), { target: { value: "24" } });
    fireEvent.change(editor.getByRole("combobox", { name: "Style" }), { target: { value: "dither" } });
    fireEvent.change(editor.getByRole("slider", { name: "Logo ink density" }), { target: { value: "190" } });
    fireEvent.click(editor.getByRole("button", { name: "Save printer" }));

    await waitFor(() => expect(hubApi.updateBillPrinters).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(hubApi.updateBillPrinters).mock.calls[0]![0];
    expect(payload.default).toMatchObject({ label: "Cash counter", printerMode: "system", printerName: "EPSON", paperWidthMm: 80, paymentQrSizeMm: 40, logoWidthMm: 24, logoPrintMode: "dither", logoThreshold: 190 });
    // Omitting sizes tells the hub to keep the second printer's saved 58 mm roll and 38 mm QR.
    expect(payload.alternate).toEqual({ label: "Downstairs", printerMode: "network", printerName: undefined, printerHost: "192.168.1.71", printerPort: 9100 });
  });

  it("previews the bill with the chosen printer's roll width and QR size", () => {
    renderPrinterSettings();
    expect(screen.getByText(/^50 mm/, { selector: ".layout-preview-meta" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Preview printer" }), { target: { value: "alternate" } });
    expect(screen.getByText("58 mm · printer setting", { selector: ".layout-preview-meta" })).toBeTruthy();
    expect(document.querySelector<HTMLElement>(".print-paper")?.style.getPropertyValue("--paper-chars")).toBe("32");
  });
});
