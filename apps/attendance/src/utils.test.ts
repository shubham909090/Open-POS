import { describe, expect, it } from "vitest";
import type { PayrollRow } from "./types";
import { addDays, addMonths, buildPayrollCsv, formatRupees, fromDateKey, monthKey, payrollFileName, toDateKey } from "./utils";

const payroll: PayrollRow = {
  employeeId: "employee-1",
  month: "2028-02",
  eligibleCalendarDays: 29,
  elapsedEligibleDays: 29,
  futureEligibleDays: 0,
  markedDays: 29,
  unresolvedDays: 0,
  paidOffDays: 2,
  unpaidOffDays: 1,
  presentEquivalentDays: 27.5,
  presentDays: 26,
  offDays: 2,
  halfDays: 1,
  overtimeHours: 3,
  basePayPaise: 2500000,
  deductionsPaise: 86207,
  overtimePayPaise: 64655,
  netPayPaise: 2478448,
  projectedNetPayPaise: 2478448,
  resolution: "resolved",
};

describe("attendance date helpers", () => {
  it("moves through leap day without UTC timezone drift", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(toDateKey(fromDateKey("2028-02-29"))).toBe("2028-02-29");
  });

  it("moves between calendar months and years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(monthKey(fromDateKey("2026-09-05"))).toBe("2026-09");
  });
});

describe("payroll formatting", () => {
  it("formats paise in Indian rupees", () => {
    expect(formatRupees(1234567)).toContain("₹12,346");
  });

  it("escapes quotes and neutralizes spreadsheet formulas in CSV", () => {
    const csv = buildPayrollCsv('=HYPERLINK("bad")', payroll);
    expect(csv).toContain('"Employee","\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Net pay","24784.48"');
  });

  it("labels unresolved payroll as an estimate", () => {
    const csv = buildPayrollCsv("Meera", { ...payroll, netPayPaise: null, projectedNetPayPaise: 2300000, resolution: "in_progress" });
    expect(csv).toContain('"Estimated net pay","23000.00"');
  });

  it("builds a stable filesystem-safe CSV name", () => {
    expect(payrollFileName("  Méera / Joshi..? ", "2028-02")).toBe("sky-payroll-meera-joshi-2028-02.csv");
    expect(payrollFileName("李雷", "not-a-month")).toBe("sky-payroll-employee-month.csv");
  });
});
