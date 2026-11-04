// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DevicePairingCard } from "../renderer/components/setup/device-pairing-card.js";
import { ManagerApprovalModal, useManagerApproval } from "../renderer/hooks/use-manager-approval.js";
import { hubApi } from "../renderer/hub-api.js";

vi.mock("../renderer/hub-api.js", () => ({ hubApi: { createPairingCode: vi.fn(), revokeDevice: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("quietly cancels pairing approval and restores the Create QR action once it is enabled", async () => {
  const notice = vi.fn();
  const changed = vi.fn();
  function Example() {
    const approval = useManagerApproval();
    return <><DevicePairingCard devices={[]} loading={false} setNotice={notice} requestManagerApproval={approval.request} onChanged={changed} /><ManagerApprovalModal state={approval.state} setState={approval.setState} /></>;
  }
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Example /></QueryClientProvider>);
  const create = screen.getByRole("button", { name: "Create QR code" }) as HTMLButtonElement;
  create.focus();
  fireEvent.click(create);
  const dialog = await screen.findByRole("dialog", { name: "Approve Device Pairing" });
  expect(create.disabled).toBe(true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(create.disabled).toBe(false));
  await waitFor(() => expect(document.activeElement).toBe(create));
  expect(hubApi.createPairingCode).not.toHaveBeenCalled();
  expect(notice).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
