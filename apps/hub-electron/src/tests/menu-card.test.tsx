// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MenuItem, MenuItemVariant } from "../renderer/hub-api.js";
import { MenuCard } from "../renderer/components/orders/menu-card.js";

afterEach(cleanup);

const item: MenuItem = { id: "drink", name: "Reserve whisky", price_paise: 12000, production_unit_id: "bar", production_unit_name: "Bar", sale_group_id: "alcohol", sale_group_name: "Alcohol", sale_group_kind: "alcohol", ticket_label: "BOT", active: true };
const variant = (volume: number, price: number, active = true): MenuItemVariant => ({ id: `v${volume}`, menu_item_id: item.id, label: `${volume} ml`, kind: "shot", volume_ml: volume, price_paise: price, inventory_action: "large_ml", sort_order: volume, active });

it("exposes every available liquor size and adds the exact selected variant", () => {
  const onAdd = vi.fn();
  render(<MenuCard item={{ ...item, variants: [variant(30, 12000), variant(60, 24000), variant(180, 60000), variant(750, 240000), variant(90, 36000, false)] }} draftCount={7} onAdd={onAdd} />);
  expect(screen.getByText("Reserve whisky")).toBeTruthy();
  expect(screen.getByLabelText("7 in new order")).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Reserve whisky 750 ml ₹2400" }));
  expect(onAdd).toHaveBeenCalledWith("v750");
  expect(screen.queryByRole("button", { name: /90 ml/ })).toBeNull();
});

it("keeps the size label when only one non-default portion is available", () => {
  const onAdd = vi.fn();
  render(<MenuCard item={{ ...item, variants: [variant(180, 60000)] }} onAdd={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Reserve whisky + 180 ml · ₹600" }));
  expect(onAdd).toHaveBeenCalledWith("v180");
});

it("does not offer base-price ordering for alcohol with no active size", () => {
  const onAdd = vi.fn();
  render(<MenuCard item={{ ...item, variants: [variant(30, 12000, false)] }} onAdd={onAdd} />);
  expect(screen.getByRole("button", { name: "Reserve whisky unavailable" })).toHaveProperty("disabled", true);
  expect(onAdd).not.toHaveBeenCalled();
});

it("keeps ordinary dishes without variant records directly orderable", () => {
  const onAdd = vi.fn();
  render(<MenuCard item={{ ...item, name: "Lime soda", sale_group_kind: "beverage", price_paise: 9000 }} onAdd={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Lime soda + ₹90" }));
  expect(onAdd).toHaveBeenCalledWith(undefined);
});
