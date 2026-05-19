// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const billPrintersMock = vi.fn();

describe("bill printer chooser", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    billPrintersMock.mockReset();
  });

  it("moves printer choice with arrow keys and selects active choice with Enter or Space", async () => {
    const { BillPrinterChooser } = await importChooser();
    const onChoose = vi.fn();
    billPrintersMock.mockResolvedValue({
      default: { label: "Main printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, printerHost: null, configured: true },
      alternate: { label: "Downstairs", printerMode: "network", printerHost: "192.168.1.71", printerPort: 9100, printerName: null, configured: true }
    });

    renderChooser(BillPrinterChooser, onChoose);

    const dialog = await screen.findByRole("dialog", { name: "Print bill where?" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Default printer/i }).getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Alternate printer/i }).getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(onChoose).toHaveBeenLastCalledWith("alternate");

    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Default printer/i }).getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(dialog, { key: " " });
    expect(onChoose).toHaveBeenLastCalledWith("default");
  });

  it("does not select an unconfigured disabled printer by keyboard", async () => {
    const { BillPrinterChooser } = await importChooser();
    const onChoose = vi.fn();
    billPrintersMock.mockResolvedValue({
      default: { label: "Main printer", printerMode: "system", printerName: "", printerPort: 9100, printerHost: null, configured: false },
      alternate: { label: "Downstairs", printerMode: "network", printerHost: "192.168.1.71", printerPort: 9100, printerName: null, configured: true }
    });

    renderChooser(BillPrinterChooser, onChoose);

    const dialog = await screen.findByRole("dialog", { name: "Print bill where?" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Alternate printer/i }).getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(screen.getByRole("button", { name: /Alternate printer/i }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith("alternate");
  });

  it("does not hijack the close button but uses Enter or Space for the active printer choice", async () => {
    const { BillPrinterChooser } = await importChooser();
    const onChoose = vi.fn();
    billPrintersMock.mockResolvedValue({
      default: { label: "Main printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, printerHost: null, configured: true },
      alternate: { label: "Downstairs", printerMode: "network", printerHost: "192.168.1.71", printerPort: 9100, printerName: null, configured: true }
    });

    renderChooser(BillPrinterChooser, onChoose);

    await screen.findByRole("dialog", { name: "Print bill where?" });
    const closeButton = screen.getByRole("button", { name: "Close" });
    const alternateButton = await screen.findByRole("button", { name: /Alternate printer/i });

    fireEvent.keyDown(closeButton, { key: "Enter" });
    expect(onChoose).not.toHaveBeenCalled();

    fireEvent.focus(alternateButton);
    fireEvent.keyDown(alternateButton, { key: " " });
    expect(onChoose).toHaveBeenLastCalledWith("alternate");
  });
});

async function importChooser() {
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: { billPrinters: billPrintersMock }
  }));
  const { BillPrinterChooser } = await import("../renderer/components/orders/bill-printer-chooser.js");
  return { BillPrinterChooser };
}

function renderChooser(
  BillPrinterChooser: typeof import("../renderer/components/orders/bill-printer-chooser.js").BillPrinterChooser,
  onChoose = vi.fn()
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BillPrinterChooser open title="Print bill where?" onClose={vi.fn()} onChoose={onChoose} />
    </QueryClientProvider>
  );
}
