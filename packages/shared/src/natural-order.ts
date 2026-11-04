const naturalNames = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
/** Natural service order: A2 before A10, with a stable tie for case variants. */
export function compareNaturalNames(left: string, right: string): number {
  return naturalNames.compare(left, right) || (left < right ? -1 : left > right ? 1 : 0);
}
