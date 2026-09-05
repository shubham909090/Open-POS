import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAttendanceDevice, nowIso, writeAttendanceAudit } from "./attendanceAccess";
import {
  DEFAULT_ATTENDANCE_POLICY,
  assertDate,
  assertMonth,
  assertNonNegativeIntegerPaise,
  attendanceStatusValidator,
  calculatePayroll,
  dateInTimeZone,
  monthBounds,
  monthForDate
} from "./attendanceModel";

const MAX_ACTIVE_EMPLOYEES = 100;
const MAX_ARCHIVED_EMPLOYEES = 1000;
const MAX_MONTH_EMPLOYEES = 200;
const MAX_MONTH_ATTENDANCE_ROWS = MAX_MONTH_EMPLOYEES * 31;

const employeeValidator = v.object({
  id: v.id("attendanceEmployees"),
  name: v.string(),
  role: v.string(),
  joiningDate: v.string(),
  monthlySalaryPaise: v.number(),
  archivedAt: v.optional(v.string()),
  archivedDate: v.optional(v.string())
});

const attendanceRecordValidator = v.object({
  id: v.id("attendanceRecords"),
  employeeId: v.id("attendanceEmployees"),
  date: v.string(),
  status: attendanceStatusValidator,
  overtimeHours: v.number(),
  notes: v.optional(v.string())
});

const policyValidator = v.object({
  effectiveMonth: v.string(),
  paidOffDays: v.number(),
  standardHours: v.number(),
  overtimeMultiplier: v.number(),
  isDefault: v.boolean()
});

const payrollValidator = v.object({
  employeeId: v.id("attendanceEmployees"),
  month: v.string(),
  eligibleCalendarDays: v.number(),
  elapsedEligibleDays: v.number(),
  futureEligibleDays: v.number(),
  markedDays: v.number(),
  unresolvedDays: v.number(),
  presentDays: v.number(),
  offDays: v.number(),
  paidOffDays: v.number(),
  unpaidOffDays: v.number(),
  halfDays: v.number(),
  presentEquivalentDays: v.number(),
  overtimeHours: v.number(),
  basePayPaise: v.number(),
  deductionsPaise: v.number(),
  overtimePayPaise: v.number(),
  projectedNetPayPaise: v.number(),
  netPayPaise: v.union(v.number(), v.null()),
  resolution: v.union(v.literal("resolved"), v.literal("unresolved"), v.literal("in_progress"))
});

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${label} is required`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long`);
  return cleaned;
}

function cleanNotes(value?: string) {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > 500) throw new Error("Attendance notes are too long");
  return cleaned;
}

function assertPolicy(args: { paidOffDays: number; standardHours: number; overtimeMultiplier: number }) {
  if (!Number.isInteger(args.paidOffDays) || args.paidOffDays < 0 || args.paidOffDays > 31) {
    throw new Error("Paid off days must be an integer between 0 and 31");
  }
  if (!Number.isFinite(args.standardHours) || args.standardHours <= 0 || args.standardHours > 24) {
    throw new Error("Standard hours must be greater than 0 and at most 24");
  }
  if (!Number.isFinite(args.overtimeMultiplier) || args.overtimeMultiplier <= 0 || args.overtimeMultiplier > 10) {
    throw new Error("Overtime multiplier must be greater than 0 and at most 10");
  }
}

function assertEmployeeEligibleOn(
  employee: { joiningDate: string; archivedDate?: string },
  date: string
) {
  if (employee.joiningDate > date || (employee.archivedDate && employee.archivedDate < date)) {
    throw new Error("Employee is not active on this date");
  }
}

function attendanceDto(row: {
  _id: Id<"attendanceRecords">;
  employeeId: Id<"attendanceEmployees">;
  date: string;
  status: "present" | "off" | "half_day" | "overtime";
  overtimeHours: number;
  notes?: string;
}) {
  return {
    id: row._id,
    employeeId: row.employeeId,
    date: row.date,
    status: row.status,
    overtimeHours: row.overtimeHours,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

export const bootstrap = query({
  args: { token: v.string(), month: v.string(), refreshKey: v.optional(v.string()) },
  returns: v.object({
    asOfDate: v.string(),
    restaurant: v.object({
      id: v.id("restaurants"),
      name: v.string(),
      timezone: v.string()
    }),
    employees: v.array(employeeValidator),
    attendance: v.array(attendanceRecordValidator),
    policy: policyValidator,
    payroll: v.array(payrollValidator)
  }),
  handler: async (ctx, args) => {
    const month = assertMonth(args.month);
    const { credential, restaurant } = await requireAttendanceDevice(ctx, args.token);
    const bounds = monthBounds(month);
    const asOfDate = dateInTimeZone(new Date(), restaurant.timezone);
    const [activeEmployees, archivedEmployees, attendanceRows, policyRow] = await Promise.all([
      ctx.db
        .query("attendanceEmployees")
        .withIndex("by_restaurantId_and_archivedDate", (q) =>
          q.eq("restaurantId", credential.restaurantId).eq("archivedDate", undefined)
        )
        .take(MAX_ACTIVE_EMPLOYEES + 1),
      ctx.db
        .query("attendanceEmployees")
        .withIndex("by_restaurantId_and_archivedDate", (q) =>
          q.eq("restaurantId", credential.restaurantId).gt("archivedDate", undefined)
        )
        .take(MAX_ARCHIVED_EMPLOYEES + 1),
      ctx.db
        .query("attendanceRecords")
        .withIndex("by_restaurantId_and_date", (q) =>
          q.eq("restaurantId", credential.restaurantId).gte("date", bounds.start).lte("date", bounds.end)
        )
        .take(MAX_MONTH_ATTENDANCE_ROWS + 1),
      ctx.db
        .query("attendancePolicies")
        .withIndex("by_restaurantId_and_effectiveMonth", (q) =>
          q.eq("restaurantId", credential.restaurantId).eq("effectiveMonth", month)
        )
        .unique()
    ]);
    if (activeEmployees.length > MAX_ACTIVE_EMPLOYEES) {
      throw new Error(`Attendance supports at most ${MAX_ACTIVE_EMPLOYEES} active employees per restaurant`);
    }
    if (archivedEmployees.length > MAX_ARCHIVED_EMPLOYEES) {
      throw new Error(`Attendance directory supports at most ${MAX_ARCHIVED_EMPLOYEES} archived employees`);
    }
    const directoryEmployees = [...activeEmployees, ...archivedEmployees];
    if (attendanceRows.length > MAX_MONTH_ATTENDANCE_ROWS) {
      throw new Error("Attendance data exceeds the supported monthly capacity");
    }

    const eligibleEmployees = directoryEmployees.filter(
      (employee) => employee.joiningDate <= bounds.end && (!employee.archivedDate || employee.archivedDate >= bounds.start)
    );
    if (eligibleEmployees.length > MAX_MONTH_EMPLOYEES) {
      throw new Error(`Attendance supports at most ${MAX_MONTH_EMPLOYEES} employees in one monthly payroll`);
    }
    const eligibleIds = new Set(eligibleEmployees.map((employee) => String(employee._id)));
    const salaryRows = await Promise.all(
      directoryEmployees.map(async (employee) =>
        (await ctx.db
          .query("attendanceEmployeeCompensations")
          .withIndex("by_employeeId_and_effectiveMonth", (q) =>
            q.eq("employeeId", employee._id).lte("effectiveMonth", month)
          )
          .order("desc")
          .take(1))[0]
      )
    );
    const latestSalary = new Map(
      salaryRows
        .filter((row) => row !== undefined)
        .map((row) => [String(row.employeeId), row.monthlySalaryPaise] as const)
    );
    const policy = policyRow
      ? {
          effectiveMonth: policyRow.effectiveMonth,
          paidOffDays: policyRow.paidOffDays,
          standardHours: policyRow.standardHours,
          overtimeMultiplier: policyRow.overtimeMultiplier,
          isDefault: false
        }
      : { effectiveMonth: month, ...DEFAULT_ATTENDANCE_POLICY, isDefault: true };
    const relevantAttendance = attendanceRows.filter((row) => eligibleIds.has(String(row.employeeId)));
    const employees = directoryEmployees.map((employee) => ({
      id: employee._id,
      name: employee.name,
      role: employee.role,
      joiningDate: employee.joiningDate,
      monthlySalaryPaise: latestSalary.get(String(employee._id)) ?? employee.currentMonthlySalaryPaise,
      ...(employee.archivedAt ? { archivedAt: employee.archivedAt } : {}),
      ...(employee.archivedDate ? { archivedDate: employee.archivedDate } : {})
    }));
    const employeeDtos = new Map(employees.map((employee) => [String(employee.id), employee] as const));
    const payroll = eligibleEmployees.map((eligibleEmployee) => {
      const employee = employeeDtos.get(String(eligibleEmployee._id));
      if (!employee) throw new Error("Employee directory is inconsistent");
      return {
        employeeId: employee.id,
        ...calculatePayroll({
          month,
          joiningDate: employee.joiningDate,
          archivedDate: employee.archivedDate,
          monthlySalaryPaise: employee.monthlySalaryPaise,
          policy,
          attendance: relevantAttendance
            .filter((row) => row.employeeId === employee.id)
            .map((row) => ({ date: row.date, status: row.status, overtimeHours: row.overtimeHours })),
          asOfDate
        })
      };
    });

    return {
      asOfDate,
      restaurant: { id: restaurant._id, name: restaurant.name, timezone: restaurant.timezone },
      employees,
      attendance: relevantAttendance.map(attendanceDto),
      policy,
      payroll
    };
  }
});

export const saveEmployee = mutation({
  args: {
    token: v.string(),
    employeeId: v.optional(v.id("attendanceEmployees")),
    name: v.string(),
    role: v.string(),
    joiningDate: v.string(),
    monthlySalaryPaise: v.number(),
    salaryEffectiveMonth: v.optional(v.string())
  },
  returns: employeeValidator,
  handler: async (ctx, args) => {
    const { credential, restaurant } = await requireAttendanceDevice(ctx, args.token);
    const name = cleanRequired(args.name, "Employee name", 120);
    const role = cleanRequired(args.role, "Employee role", 80);
    const joiningDate = assertDate(args.joiningDate);
    const monthlySalaryPaise = assertNonNegativeIntegerPaise(args.monthlySalaryPaise);
    const today = dateInTimeZone(new Date(), restaurant.timezone);
    const effectiveMonth = assertMonth(
      args.salaryEffectiveMonth ?? (args.employeeId ? monthForDate(today) : monthForDate(joiningDate))
    );
    if (effectiveMonth < monthForDate(joiningDate)) {
      throw new Error("Salary effective month cannot be before the joining month");
    }
    const now = nowIso();
    let employeeId = args.employeeId;
    let archivedAt: string | undefined;
    let archivedDate: string | undefined;
    let employeeBefore: Record<string, unknown> | null = null;
    if (employeeId) {
      const existingEmployeeId = employeeId;
      const employee = await ctx.db.get(existingEmployeeId);
      if (!employee || employee.restaurantId !== credential.restaurantId) throw new Error("Employee not found");
      if (employee.archivedAt) throw new Error("Archived employees cannot be edited");
      if (joiningDate !== employee.joiningDate) {
        throw new Error("Joining date cannot be changed after an employee is created");
      }
      employeeBefore = {
        name: employee.name,
        role: employee.role,
        joiningDate: employee.joiningDate,
        monthlySalaryPaise: employee.currentMonthlySalaryPaise
      };
      await ctx.db.patch(existingEmployeeId, {
        name,
        role,
        joiningDate,
        currentMonthlySalaryPaise: monthlySalaryPaise,
        updatedAt: now
      });
      archivedAt = employee.archivedAt;
      archivedDate = employee.archivedDate;
    } else {
      const employeeCapacity = await ctx.db
        .query("attendanceEmployees")
        .withIndex("by_restaurantId_and_archivedDate", (q) =>
          q.eq("restaurantId", credential.restaurantId).eq("archivedDate", undefined)
        )
        .take(MAX_ACTIVE_EMPLOYEES);
      if (employeeCapacity.length >= MAX_ACTIVE_EMPLOYEES) {
        throw new Error(`Attendance supports at most ${MAX_ACTIVE_EMPLOYEES} active employees per restaurant`);
      }
      employeeId = await ctx.db.insert("attendanceEmployees", {
        restaurantId: credential.restaurantId,
        name,
        role,
        joiningDate,
        currentMonthlySalaryPaise: monthlySalaryPaise,
        createdAt: now,
        updatedAt: now
      });
    }
    const compensation = await ctx.db
      .query("attendanceEmployeeCompensations")
      .withIndex("by_employeeId_and_effectiveMonth", (q) =>
        q.eq("employeeId", employeeId).eq("effectiveMonth", effectiveMonth)
      )
      .unique();
    if (compensation) {
      await ctx.db.patch(compensation._id, { monthlySalaryPaise, updatedAt: now });
    } else {
      await ctx.db.insert("attendanceEmployeeCompensations", {
        restaurantId: credential.restaurantId,
        employeeId,
        effectiveMonth,
        monthlySalaryPaise,
        createdAt: now,
        updatedAt: now
      });
    }
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: args.employeeId ? "employee.updated" : "employee.created",
      entityType: "attendanceEmployee",
      entityId: String(employeeId),
      details: {
        before: employeeBefore,
        after: { name, role, joiningDate, monthlySalaryPaise },
        salary: {
          effectiveMonth,
          beforePaise: compensation?.monthlySalaryPaise ?? null,
          afterPaise: monthlySalaryPaise
        }
      }
    });
    return {
      id: employeeId,
      name,
      role,
      joiningDate,
      monthlySalaryPaise,
      ...(archivedAt ? { archivedAt } : {}),
      ...(archivedDate ? { archivedDate } : {})
    };
  }
});

export const archiveEmployee = mutation({
  args: { token: v.string(), employeeId: v.id("attendanceEmployees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { credential, restaurant } = await requireAttendanceDevice(ctx, args.token);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.restaurantId !== credential.restaurantId) throw new Error("Employee not found");
    if (!employee.archivedAt) {
      const archivedAt = nowIso();
      const archivedDate = dateInTimeZone(new Date(), restaurant.timezone);
      await ctx.db.patch(employee._id, {
        archivedAt,
        archivedDate,
        updatedAt: archivedAt
      });
      await writeAttendanceAudit(ctx, {
        restaurantId: credential.restaurantId,
        deviceCredentialId: credential._id,
        actorType: "device",
        actorIdentifier: String(credential._id),
        action: "employee.archived",
        entityType: "attendanceEmployee",
        entityId: String(employee._id),
        details: {
          before: { archivedAt: null, archivedDate: null },
          after: { archivedAt, archivedDate }
        }
      });
    }
    return null;
  }
});

export const mark = mutation({
  args: {
    token: v.string(),
    employeeId: v.id("attendanceEmployees"),
    date: v.string(),
    status: attendanceStatusValidator,
    overtimeHours: v.optional(v.number()),
    notes: v.optional(v.string())
  },
  returns: attendanceRecordValidator,
  handler: async (ctx, args) => {
    const { credential, restaurant } = await requireAttendanceDevice(ctx, args.token);
    const date = assertDate(args.date);
    if (date > dateInTimeZone(new Date(), restaurant.timezone)) throw new Error("Future attendance cannot be marked");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.restaurantId !== credential.restaurantId) throw new Error("Employee not found");
    assertEmployeeEligibleOn(employee, date);
    const requestedOvertime = args.overtimeHours ?? 0;
    if (args.status === "overtime") {
      if (!Number.isFinite(requestedOvertime) || requestedOvertime <= 0 || requestedOvertime > 24) {
        throw new Error("Overtime hours must be greater than 0 and at most 24");
      }
    } else if (requestedOvertime !== 0) {
      throw new Error("Overtime hours are only allowed with overtime status");
    }
    const overtimeHours = args.status === "overtime" ? requestedOvertime : 0;
    const notes = cleanNotes(args.notes);
    const existing = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employeeId_and_date", (q) => q.eq("employeeId", employee._id).eq("date", date))
      .unique();
    const now = nowIso();
    let attendanceId: Id<"attendanceRecords">;
    if (existing) {
      attendanceId = existing._id;
      await ctx.db.patch(existing._id, {
        status: args.status,
        overtimeHours,
        notes,
        updatedAt: now
      });
    } else {
      attendanceId = await ctx.db.insert("attendanceRecords", {
        restaurantId: credential.restaurantId,
        employeeId: employee._id,
        date,
        status: args.status,
        overtimeHours,
        ...(notes ? { notes } : {}),
        createdAt: now,
        updatedAt: now
      });
    }
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: existing ? "attendance.updated" : "attendance.marked",
      entityType: "attendanceRecord",
      entityId: String(attendanceId),
      details: {
        employeeId: String(employee._id),
        date,
        before: existing
          ? { status: existing.status, overtimeHours: existing.overtimeHours, notes: existing.notes ?? null }
          : null,
        after: { status: args.status, overtimeHours, notes: notes ?? null }
      }
    });
    return { id: attendanceId, employeeId: employee._id, date, status: args.status, overtimeHours, ...(notes ? { notes } : {}) };
  }
});

export const batchMarkPresent = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    employeeIds: v.array(v.id("attendanceEmployees"))
  },
  returns: v.object({
    markedEmployeeIds: v.array(v.id("attendanceEmployees")),
    skippedEmployeeIds: v.array(v.id("attendanceEmployees"))
  }),
  handler: async (ctx, args) => {
    const { credential, restaurant } = await requireAttendanceDevice(ctx, args.token);
    const date = assertDate(args.date);
    if (date > dateInTimeZone(new Date(), restaurant.timezone)) throw new Error("Future attendance cannot be marked");
    if (args.employeeIds.length > 200) throw new Error("At most 200 employees can be marked at once");
    if (new Set(args.employeeIds.map(String)).size !== args.employeeIds.length) {
      throw new Error("Employee list contains duplicates");
    }
    const markedEmployeeIds: Array<Id<"attendanceEmployees">> = [];
    const skippedEmployeeIds: Array<Id<"attendanceEmployees">> = [];
    const now = nowIso();
    for (const employeeId of args.employeeIds) {
      const employee = await ctx.db.get(employeeId);
      if (!employee || employee.restaurantId !== credential.restaurantId) throw new Error("Employee not found");
      if (employee.joiningDate > date || (employee.archivedDate && employee.archivedDate < date)) {
        skippedEmployeeIds.push(employeeId);
        continue;
      }
      const existing = await ctx.db
        .query("attendanceRecords")
        .withIndex("by_employeeId_and_date", (q) => q.eq("employeeId", employeeId).eq("date", date))
        .unique();
      if (existing) {
        skippedEmployeeIds.push(employeeId);
        continue;
      }
      await ctx.db.insert("attendanceRecords", {
        restaurantId: credential.restaurantId,
        employeeId,
        date,
        status: "present",
        overtimeHours: 0,
        createdAt: now,
        updatedAt: now
      });
      markedEmployeeIds.push(employeeId);
    }
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: "attendance.batch_marked_present",
      entityType: "attendanceDate",
      entityId: date,
      details: {
        markedEmployeeIds: markedEmployeeIds.map(String),
        skippedEmployeeIds: skippedEmployeeIds.map(String),
        after: { status: "present", overtimeHours: 0, notes: null }
      }
    });
    return { markedEmployeeIds, skippedEmployeeIds };
  }
});

export const clear = mutation({
  args: { token: v.string(), employeeId: v.id("attendanceEmployees"), date: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { credential } = await requireAttendanceDevice(ctx, args.token);
    const date = assertDate(args.date);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.restaurantId !== credential.restaurantId) throw new Error("Employee not found");
    const existing = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employeeId_and_date", (q) => q.eq("employeeId", employee._id).eq("date", date))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: "attendance.cleared",
      entityType: "attendanceRecord",
      entityId: existing ? String(existing._id) : `${employee._id}:${date}`,
      details: {
        employeeId: String(employee._id),
        date,
        before: existing
          ? { status: existing.status, overtimeHours: existing.overtimeHours, notes: existing.notes ?? null }
          : null,
        after: null
      }
    });
    return null;
  }
});

export const updatePolicy = mutation({
  args: {
    token: v.string(),
    month: v.string(),
    paidOffDays: v.number(),
    standardHours: v.number(),
    overtimeMultiplier: v.number()
  },
  returns: policyValidator,
  handler: async (ctx, args) => {
    const { credential } = await requireAttendanceDevice(ctx, args.token);
    const effectiveMonth = assertMonth(args.month);
    assertPolicy(args);
    const existing = await ctx.db
      .query("attendancePolicies")
      .withIndex("by_restaurantId_and_effectiveMonth", (q) =>
        q.eq("restaurantId", credential.restaurantId).eq("effectiveMonth", effectiveMonth)
      )
      .unique();
    const now = nowIso();
    let policyId: Id<"attendancePolicies">;
    if (existing) {
      policyId = existing._id;
      await ctx.db.patch(existing._id, {
        paidOffDays: args.paidOffDays,
        standardHours: args.standardHours,
        overtimeMultiplier: args.overtimeMultiplier,
        updatedAt: now
      });
    } else {
      policyId = await ctx.db.insert("attendancePolicies", {
        restaurantId: credential.restaurantId,
        effectiveMonth,
        paidOffDays: args.paidOffDays,
        standardHours: args.standardHours,
        overtimeMultiplier: args.overtimeMultiplier,
        createdAt: now,
        updatedAt: now
      });
    }
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: "policy.updated",
      entityType: "attendancePolicy",
      entityId: String(policyId),
      details: {
        effectiveMonth,
        before: existing
          ? {
              paidOffDays: existing.paidOffDays,
              standardHours: existing.standardHours,
              overtimeMultiplier: existing.overtimeMultiplier
            }
          : null,
        after: {
          paidOffDays: args.paidOffDays,
          standardHours: args.standardHours,
          overtimeMultiplier: args.overtimeMultiplier
        }
      }
    });
    return {
      effectiveMonth,
      paidOffDays: args.paidOffDays,
      standardHours: args.standardHours,
      overtimeMultiplier: args.overtimeMultiplier,
      isDefault: false
    };
  }
});

export const signOut = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { credential } = await requireAttendanceDevice(ctx, args.token);
    const revokedAt = nowIso();
    await ctx.db.patch(credential._id, { revokedAt });
    await writeAttendanceAudit(ctx, {
      restaurantId: credential.restaurantId,
      deviceCredentialId: credential._id,
      actorType: "device",
      actorIdentifier: String(credential._id),
      action: "device.signed_out",
      entityType: "attendanceDeviceCredential",
      entityId: String(credential._id)
    });
    return null;
  }
});
