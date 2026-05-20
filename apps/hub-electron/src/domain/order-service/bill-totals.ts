import type { TaxComponentAmount } from "@gaurav-pos/shared";
import { calculateLineTotal, calculateTaxComponents } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";

import type { HubOrm } from "../../db/database.js";
import { orderItems } from "../../db/drizzle-schema.js";
import { parseTaxComponents } from "./tax.js";
import type { BillTotals, OrderItemRow } from "./types.js";

export function calculateBillTotals(orm: HubOrm, items: OrderItemRow[]): BillTotals {
  const taxByName = new Map<string, TaxComponentAmount>();
  let subtotalPaise = 0;
  let taxPaise = 0;
  for (const item of items) {
    const lineSubtotal = calculateLineTotal(item.unit_price_paise, item.quantity);
    subtotalPaise += lineSubtotal;
    const components = calculateTaxComponents(lineSubtotal, parseTaxComponents(item.tax_components_json));
    const itemTax = components.reduce((total, component) => total + component.amountPaise, 0);
    taxPaise += itemTax;
    for (const component of components) {
      const name = `${item.sale_group_name_snapshot} ${component.name}`.trim();
      const key = `${name}:${component.rateBps}`;
      const current = taxByName.get(key) ?? { name, rateBps: component.rateBps, amountPaise: 0 };
      current.amountPaise += component.amountPaise;
      taxByName.set(key, current);
    }
    orm.update(orderItems).set({ taxPaise: itemTax }).where(eq(orderItems.id, item.id)).run();
  }
  return {
    subtotalPaise,
    taxPaise,
    totalPaise: subtotalPaise,
    taxBreakdown: [...taxByName.values()]
  };
}
