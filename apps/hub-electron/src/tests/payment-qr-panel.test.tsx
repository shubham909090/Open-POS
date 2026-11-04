// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentQrPanel } from "../renderer/components/setup/payment-qr-panel.js";
import { hubApi } from "../renderer/hub-api.js";
import { readImageFile } from "../renderer/lib/image-file.js";

vi.mock("../renderer/hub-api.js", () => ({ hubApi: { paymentQr: vi.fn(), billPrinters: vi.fn(), updatePaymentQr: vi.fn(), removePaymentQr: vi.fn() } }));
vi.mock("../renderer/lib/image-file.js", () => ({ readImageFile: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const qr = { imageDataUrl: "data:image/png;base64,old", upiUri: "upi://pay?pa=old@upi", upiId: "old@upi", payeeName: "Restaurant", sizeMm: 32, updatedAt: "2026-11-04T08:00:00.000Z" };
const approval = { pin: "9876", reason: "Update shared payment QR", approvedBy: "master" };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(["payment-qr"], { qr });
  client.setQueryData(["bill-printers"], { default: { label: "Main", paymentQrSizeMm: 32 }, alternate: { configured: false } });
  const requestManagerApproval = vi.fn().mockResolvedValue(approval);
  render(<QueryClientProvider client={client}><PaymentQrPanel masterPinConfigured requestManagerApproval={requestManagerApproval} setNotice={vi.fn()} /></QueryClientProvider>);
  return { client, requestManagerApproval };
}
async function replaceImage() {
  vi.mocked(readImageFile).mockResolvedValue("data:image/png;base64,replacement");
  fireEvent.change(screen.getByLabelText("Upload payment QR image"), { target: { files: [new File(["png"], "qr.png", { type: "image/png" })] } });
  await screen.findByAltText("New payment QR preview");
}

it("retains the last good QR and selected replacement after a failed background refresh", async () => {
  const { client } = setup();
  await replaceImage();
  vi.mocked(hubApi.paymentQr).mockRejectedValue(new Error("Hub offline"));
  await act(async () => { await client.refetchQueries({ queryKey: ["payment-qr"] }); });
  await screen.findByText("Hub offline");
  expect((screen.getByAltText("New payment QR preview") as HTMLImageElement).src).toContain("replacement");
  expect(screen.getByRole("link", { name: "Download current QR" }).getAttribute("href")).toBe(qr.imageDataUrl);
  expect(screen.getByRole("button", { name: "Cancel changes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
  expect((screen.getByAltText("Current payment QR") as HTMLImageElement).src).toBe(qr.imageDataUrl);
});

it("keeps the replacement but blocks overwriting a remote QR until an explicit reload", async () => {
  const { client, requestManagerApproval } = setup();
  await replaceImage();
  const remote = { ...qr, imageDataUrl: "data:image/png;base64,remote", updatedAt: "2026-11-04T09:00:00.000Z" };
  await act(async () => { client.setQueryData(["payment-qr"], { qr: remote }); });
  await screen.findByText(/payment QR changed on another device/);
  expect((screen.getByAltText("New payment QR preview") as HTMLImageElement).src).toContain("replacement");
  expect((screen.getByRole("button", { name: "Save payment QR" }) as HTMLButtonElement).disabled).toBe(true);
  expect(requestManagerApproval).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load current QR" }));
  expect((screen.getByAltText("Current payment QR") as HTMLImageElement).src).toBe(remote.imageDataUrl);
  await replaceImage();
  vi.mocked(hubApi.updatePaymentQr).mockResolvedValue({ qr: { ...remote, imageDataUrl: "data:image/png;base64,saved", updatedAt: "2026-11-04T10:00:00.000Z" } });
  fireEvent.click(screen.getByRole("button", { name: "Save payment QR" }));
  await waitFor(() => expect(hubApi.updatePaymentQr).toHaveBeenCalledWith("data:image/png;base64,replacement", 32, approval, remote.updatedAt));
  await waitFor(() => expect(screen.queryByAltText("New payment QR preview")).toBeNull());
  expect(screen.queryByText(/payment QR changed on another device/)).toBeNull();
});

it("captures the original version before approval, even if the QR changes while approval is open", async () => {
  const { client, requestManagerApproval } = setup();
  let approve!: (value: typeof approval) => void;
  requestManagerApproval.mockReturnValueOnce(new Promise((resolve) => { approve = resolve; }));
  await replaceImage();
  vi.mocked(hubApi.updatePaymentQr).mockRejectedValue(new Error("QR changed; reload"));
  fireEvent.click(screen.getByRole("button", { name: "Save payment QR" }));
  await act(async () => { client.setQueryData(["payment-qr"], { qr: { ...qr, updatedAt: "2026-11-04T09:00:00.000Z" } }); });
  await act(async () => { approve(approval); });
  await waitFor(() => expect(hubApi.updatePaymentQr).toHaveBeenCalledWith("data:image/png;base64,replacement", 32, approval, qr.updatedAt));
  expect(screen.getByAltText("New payment QR preview")).toBeTruthy();
});
