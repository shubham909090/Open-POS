const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BUSINESS_DAY_START_HOUR_IST = 6;
const BUSINESS_DAY_START_UTC_HOUR = 0;
const BUSINESS_DAY_START_UTC_MINUTE = 30;

export interface BusinessDayWindow {
  id: string;
  businessDate: string;
  periodStartAt: string;
  periodEndAt: string;
}

function isoDateFromUtcParts(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getBusinessDateForInstant(instant = new Date()): string {
  const shiftedToIst = new Date(instant.getTime() + IST_OFFSET_MS);
  shiftedToIst.setUTCHours(shiftedToIst.getUTCHours() - BUSINESS_DAY_START_HOUR_IST);
  return isoDateFromUtcParts(shiftedToIst);
}

export function businessDayWindowForDate(businessDate: string): BusinessDayWindow {
  const [year, month, day] = businessDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid business date: ${businessDate}`);
  const periodStart = new Date(Date.UTC(year, month - 1, day, BUSINESS_DAY_START_UTC_HOUR, BUSINESS_DAY_START_UTC_MINUTE));
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: `day-${businessDate}`,
    businessDate,
    periodStartAt: periodStart.toISOString(),
    periodEndAt: periodEnd.toISOString()
  };
}

export function currentBusinessDayWindow(instant = new Date()): BusinessDayWindow {
  return businessDayWindowForDate(getBusinessDateForInstant(instant));
}
