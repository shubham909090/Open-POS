import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENDANCE_POLICY,
  assertDate,
  calculatePayroll,
  type AttendanceStatus
} from "./attendanceModel";

function january(statusForDay: (day: number) => AttendanceStatus, overtimeDay?: number) {
  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return {
      date: `2026-01-${String(day).padStart(2, "0")}`,
      status: statusForDay(day),
      overtimeHours: day === overtimeDay ? 2 : 0
    };
  });
}

describe("attendance payroll", () => {
  it("uses a calendar-day divisor, four monthly paid offs, half-day deduction, and overtime", () => {
    const payroll = calculatePayroll({
      month: "2026-01",
      joiningDate: "2026-01-01",
      monthlySalaryPaise: 310_000,
      policy: DEFAULT_ATTENDANCE_POLICY,
      attendance: january((day) => {
        if ([1, 2, 3, 4, 5].includes(day)) return "off";
        if (day === 6) return "half_day";
        if (day === 7) return "overtime";
        return "present";
      }, 7),
      asOfDate: "2026-01-31"
    });

    expect(payroll).toMatchObject({
      eligibleCalendarDays: 31,
      paidOffDays: 4,
      unpaidOffDays: 1,
      halfDays: 1,
      deductionsPaise: 15_000,
      overtimePayPaise: 3_750,
      projectedNetPayPaise: 298_750,
      netPayPaise: 298_750,
      resolution: "resolved"
    });
  });

  it("prorates from joining day and rounds to integer paise", () => {
    const payroll = calculatePayroll({
      month: "2026-02",
      joiningDate: "2026-02-15",
      monthlySalaryPaise: 10_001,
      policy: DEFAULT_ATTENDANCE_POLICY,
      attendance: Array.from({ length: 14 }, (_, index) => ({
        date: `2026-02-${String(index + 15).padStart(2, "0")}`,
        status: "present" as const,
        overtimeHours: 0
      })),
      asOfDate: "2026-02-28"
    });

    expect(payroll.eligibleCalendarDays).toBe(14);
    expect(payroll.basePayPaise).toBe(5_001);
    expect(payroll.netPayPaise).toBe(5_001);
  });

  it("separates elapsed unmarked days from future pending dates", () => {
    const unresolved = calculatePayroll({
      month: "2026-09",
      joiningDate: "2026-09-01",
      monthlySalaryPaise: 300_000,
      policy: DEFAULT_ATTENDANCE_POLICY,
      attendance: [1, 2].map((day) => ({
        date: `2026-09-0${day}`,
        status: "present" as const,
        overtimeHours: 0
      })),
      asOfDate: "2026-09-05"
    });
    expect(unresolved).toMatchObject({
      elapsedEligibleDays: 5,
      futureEligibleDays: 25,
      unresolvedDays: 3,
      netPayPaise: null,
      resolution: "unresolved"
    });

    const inProgress = calculatePayroll({
      month: "2026-09",
      joiningDate: "2026-09-01",
      monthlySalaryPaise: 300_000,
      policy: DEFAULT_ATTENDANCE_POLICY,
      attendance: [1, 2, 3, 4, 5].map((day) => ({
        date: `2026-09-0${day}`,
        status: "present" as const,
        overtimeHours: 0
      })),
      asOfDate: "2026-09-05"
    });
    expect(inProgress).toMatchObject({
      futureEligibleDays: 25,
      unresolvedDays: 0,
      netPayPaise: null,
      resolution: "in_progress"
    });
  });

  it("does not roll unused off allowance into another month", () => {
    const payroll = calculatePayroll({
      month: "2026-02",
      joiningDate: "2026-02-01",
      monthlySalaryPaise: 280_000,
      policy: { ...DEFAULT_ATTENDANCE_POLICY, paidOffDays: 1 },
      attendance: Array.from({ length: 28 }, (_, index) => ({
        date: `2026-02-${String(index + 1).padStart(2, "0")}`,
        status: index < 2 ? "off" as const : "present" as const,
        overtimeHours: 0
      })),
      asOfDate: "2026-02-28"
    });
    expect(payroll).toMatchObject({ paidOffDays: 1, unpaidOffDays: 1, deductionsPaise: 10_000 });
  });

  it("rejects impossible calendar dates", () => {
    expect(() => assertDate("2026-02-31")).toThrow("valid calendar date");
  });
});
