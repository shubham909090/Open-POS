import type { BillAdjustmentInput } from "@gaurav-pos/shared";

export function calculateDiscountPaise(totalPaise: number, input: BillAdjustmentInput): number {
  if (input.discountType === "percent") {
    const percent = Math.min(100, input.discountValue ?? 0);
    return Math.round((totalPaise * percent) / 100);
  }
  return Math.min(totalPaise, Math.round(input.discountValue ?? 0));
}

export function allocateByWeight(totalPaise: number, bases: number[]): number[] {
  if (totalPaise <= 0 || bases.length === 0) return bases.map(() => 0);
  const baseTotal = bases.reduce((total, base) => total + Math.max(0, base), 0);
  if (baseTotal <= 0) return bases.map(() => 0);
  const shares = bases.map((base) => Math.floor((totalPaise * Math.max(0, base)) / baseTotal));
  let remainder = totalPaise - shares.reduce((total, share) => total + share, 0);
  for (let index = 0; remainder > 0 && index < shares.length; index += 1) {
    if ((bases[index] ?? 0) <= 0) continue;
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }
  return shares;
}
