// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdvancedView } from "../renderer/components/advanced/advanced-view.js";
import type { Bootstrap } from "../renderer/hub-api.js";
afterEach(() => { cleanup(); localStorage.clear(); });
it("identifies bills and kitchen tickets with a graceful fallback for older hub jobs", () => {
  localStorage.setItem("hub-advanced-section", "print-queue");
  const job = { status: "printed", attempts: 1, created_at: "2026-11-04T10:00:00Z", target_id: "target" };
  const bootstrap = { setup: {}, syncStatus: {}, printJobs: [
    { ...job, id: "bill", target_type: "BILL", bill_number: 42, table_name: "T2" },
    { ...job, id: "kot", target_type: "KOT", ticket_sequence: 14, table_name: "R5" },
    { ...job, id: "old", target_type: "BILL", printer_name: "Old printer" },
  ] } as unknown as Bootstrap;
  render(<QueryClientProvider client={new QueryClient()}><AdvancedView bootstrap={bootstrap} setNotice={vi.fn()} requestManagerApproval={vi.fn()} onLocked={vi.fn()} /></QueryClientProvider>);
  expect(screen.getByText("BILL #42 · T2")).toBeTruthy();
  expect(screen.getByText("KOT #14 · R5")).toBeTruthy();
  expect(screen.getByText("· Old printer").closest("strong")?.textContent).toBe("BILL · Old printer");
});
