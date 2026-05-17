export function formatMobileCompactRupees(paise: number) {
  const rupees = paise / 100;
  return rupees % 1 === 0 ? rupees.toFixed(0) : rupees.toFixed(2);
}

export function formatMobileMenuActionLabel(input: { kind?: string; label?: string; pricePaise: number }) {
  const price = `Rs ${formatMobileCompactRupees(input.pricePaise)}`;
  return input.kind === "default" ? `+ ${price}` : `${input.label ?? ""} ${price}`.trim();
}
