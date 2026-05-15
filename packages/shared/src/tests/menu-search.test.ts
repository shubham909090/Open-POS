import { describe, expect, it } from "vitest";
import { rankMenuQuickPicks, searchMenuItems } from "../menu-search.js";

const menu = [
  {
    id: "paneer-tikka",
    name: "Paneer Tikka",
    active: true,
    sale_group_name: "Food",
    sale_group_kind: "food",
    production_unit_name: "Tandoor",
    variants: []
  },
  {
    id: "vodka",
    name: "Romanov Vodka",
    active: true,
    sale_group_name: "Alcohol",
    sale_group_kind: "alcohol",
    production_unit_name: "Sky Bar",
    variants: [{ label: "Large Bottle", active: true }]
  },
  {
    id: "disabled-special",
    name: "Hidden Special",
    active: false,
    sale_group_name: "Food",
    sale_group_kind: "food",
    production_unit_name: "Kitchen",
    variants: []
  },
  {
    id: "masala-papad",
    name: "Masala Papad",
    active: true,
    sale_group_name: "Food",
    sale_group_kind: "food",
    production_unit_name: "Snacks",
    variants: []
  }
];

describe("menu fuzzy search", () => {
  it("finds a dish when the waiter types an imperfect name", () => {
    expect(searchMenuItems(menu, "panr tika").map((item) => item.id)).toEqual(["paneer-tikka"]);
  });

  it("matches kitchen/counter names and variant labels", () => {
    expect(searchMenuItems(menu, "sky bar").map((item) => item.id)).toEqual(["vodka"]);
    expect(searchMenuItems(menu, "large bottl").map((item) => item.id)).toEqual(["vodka"]);
  });

  it("excludes inactive dishes and applies sale group filters", () => {
    expect(searchMenuItems(menu, "hidden").map((item) => item.id)).toEqual([]);
    expect(searchMenuItems(menu, "", { saleGroupKind: "food" }).map((item) => item.id)).toEqual(["paneer-tikka", "masala-papad"]);
  });

  it("returns recent and popular quick picks without duplicates", () => {
    expect(
      rankMenuQuickPicks(menu, ["masala-papad", "paneer-tikka", "masala-papad"], [
        { menuItemId: "paneer-tikka", quantity: 12 },
        { menuItemId: "vodka", quantity: 4 }
      ]).map((entry) => `${entry.section}:${entry.item.id}`)
    ).toEqual(["recent:masala-papad", "recent:paneer-tikka", "popular:vodka"]);
  });
});
