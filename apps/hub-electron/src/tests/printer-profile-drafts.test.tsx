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
  },
}));

const initialPrinters: BillPrinters = {
  default: {
    label: "Cash counter",
    printerMode: "system",
    printerName: "EPSON",
    printerHost: null,
    printerPort: 9100,
    configured: true,
  },
  alternate: {
    label: "Downstairs",
    printerMode: "network",
    printerName: null,
    printerHost: "192.168.1.71",
    printerPort: 9100,
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
  fireEvent.click(screen.getByRole("button", { name: "Edit bill printers" }));
  return client;
}

async function replaceBackgroundCache(client: QueryClient) {
  await act(async () => {
    client.setQueryData(["bill-printers"], backgroundPrinters);
  });
  // This heading uses server data, so observing it proves the replacement has
  // rendered before checking that the independently edited form survived.
  await waitFor(() => {
    expect(
      screen.getByText("BACKGROUND-EPSON", {
        selector: ".printer-section-header strong",
      }),
    ).toBeTruthy();
  });
}

describe("printer profile drafts", () => {
  it("keeps unsaved receipt and kitchen layouts after a background refresh fails", async () => {
    const client = renderPrinterSettings();
    const footer = () =>
      screen.getByRole<HTMLInputElement>("textbox", { name: "Footer text" });
    fireEvent.change(footer(), { target: { value: "Unsaved receipt footer" } });
    const layoutFor = screen.getByRole("combobox", { name: "Layout for" });
    fireEvent.change(layoutFor, { target: { value: "unit" } });
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

  it("keeps both unsaved printer labels when background query data changes", async () => {
    const client = renderPrinterSettings();
    const labels = () =>
      screen.getAllByRole<HTMLInputElement>("textbox", {
        name: "Printer label",
      });
    expect(labels().map((input) => input.value)).toEqual([
      "Cash counter",
      "Downstairs",
    ]);
    fireEvent.change(labels()[0]!, { target: { value: "My counter draft" } });
    fireEvent.change(labels()[1]!, {
      target: { value: "My downstairs draft" },
    });

    await replaceBackgroundCache(client);

    expect(labels().map((input) => input.value)).toEqual([
      "My counter draft",
      "My downstairs draft",
    ]);
  });

  it("keeps mode-only edits for both printers when background query data changes", async () => {
    const client = renderPrinterSettings();
    const labels = screen.getAllByRole("textbox", { name: "Printer label" });
    const primary = within(
      labels[0]!.closest<HTMLElement>(".printer-slot-card")!,
    );
    const alternate = within(
      labels[1]!.closest<HTMLElement>(".printer-slot-card")!,
    );
    // No input changes here: mode buttons must mark the draft dirty themselves.
    fireEvent.click(primary.getByRole("button", { name: "LAN printer" }));
    fireEvent.click(alternate.getByRole("button", { name: "PC printer" }));

    await replaceBackgroundCache(client);

    expect(
      primary
        .getByRole("button", { name: "LAN printer" })
        .classList.contains("active"),
    ).toBe(true);
    expect(primary.getByRole("textbox", { name: "Printer IP" })).toBeTruthy();
    expect(
      primary.queryByRole("combobox", { name: "Installed printer" }),
    ).toBeNull();
    expect(
      alternate
        .getByRole("button", { name: "PC printer" })
        .classList.contains("active"),
    ).toBe(true);
    expect(
      alternate.getByRole("combobox", { name: "Installed printer" }),
    ).toBeTruthy();
    expect(alternate.queryByRole("textbox", { name: "Printer IP" })).toBeNull();
  });
});
