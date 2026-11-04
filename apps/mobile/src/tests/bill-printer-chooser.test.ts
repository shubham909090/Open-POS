import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubClient } from "../lib/hub-client";

const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));
vi.mock("react-native", () => ({ Alert: { alert } }));
import { useBillPrinterChooser } from "../hooks/use-bill-printer-chooser";

type Profiles = Awaited<ReturnType<HubClient["billPrinters"]>>;
const profile = (configured: boolean, label: string): Profiles["default"] => ({ configured, label, printerMode: "network", printerHost: configured ? "192.0.2.1" : null, printerPort: 9100, printerName: null });

describe("native bill printer chooser", () => {
  beforeEach(() => { alert.mockReset(); });

  it.each(["default", "alternate"] as const)("uses the only configured %s printer without a redundant confirmation", async (slot) => {
    const client = { billPrinters: vi.fn().mockResolvedValue({ default: profile(slot === "default", "Main"), alternate: profile(slot === "alternate", "Second") }) };
    const { chooseBillPrinter } = useBillPrinterChooser({ client, setMessage: vi.fn() });
    expect(await chooseBillPrinter("Print bill")).toBe(slot);
    expect(alert).not.toHaveBeenCalled();
  });

  it("resolves a dismissed native chooser so billing does not remain stuck", async () => {
    const client = { billPrinters: vi.fn().mockResolvedValue({ default: profile(true, "Main"), alternate: profile(true, "Second") }) };
    alert.mockImplementation((_title, _message, _buttons, options) => { options.onDismiss(); });
    expect(await useBillPrinterChooser({ client, setMessage: vi.fn() }).chooseBillPrinter("Print bill")).toBeNull();
  });

  it("keeps an explicit choice when both printers are configured", async () => {
    const client = { billPrinters: vi.fn().mockResolvedValue({ default: profile(true, "Main"), alternate: profile(true, "Second") }) };
    alert.mockImplementation((_title, _message, buttons) => { buttons[1].onPress(); });
    expect(await useBillPrinterChooser({ client, setMessage: vi.fn() }).chooseBillPrinter("Print bill")).toBe("alternate");
  });
});
