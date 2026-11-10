const METHOD_LABELS = new Map([["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["online", "Online"]]);

/** Group recorded tenders for display without guessing missing settlement data. */
export function groupPaymentsForDisplay(payments: readonly { method: string; amountPaise: number }[]) {
  const amounts = new Map<string, number>();
  for (const payment of payments) amounts.set(payment.method, (amounts.get(payment.method) ?? 0) + payment.amountPaise);
  const methods = [...new Set([...METHOD_LABELS.keys(), ...amounts.keys()])];
  return methods.filter((method) => amounts.has(method) && amounts.get(method) !== 0)
    .map((method) => ({ method, label: METHOD_LABELS.get(method) ?? method, amountPaise: amounts.get(method)! }));
}
