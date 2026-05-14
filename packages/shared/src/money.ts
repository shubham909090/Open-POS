export type Paisa = number;

export function calculateLineTotal(unitPricePaise: Paisa, quantity: number): Paisa {
  return unitPricePaise * quantity;
}

export function calculateTax(subtotalPaise: Paisa, taxRateBps: number): Paisa {
  return Math.round((subtotalPaise * taxRateBps) / 10_000);
}

export interface TaxComponentAmount {
  name: string;
  rateBps: number;
  amountPaise: Paisa;
}

export function calculateTaxComponents(subtotalPaise: Paisa, components: Array<{ name: string; rateBps: number }>): TaxComponentAmount[] {
  return components.map((component) => ({
    name: component.name,
    rateBps: component.rateBps,
    amountPaise: calculateTax(subtotalPaise, component.rateBps)
  }));
}

export function formatInr(paise: Paisa): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(paise / 100);
}
