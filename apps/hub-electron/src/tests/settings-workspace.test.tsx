// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeyRound, Printer, QrCode } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SettingsWorkspace,
  type SettingsSection,
} from "../renderer/components/setup/settings-workspace.js";

const sections = [
  {
    id: "printers",
    title: "Printers",
    description: "Set up printer output.",
    group: "Restaurant",
    keywords: "receipt font layout",
    icon: Printer,
  },
  {
    id: "payment",
    title: "Payment QR",
    description: "Choose the shared payment QR.",
    group: "Restaurant",
    keywords: "upi upload gpay",
    icon: QrCode,
  },
  {
    id: "security",
    title: "Security",
    description: "Protect owner changes.",
    group: "Administration",
    keywords: "master pin",
    icon: KeyRound,
  },
] as const satisfies readonly SettingsSection[];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderWorkspace() {
  return render(
    <SettingsWorkspace
      title="Settings"
      storageKey="test-settings-section"
      sections={sections}
      renderSection={(id) => (
        <label>
          {id} draft
          <input aria-label={`${id} draft`} defaultValue="" />
        </label>
      )}
    />,
  );
}

describe("settings navigation", () => {
  it("opens a title match before a related keyword match", () => {
    render(
      <SettingsWorkspace
        title="Settings"
        storageKey="ranking-test"
        sections={[
          { ...sections[2], keywords: "printer kitchen" },
          ...sections.slice(0, 2),
        ]}
        renderSection={(id) => <p>{id} content</p>}
      />,
    );
    const search = screen.getByRole("textbox", { name: "Search settings" });
    fireEvent.change(search, { target: { value: "printer" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Printers" })).toBeTruthy();
  });
  it("mounts settings when first visited and keeps an unsaved draft when switching categories", () => {
    renderWorkspace();
    expect(screen.queryByLabelText("payment draft")).toBeNull();
    fireEvent.change(screen.getByLabelText("printers draft"), {
      target: { value: "Kitchen printer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Payment QR" }));
    expect(screen.getByLabelText("payment draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Printers" }));
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "printers draft" })
        .value,
    ).toBe("Kitchen printer");
    expect(screen.queryByLabelText("security draft")).toBeNull();
  });

  it("finds a setting by its vocabulary and opens the search result with Enter", () => {
    renderWorkspace();
    const search = screen.getByRole("textbox", { name: "Search settings" });
    fireEvent.change(search, { target: { value: "master pin" } });
    expect(screen.getByRole("button", { name: "Security" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Printers" })).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(window.localStorage.getItem("test-settings-section")).toBe(
      "security",
    );
  });

  it("supports keyboard category navigation and explains searches with no matches", () => {
    renderWorkspace();
    const printer = screen.getByRole("button", { name: "Printers" });
    printer.focus();
    fireEvent.keyDown(printer, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Payment QR" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search settings" }), {
      target: { value: "nonexistent" },
    });
    expect(screen.getByRole("status").textContent).toContain(
      "No settings match",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Clear settings search" }),
    );
    expect(screen.getByRole("button", { name: "Printers" })).toBeTruthy();
  });
});
