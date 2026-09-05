import { v } from "convex/values";

export const attendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("off"),
  v.literal("half_day"),
  v.literal("overtime")
);

export type AttendanceStatus = "present" | "off" | "half_day" | "overtime";

export type AttendancePolicy = {
  paidOffDays: number;
  standardHours: number;
  overtimeMultiplier: number;
};

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  paidOffDays: 4,
  standardHours: 8,
  overtimeMultiplier: 1.5
};

export type PayrollAttendance = {
  date: string;
  status: AttendanceStatus;
  overtimeHours: number;
};

export type PayrollResult = {
  month: string;
  eligibleCalendarDays: number;
  elapsedEligibleDays: number;
  futureEligibleDays: number;
  markedDays: number;
  unresolvedDays: number;
  presentDays: number;
  offDays: number;
  paidOffDays: number;
  unpaidOffDays: number;
  halfDays: number;
  presentEquivalentDays: number;
  overtimeHours: number;
  basePayPaise: number;
  deductionsPaise: number;
  overtimePayPaise: number;
  projectedNetPayPaise: number;
  netPayPaise: number | null;
  resolution: "resolved" | "unresolved" | "in_progress";
};

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(value: string) {
  if (!MONTH_PATTERN.test(value)) throw new Error("Month must use YYYY-MM format");
  return value;
}

export function assertDate(value: string) {
  if (!DATE_PATTERN.test(value)) throw new Error("Date must use YYYY-MM-DD format");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date is not a valid calendar date");
  }
  return value;
}

export function monthForDate(date: string) {
  return assertDate(date).slice(0, 7);
}

export function monthBounds(month: string) {
  assertMonth(month);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth
  };
}

export function calendarDaysInclusive(start: string, end: string) {
  if (end < start) return 0;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function dateInTimeZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const part = (type: "year" | "month" | "day") =>
      parts.find((candidate) => candidate.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (!year || !month || !day) throw new Error("Missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new Error("Restaurant timezone is invalid");
  }
}

export function assertNonNegativeIntegerPaise(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Salary must be a non-negative integer number of paise");
  }
  return value;
}

export function calculatePayroll(args: {
  month: string;
  joiningDate: string;
  archivedDate?: string;
  monthlySalaryPaise: number;
  policy: AttendancePolicy;
  attendance: Array<PayrollAttendance>;
  asOfDate: string;
}): PayrollResult {
  const bounds = monthBounds(args.month);
  const joiningDate = assertDate(args.joiningDate);
  const archivedDate = args.archivedDate ? assertDate(args.archivedDate) : undefined;
  const asOfDate = assertDate(args.asOfDate);
  const monthlySalaryPaise = assertNonNegativeIntegerPaise(args.monthlySalaryPaise);
  const eligibleStart = joiningDate > bounds.start ? joiningDate : bounds.start;
  const eligibleEnd = archivedDate && archivedDate < bounds.end ? archivedDate : bounds.end;
  const eligibleCalendarDays = calendarDaysInclusive(eligibleStart, eligibleEnd);
  const elapsedEnd = asOfDate < eligibleEnd ? asOfDate : eligibleEnd;
  const elapsedEligibleDays = calendarDaysInclusive(eligibleStart, elapsedEnd);
  const futureEligibleDays = eligibleCalendarDays - elapsedEligibleDays;
  const eligibleAttendance = args.attendance.filter(
    (entry) => entry.date >= eligibleStart && entry.date <= elapsedEnd
  );
  const uniqueDates = new Set(eligibleAttendance.map((entry) => entry.date));
  if (uniqueDates.size !== eligibleAttendance.length) {
    throw new Error("Attendance contains more than one record for a day");
  }

  let presentDays = 0;
  let offDays = 0;
  let halfDays = 0;
  let overtimeHours = 0;
  for (const entry of eligibleAttendance) {
    assertDate(entry.date);
    if (entry.status === "present") presentDays += 1;
    if (entry.status === "off") offDays += 1;
    if (entry.status === "half_day") halfDays += 1;
    if (entry.status === "overtime") {
      presentDays += 1;
      overtimeHours += entry.overtimeHours;
    }
  }

  const paidOffDays = Math.min(offDays, args.policy.paidOffDays);
  const unpaidOffDays = offDays - paidOffDays;
  const markedDays = eligibleAttendance.length;
  const unresolvedDays = elapsedEligibleDays - markedDays;
  const presentEquivalentDays = presentDays + paidOffDays + halfDays * 0.5;
  const basePayPaise = Math.round(
    (monthlySalaryPaise * eligibleCalendarDays) / bounds.daysInMonth
  );
  const deductionsPaise = Math.round(
    (monthlySalaryPaise * (unpaidOffDays + halfDays * 0.5)) / bounds.daysInMonth
  );
  const overtimePayPaise = Math.round(
    (monthlySalaryPaise * overtimeHours * args.policy.overtimeMultiplier) /
      (bounds.daysInMonth * args.policy.standardHours)
  );
  const projectedNetPayPaise = Math.max(0, basePayPaise - deductionsPaise) + overtimePayPaise;
  const resolution = unresolvedDays > 0
    ? "unresolved" as const
    : futureEligibleDays > 0
      ? "in_progress" as const
      : "resolved" as const;

  return {
    month: args.month,
    eligibleCalendarDays,
    elapsedEligibleDays,
    futureEligibleDays,
    markedDays,
    unresolvedDays,
    presentDays,
    offDays,
    paidOffDays,
    unpaidOffDays,
    halfDays,
    presentEquivalentDays,
    overtimeHours,
    basePayPaise,
    deductionsPaise,
    overtimePayPaise,
    projectedNetPayPaise,
    netPayPaise: resolution === "resolved" ? projectedNetPayPaise : null,
    resolution
  };
}
