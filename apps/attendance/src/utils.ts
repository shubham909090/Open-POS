import type { AttendanceRecord, AttendanceStatus, PayrollRow } from "./types";

export const pad = (value: number) => String(value).padStart(2, "0");

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(value: string): Date {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(year, month - 1, day, 12);
}

export function addDays(value: string, amount: number): string {
  const date = fromDateKey(value);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthFromKey(value: string): Date {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  return new Date(year, month - 1, 1, 12);
}

export function addMonths(value: string, amount: number): string {
  const date = monthFromKey(value);
  date.setMonth(date.getMonth() + amount);
  return monthKey(date);
}

export function formatDayHeading(value: string, asOfDate = toDateKey(new Date())): string {
  const today = asOfDate;
  const yesterday = addDays(today, -1);
  const prefix = value === today ? "Today" : value === yesterday ? "Yesterday" : fromDateKey(value).toLocaleDateString("en-IN", { weekday: "long" });
  return `${prefix}, ${fromDateKey(value).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`;
}

export function formatMonth(value: string): string {
  return monthFromKey(value).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function formatShortDate(value: string): string {
  return fromDateKey(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRupees(paise: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits,
  }).format(paise / 100);
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "—";
}

export function recordFor(records: AttendanceRecord[], employeeId: string, date: string): AttendanceRecord | undefined {
  return records.find((record) => record.employeeId === employeeId && record.date === date);
}

export const statusLabel: Record<AttendanceStatus, string> = {
  off: "Off",
  present: "Present",
  half_day: "Half day",
  overtime: "Overtime",
};

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function buildPayrollCsv(employeeName: string, payroll: PayrollRow): string {
  const rows: Array<[string, string | number]> = [
    ["Employee", employeeName],
    ["Month", payroll.month],
    ["Eligible calendar days", payroll.eligibleCalendarDays],
    ["Marked days", payroll.markedDays],
    ["Unresolved days", payroll.unresolvedDays],
    ["Paid off days", payroll.paidOffDays],
    ["Unpaid off days", payroll.unpaidOffDays],
    ["Present equivalent days", payroll.presentEquivalentDays],
    ["Overtime hours", payroll.overtimeHours],
    ["Base pay", (payroll.basePayPaise / 100).toFixed(2)],
    ["Deductions", (payroll.deductionsPaise / 100).toFixed(2)],
    ["Overtime pay", (payroll.overtimePayPaise / 100).toFixed(2)],
    [payroll.netPayPaise === null ? "Estimated net pay" : "Net pay", ((payroll.netPayPaise ?? payroll.projectedNetPayPaise) / 100).toFixed(2)],
    ["Resolution", payroll.resolution],
  ];
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return rows.map(([key, value]) => `${cell(key)},${cell(value)}`).join("\n");
}

export function payrollFileName(employeeName: string, month: string): string {
  const slug = employeeName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "employee";
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : "month";
  return `sky-payroll-${slug}-${safeMonth}.csv`;
}
