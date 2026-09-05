// @vitest-environment edge-runtime
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

type Fixture = {
  restaurantId: Id<"restaurants">;
  employeeId: Id<"attendanceEmployees">;
  pairingCodeId: Id<"attendancePairingCodes">;
  code: string;
  expiresAt: string;
  month: string;
};

const setupQaFixture = makeFunctionReference<"mutation", { fixtureKey: string }, Fixture>(
  "attendanceProvisioning:setupQaFixture"
);
const pair = makeFunctionReference<"mutation", { code: string }, { token: string; expiresAt: string }>(
  "attendancePairing:pair"
);
const bootstrap = makeFunctionReference<
  "query",
  { token: string; month: string; refreshKey?: string },
  {
    restaurant: { id: Id<"restaurants"> };
    employees: Array<{ id: Id<"attendanceEmployees">; monthlySalaryPaise: number }>;
    policy: { paidOffDays: number; isDefault: boolean };
    payroll: Array<{ employeeId: Id<"attendanceEmployees"> }>;
  }
>("attendance:bootstrap");
const saveEmployee = makeFunctionReference<
  "mutation",
  {
    token: string;
    employeeId?: Id<"attendanceEmployees">;
    name: string;
    role: string;
    joiningDate: string;
    monthlySalaryPaise: number;
    salaryEffectiveMonth?: string;
  },
  { id: Id<"attendanceEmployees"> }
>("attendance:saveEmployee");
const mark = makeFunctionReference<
  "mutation",
  { token: string; employeeId: Id<"attendanceEmployees">; date: string; status: "present" },
  unknown
>("attendance:mark");
const signOut = makeFunctionReference<"mutation", { token: string }, null>("attendance:signOut");
const archiveEmployee = makeFunctionReference<
  "mutation",
  { token: string; employeeId: Id<"attendanceEmployees"> },
  null
>("attendance:archiveEmployee");
const updatePolicy = makeFunctionReference<
  "mutation",
  { token: string; month: string; paidOffDays: number; standardHours: number; overtimeMultiplier: number },
  unknown
>("attendance:updatePolicy");
const batchMarkPresent = makeFunctionReference<
  "mutation",
  { token: string; date: string; employeeIds: Array<Id<"attendanceEmployees">> },
  { markedEmployeeIds: Array<Id<"attendanceEmployees">>; skippedEmployeeIds: Array<Id<"attendanceEmployees">> }
>("attendance:batchMarkPresent");
const listDevices = makeFunctionReference<
  "query",
  { restaurantId: Id<"restaurants">; paginationOpts: { numItems: number; cursor: string | null } },
  {
    page: Array<{ credentialId: Id<"attendanceDeviceCredentials"> }>;
    isDone: boolean;
    continueCursor: string;
  }
>("attendancePairing:listDevices");

function nextMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function previousMonthEnd(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCDate(0);
  return { month: date.toISOString().slice(0, 7), end: date.toISOString().slice(0, 10) };
}

describe("attendance device credential isolation", () => {
  it("scopes every device operation to the paired restaurant and rejects revoked tokens", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(setupQaFixture, { fixtureKey: "first" });
    const second = await t.mutation(setupQaFixture, { fixtureKey: "second" });
    const firstDevice = await t.mutation(pair, { code: first.code });
    const secondDevice = await t.mutation(pair, { code: second.code });

    const added = await t.mutation(saveEmployee, {
      token: firstDevice.token,
      name: "First Restaurant Only",
      role: "Cook",
      joiningDate: `${first.month}-01`,
      monthlySalaryPaise: 2_000_000
    });
    const firstBootstrap = await t.query(bootstrap, { token: firstDevice.token, month: first.month });
    const secondBootstrap = await t.query(bootstrap, { token: secondDevice.token, month: second.month });

    expect(firstBootstrap.restaurant.id).toBe(first.restaurantId);
    expect(firstBootstrap.employees.map((employee) => employee.id)).toContain(added.id);
    expect(secondBootstrap.restaurant.id).toBe(second.restaurantId);
    expect(secondBootstrap.employees.map((employee) => employee.id)).not.toContain(added.id);
    await expect(t.mutation(mark, {
      token: firstDevice.token,
      employeeId: second.employeeId,
      date: `${second.month}-01`,
      status: "present"
    })).rejects.toThrow("Employee not found");

    await t.mutation(signOut, { token: firstDevice.token });
    await expect(t.query(bootstrap, { token: firstDevice.token, month: first.month }))
      .rejects.toThrow("invalid or expired");
  });

  it("keeps salary history and bulk-marks only eligible unmarked employees", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.mutation(setupQaFixture, { fixtureKey: "history-bulk" });
    const device = await t.mutation(pair, { code: fixture.code });
    const added = await t.mutation(saveEmployee, {
      token: device.token,
      name: "Salary History",
      role: "Cashier",
      joiningDate: `${fixture.month}-01`,
      monthlySalaryPaise: 2_000_000
    });
    await t.mutation(saveEmployee, {
      token: device.token,
      employeeId: added.id,
      name: "Salary History",
      role: "Cashier",
      joiningDate: `${fixture.month}-01`,
      monthlySalaryPaise: 3_000_000,
      salaryEffectiveMonth: nextMonth(fixture.month)
    });
    await t.mutation(mark, {
      token: device.token,
      employeeId: fixture.employeeId,
      date: `${fixture.month}-01`,
      status: "present"
    });
    const bulk = await t.mutation(batchMarkPresent, {
      token: device.token,
      date: `${fixture.month}-01`,
      employeeIds: [fixture.employeeId, added.id]
    });
    expect(bulk.markedEmployeeIds).toEqual([added.id]);
    expect(bulk.skippedEmployeeIds).toEqual([fixture.employeeId]);

    const historical = await t.query(bootstrap, { token: device.token, month: fixture.month });
    expect(historical.employees.find((employee) => employee.id === added.id)?.monthlySalaryPaise)
      .toBe(2_000_000);
    await expect(t.mutation(batchMarkPresent, {
      token: device.token,
      date: "9999-12-31",
      employeeIds: [added.id]
    })).rejects.toThrow("Future attendance");
  });

  it("redeems each high-entropy pairing code only once", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.mutation(setupQaFixture, { fixtureKey: "one-use" });
    await t.mutation(pair, { code: fixture.code });
    await expect(t.mutation(pair, { code: fixture.code })).rejects.toThrow("already used");
  });

  it("guards dated history, isolates monthly policy, detects expiry, and permits replacement after archive", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.mutation(setupQaFixture, { fixtureKey: "history-guards" });
    const device = await t.mutation(pair, { code: fixture.code });
    const firstDate = `${fixture.month}-01`;
    await t.mutation(mark, {
      token: device.token,
      employeeId: fixture.employeeId,
      date: firstDate,
      status: "present"
    });
    await expect(t.mutation(saveEmployee, {
      token: device.token,
      employeeId: fixture.employeeId,
      name: "QA Employee",
      role: "Server",
      joiningDate: `${fixture.month}-02`,
      monthlySalaryPaise: 3_000_000
    })).rejects.toThrow("cannot be changed");

    await t.mutation(updatePolicy, {
      token: device.token,
      month: fixture.month,
      paidOffDays: 2,
      standardHours: 8,
      overtimeMultiplier: 1.5
    });
    const configured = await t.query(bootstrap, { token: device.token, month: fixture.month, refreshKey: "configured" });
    const following = await t.query(bootstrap, { token: device.token, month: nextMonth(fixture.month), refreshKey: "following" });
    expect(configured.policy).toMatchObject({ paidOffDays: 2, isDefault: false });
    expect(following.policy).toMatchObject({ paidOffDays: 4, isDefault: true });

    await t.mutation(archiveEmployee, { token: device.token, employeeId: fixture.employeeId });
    const previous = previousMonthEnd(fixture.month);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.employeeId, { archivedDate: previous.end });
    });
    const replacement = await t.mutation(saveEmployee, {
      token: device.token,
      name: "Replacement",
      role: "Server",
      joiningDate: firstDate,
      monthlySalaryPaise: 3_000_000
    });
    const futureEmployee = await t.mutation(saveEmployee, {
      token: device.token,
      name: "Future Joiner",
      role: "Server",
      joiningDate: `${nextMonth(fixture.month)}-01`,
      monthlySalaryPaise: 3_000_000
    });
    const afterReplacement = await t.query(bootstrap, {
      token: device.token,
      month: fixture.month,
      refreshKey: "replacement"
    });
    expect(afterReplacement.employees.map((employee) => employee.id)).toEqual(
      expect.arrayContaining([fixture.employeeId, replacement.id, futureEmployee.id])
    );
    expect(afterReplacement.payroll.map((row) => row.employeeId)).not.toContain(fixture.employeeId);
    expect(afterReplacement.payroll.map((row) => row.employeeId)).not.toContain(futureEmployee.id);
    const archivedDirectory = await t.query(bootstrap, {
      token: device.token,
      month: nextMonth(previous.month),
      refreshKey: "archived-directory"
    });
    expect(archivedDirectory.employees.map((employee) => employee.id)).toContain(fixture.employeeId);

    await t.run(async (ctx) => {
      const credential = (await ctx.db
        .query("attendanceDeviceCredentials")
        .withIndex("by_restaurantId_and_createdAt", (q) => q.eq("restaurantId", fixture.restaurantId))
        .take(1))[0];
      if (!credential) throw new Error("Missing fixture credential");
      await ctx.db.patch(credential._id, { expiresAt: "2000-01-01T00:00:00.000Z" });
    });
    await expect(t.query(bootstrap, {
      token: device.token,
      month: fixture.month,
      refreshKey: "expired"
    })).rejects.toThrow("invalid or expired");
  });

  it("paginates the complete device credential history", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.mutation(setupQaFixture, { fixtureKey: "device-pages" });
    const now = new Date().toISOString();
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        restaurantId: fixture.restaurantId,
        userTokenIdentifier: "test|admin",
        role: "admin",
        createdAt: now
      });
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("attendanceDeviceCredentials", {
          restaurantId: fixture.restaurantId,
          tokenHash: `hash-${index}`,
          tokenPrefix: `att_${String(index).padStart(8, "0")}`,
          createdAt: `${now}-${String(index).padStart(2, "0")}`,
          expiresAt: "2099-01-01T00:00:00.000Z"
        });
      }
    });
    const asAdmin = t.withIdentity({ tokenIdentifier: "test|admin" });
    const first = await asAdmin.query(listDevices, {
      restaurantId: fixture.restaurantId,
      paginationOpts: { numItems: 25, cursor: null }
    });
    const second = await asAdmin.query(listDevices, {
      restaurantId: fixture.restaurantId,
      paginationOpts: { numItems: 25, cursor: first.continueCursor }
    });
    expect(first.page).toHaveLength(25);
    expect(second.page).toHaveLength(5);
    expect(second.isDone).toBe(true);
  });
});

 it("supports two-day operator codes while retaining the admin limit and one-use pairing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.mutation(setupQaFixture, { fixtureKey: "two-day-code" });
  const { createAttendancePairingCode } = await import("./attendanceAccess");
  const result = await t.run(async (ctx) => {
    const result = await createAttendancePairingCode(ctx, { restaurantId: fixture.restaurantId, expiresInMinutes: 2880, createdByType: "internal", createdByIdentifier: "test" });
    const stored = await ctx.db.get(result.pairingCodeId);
    expect(Date.parse(result.expiresAt) - Date.parse(stored!.createdAt)).toBe(48 * 60 * 60 * 1000);
    return result;
  });
  await expect(t.run((ctx) => createAttendancePairingCode(ctx, { restaurantId: fixture.restaurantId, expiresInMinutes: 2881, createdByType: "internal", createdByIdentifier: "test" }))).rejects.toThrow("2880 minutes");
  await expect(t.run((ctx) => createAttendancePairingCode(ctx, { restaurantId: fixture.restaurantId, expiresInMinutes: 2880, createdByType: "admin", createdByIdentifier: "test" }))).rejects.toThrow("60 minutes");
  await t.mutation(pair, { code: result.code });
  await expect(t.mutation(pair, { code: result.code })).rejects.toThrow();
});
