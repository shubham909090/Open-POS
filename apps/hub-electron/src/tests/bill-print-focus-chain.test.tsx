// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BillingPanel } from "../renderer/components/orders/billing-panel.js";
import { ManagerApprovalModal, useManagerApproval } from "../renderer/hooks/use-manager-approval.js";
import { Dialog } from "../renderer/components/ui/dialog.js";
import { hubApi, type TableOrder } from "../renderer/hub-api.js";
vi.mock("../renderer/hub-api.js", () => ({ hubApi: { billPrinters: vi.fn(), reprintBill: vi.fn(), markBillNc: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each([
  { action: /Reprint bill/i, approval: "Approve bill reprint", chooser: "Reprint bill where?" },
  { action: "Mark NC bill", approval: "Approve NC bill", chooser: "Print NC bill where?" },
])("restores $approval's exact original action after PIN approval then chooser Escape", async ({ action, approval, chooser }) => {
  const printers = { default: { label: "Main", printerMode: "system", printerName: "EPSON", configured: true, paymentQrSizeMm: 32, paperWidthMm: null }, alternate: { label: "Second", configured: false } };
  vi.mocked(hubApi.billPrinters).mockResolvedValue(printers as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["bill-printers"], printers);
  function Example() {
    const approvalState = useManagerApproval();
    const tableOrder = { order: { id: "o1", status: "billed", table_id: "t1", pax: 2, captain_id: "captain" }, items: [], payments: [], bill: { id: "b1", order_id: "o1", status: "pending", total_paise: 50000, paid_paise: 0, discount_paise: 0, tip_paise: 0, final_total_paise: 50000 } } as TableOrder;
    return <><Dialog open onOpenChange={() => {}} title="Table R1"><BillingPanel tableOrder={tableOrder} menuItems={[]} sentTotal={50000} generateBill={vi.fn()} generating={false} onSettled={vi.fn()} setNotice={vi.fn()} requestManagerApproval={approvalState.request} /></Dialog><ManagerApprovalModal state={approvalState.state} setState={approvalState.setState} /></>;
  }
  render(<QueryClientProvider client={client}><Example /></QueryClientProvider>);
  const trigger = screen.getByRole("button", { name: action });
  trigger.focus(); fireEvent.click(trigger);
  await screen.findByRole("dialog", { name: approval });
  const pin = screen.getByLabelText("Manager PIN");
  fireEvent.change(pin, { target: { value: "1234" } });
  fireEvent.submit(pin.closest("form")!);
  const printerDialog = await screen.findByRole("dialog", { name: chooser });
  await screen.findByRole("button", { name: /Default printer/ });
  fireEvent.keyDown(printerDialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: chooser })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(hubApi.reprintBill).not.toHaveBeenCalled();
  expect(hubApi.markBillNc).not.toHaveBeenCalled();
});
