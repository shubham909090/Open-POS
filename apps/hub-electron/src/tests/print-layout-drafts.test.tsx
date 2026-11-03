// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { printLayoutSettingsSchema } from "@gaurav-pos/shared";
import { afterEach, expect, it, vi } from "vitest";
import { PrintLayoutEditor } from "../renderer/components/setup/print-layout-editor.js";

afterEach(cleanup);

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
    target: { value: "unit" },
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
    target: { value: "unit" },
  });
  expect(footer().value).toBe("Kitchen draft");
});
