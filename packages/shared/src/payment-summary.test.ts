import { describe, expect, it } from "vitest";
import { groupPaymentsForDisplay } from "./payment-summary.js";

describe("recorded settlement display", () => {
  it("groups repeated split tenders in a consistent order without mutating records", () => {
    const payments = [{ method: "upi", amountPaise: 12500 }, { method: "cash", amountPaise: 10000 }, { method: "cash", amountPaise: 5000 }, { method: "card", amountPaise: 0 }];
    const original = structuredClone(payments);
    expect(groupPaymentsForDisplay(payments)).toEqual([{ method: "cash", label: "Cash", amountPaise: 15000 }, { method: "upi", label: "UPI", amountPaise: 12500 }]);
    expect(payments).toEqual(original);
  });
  it("retains unknown historical tenders and signed amounts without inventing missing methods", () => {
    expect(groupPaymentsForDisplay([{ method: "voucher", amountPaise: 3000 }, { method: "cash", amountPaise: -1000 }])).toEqual([{ method: "cash", label: "Cash", amountPaise: -1000 }, { method: "voucher", label: "voucher", amountPaise: 3000 }]);
    expect(groupPaymentsForDisplay([])).toEqual([]);
  });
});
