// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { printLayoutSettingsSchema } from "@gaurav-pos/shared";
import { afterEach, expect, it, vi } from "vitest";
import { hubApi } from "../renderer/hub-api.js";
import { PrintLayoutEditor } from "../renderer/components/setup/print-layout-editor.js";

vi.mock("../renderer/hub-api.js", () => ({ hubApi: { restaurantBranding: vi.fn(async () => ({ branding: { restaurantName: "", logoImageDataUrl: null, updatedAt: null } })), updatePrintLayout: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("preserves separate bill and kitchen drafts across layout switches and background refreshes", () => {
  const client = new QueryClient();
  const receipt = printLayoutSettingsSchema.parse({
    scope: "receipt",
    billFooter: "Thank you",
  });
  const unit = printLayoutSettingsSchema.parse({
    scope: "unit",
    productionUnitId: "kitchen",
    kotFooter: "Kitchen copy",
  });
  const layouts = {
    default: printLayoutSettingsSchema.parse({ scope: "default" }),
    receipt,
    units: [{ productionUnitId: "kitchen", name: "Kitchen", layout: unit }],
  };
  const props = {
    layouts,
    units: [{ id: "kitchen", name: "Kitchen", active: true }],
    setNotice: vi.fn(),
    requestManagerApproval: vi.fn(),
    onSaved: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <PrintLayoutEditor {...props} />
    </QueryClientProvider>,
  );
  const footer = () =>
    screen.getByRole<HTMLInputElement>("textbox", { name: "Footer text" });
  fireEvent.change(footer(), { target: { value: "Visit again soon" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), {
    target: { value: "kitchen" },
  });
  expect(footer().value).toBe("Kitchen copy");
  fireEvent.change(footer(), { target: { value: "Kitchen draft" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), {
    target: { value: "receipt" },
  });
  expect(footer().value).toBe("Visit again soon");
  view.rerender(
    <QueryClientProvider client={client}>
      <PrintLayoutEditor
        {...props}
        layouts={{
          ...layouts,
          receipt: { ...receipt, billFooter: "Background update" },
        }}
      />
    </QueryClientProvider>,
  );
  expect(footer().value).toBe("Visit again soon");
  fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), {
    target: { value: "kitchen" },
  });
  expect(footer().value).toBe("Kitchen draft");
});


function renderVisibilitySettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["restaurant-branding"], { branding: { restaurantName: "Shared restaurant", logoImageDataUrl: "data:image/png;base64,AAAA", updatedAt: null } });
  const receipt = printLayoutSettingsSchema.parse({ scope: "receipt", restaurantName: "Legacy name", restaurantAddress: "Saved address", taxRegistrationText: "GSTIN saved", billHeader: "Welcome", billFooter: "Visit again" });
  const unit = printLayoutSettingsSchema.parse({ scope: "unit", productionUnitId: "kitchen", kotHeader: "Kitchen header", kotFooter: "Kitchen footer" });
  const approval = vi.fn().mockResolvedValue({ pin: "1234", reason: "Layout", approvedBy: "Manager" });
  vi.mocked(hubApi.updatePrintLayout).mockImplementation(async (_scope, layout) => layout);
  render(<QueryClientProvider client={client}><PrintLayoutEditor
    layouts={{ default: printLayoutSettingsSchema.parse({ scope: "default" }), receipt, units: [{ productionUnitId: "kitchen", name: "Kitchen", layout: unit }] }}
    units={[{ id: "kitchen", name: "Kitchen", active: true }]}
    paymentQr={{ imageDataUrl: "data:image/png;base64,QR", upiUri: "upi://pay?pa=demo", upiId: "demo", payeeName: "Demo", sizeMm: 32, updatedAt: "2026-11-09T00:00:00.000Z" }}
    setNotice={vi.fn()} requestManagerApproval={approval} onSaved={vi.fn()}
  /></QueryClientProvider>);
  return { client, approval };
}

it("independently hides name, logo and QR without dropping item rows or text styles", () => {
  renderVisibilitySettings();
  const paper = document.querySelector<HTMLElement>(".print-paper")!;
  expect(paper.textContent).toContain("Shared restaurant");
  expect(within(paper).getByRole("img", { name: "Printed restaurant logo" })).toBeTruthy();
  expect(within(paper).getByRole("img", { name: "Payment QR, 32 mm" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Restaurant name text size"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Restaurant name" }));
  expect(paper.textContent).not.toContain("Shared restaurant");
  expect(screen.queryByLabelText("Restaurant name text size")).toBeNull();
  expect(within(paper).getByRole("img", { name: "Printed restaurant logo" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Logo" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Payment QR" }));
  expect(within(paper).queryByRole("img")).toBeNull();
  expect(paper.textContent).toContain("Paneer Tikka");
  fireEvent.click(screen.getByRole("checkbox", { name: "Restaurant name" }));
  expect((screen.getByLabelText("Restaurant name text size") as HTMLInputElement).value).toBe("3");
});

it("keeps hidden optional text in the saved layout and restores its inputs on demand", async () => {
  const { approval } = renderVisibilitySettings();
  for (const name of ["Address", "GST registration", "Header", "Footer"]) fireEvent.click(screen.getByRole("checkbox", { name }));
  expect(screen.queryByRole("textbox", { name: "Address on bill" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Header text" })).toBeNull();
  expect(screen.queryByLabelText("Address text size")).toBeNull();
  expect(screen.queryByLabelText("Header text size")).toBeNull();
  // QR still uses the footer typography, so its remaining control names that content.
  expect(screen.getByLabelText("QR caption text size")).toBeTruthy();
  const paper = document.querySelector<HTMLElement>(".print-paper")!;
  expect(paper.textContent).not.toMatch(/Saved address|GSTIN saved|Welcome|Visit again/);
  fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
  await waitFor(() => expect(hubApi.updatePrintLayout).toHaveBeenCalledTimes(1));
  expect(approval).toHaveBeenCalledTimes(1);
  expect(vi.mocked(hubApi.updatePrintLayout).mock.calls[0]![1]).toMatchObject({ showRestaurantAddress: false, showTaxRegistration: false, showHeader: false, showFooter: false, restaurantAddress: "Saved address", taxRegistrationText: "GSTIN saved", billHeader: "Welcome", billFooter: "Visit again" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Address" }));
  expect((screen.getByRole("textbox", { name: "Address on bill" }) as HTMLTextAreaElement).value).toBe("Saved address");
});

it("honors kitchen note visibility in its real ticket preview", () => {
  renderVisibilitySettings();
  fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), { target: { value: "kitchen" } });
  const paper = document.querySelector<HTMLElement>(".print-paper")!;
  expect(paper.textContent).toContain("Less spicy");
  expect(paper.textContent).toContain("No onion");
  fireEvent.click(screen.getByRole("checkbox", { name: "Order note" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Item notes" }));
  expect(paper.textContent).not.toMatch(/Less spicy|No onion/);
  expect(screen.queryByLabelText("Order note text size")).toBeNull();
  expect(screen.queryByLabelText("Item notes text size")).toBeNull();
  expect(paper.textContent).toContain("Paneer Tikka");
});

it("does not resurrect the legacy receipt name when the shared name is intentionally blank", async () => {
  const { client } = renderVisibilitySettings();
  client.setQueryData(["restaurant-branding"], { branding: { restaurantName: "", logoImageDataUrl: "data:image/png;base64,AAAA", updatedAt: "2026-11-09T00:00:00.000Z" } });
  await waitFor(() => expect(document.querySelector(".print-paper")!.textContent).not.toContain("Shared restaurant"));
  expect(document.querySelector(".print-paper")!.textContent).not.toContain("Legacy name");
  expect(screen.queryByText("Legacy name · Edit in General")).toBeNull();
});

it("previews legacy names before shared branding is configured", async () => {
  const { client } = renderVisibilitySettings();
  client.setQueryData(["restaurant-branding"], { branding: { restaurantName: "", logoImageDataUrl: null, updatedAt: null } });
  await waitFor(() => expect(document.querySelector(".print-paper")!.textContent).toContain("Legacy name"));
});

it("keeps typography for remaining bill and station details and labels alignments distinctly", () => {
  renderVisibilitySettings();
  expect(screen.getByRole("combobox", { name: "Header alignment" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Footer alignment" })).toBeTruthy();
  for (const name of ["Table", "Date and time", "GST registration", "Customer name"]) fireEvent.click(screen.getByRole("checkbox", { name }));
  expect(screen.getByLabelText("Bill details text size")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Layout for" }), { target: { value: "kitchen" } });
  for (const name of ["Table", "Captain", "Time"]) fireEvent.click(screen.getByRole("checkbox", { name }));
  expect(screen.getByLabelText("Ticket details text size")).toBeTruthy();
});
