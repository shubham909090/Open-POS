// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Dialog } from "../renderer/components/ui/dialog.js";

afterEach(cleanup);

it("returns focus to the exact action after Escape without a Radix trigger", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Edit restaurant</button>{open ? <Dialog open onOpenChange={setOpen} title="Restaurant"><input aria-label="Name" /></Dialog> : null}</>;
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Edit restaurant" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Restaurant" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("also returns focus when the dialog remains mounted between openings", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Choose printer</button><Dialog open={open} onOpenChange={setOpen} title="Printer"><button>Counter printer</button></Dialog></>;
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Choose printer" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Printer" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
