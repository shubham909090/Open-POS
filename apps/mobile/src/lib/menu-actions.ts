import { formatRupees } from "./mobile-format";

export function formatMobileCompactRupees(paise: number) {
  return formatRupees(paise);
}

export function formatMobileMenuActionLabel(input: { kind?: string; label?: string; pricePaise: number }) {
  const price = `₹${formatMobileCompactRupees(input.pricePaise)}`;
  return input.kind === "default" ? `+ ${price}` : `${input.label ?? ""} ${price}`.trim();
}
