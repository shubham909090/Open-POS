import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { createAttendancePairingCode, nowIso, writeAttendanceAudit } from "./attendanceAccess";
import { DEFAULT_ATTENDANCE_POLICY, dateInTimeZone, monthForDate } from "./attendanceModel";

export const provisionPairingCode = internalMutation({
  args: {
    restaurantId: v.id("restaurants"),
    expiresInMinutes: v.optional(v.number())
  },
  returns: v.object({
    pairingCodeId: v.id("attendancePairingCodes"),
    code: v.string(),
    expiresAt: v.string()
  }),
  handler: async (ctx, args) => {
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    const result = await createAttendancePairingCode(ctx, {
      restaurantId: restaurant._id,
      expiresInMinutes: args.expiresInMinutes,
      createdByType: "internal",
      createdByIdentifier: "convex-cli"
    });
    await writeAttendanceAudit(ctx, {
      restaurantId: restaurant._id,
      actorType: "internal",
      actorIdentifier: "convex-cli",
      action: "pairing_code.provisioned",
      entityType: "attendancePairingCode",
      entityId: String(result.pairingCodeId),
      details: { expiresAt: result.expiresAt }
    });
    return result;
  }
});

export const setupQaFixture = internalMutation({
  args: { fixtureKey: v.string() },
  returns: v.object({
    restaurantId: v.id("restaurants"),
    employeeId: v.id("attendanceEmployees"),
    pairingCodeId: v.id("attendancePairingCodes"),
    code: v.string(),
    expiresAt: v.string(),
    month: v.string()
  }),
  handler: async (ctx, args) => {
    const fixtureKey = args.fixtureKey.trim();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(fixtureKey)) {
      throw new Error("Fixture key must be 1-40 letters, numbers, underscores, or hyphens");
    }
    const existing = await ctx.db
      .query("attendanceQaFixtures")
      .withIndex("by_fixtureKey", (q) => q.eq("fixtureKey", fixtureKey))
      .unique();
    if (existing) throw new Error("QA fixture already exists");

    const now = nowIso();
    const timezone = "Asia/Kolkata";
    const today = dateInTimeZone(new Date(), timezone);
    const month = monthForDate(today);
    const restaurantId = await ctx.db.insert("restaurants", {
      name: `[ATTENDANCE_QA:${fixtureKey}]`,
      timezone,
      createdAt: now
    });
    await ctx.db.insert("attendanceQaFixtures", { fixtureKey, restaurantId, createdAt: now });
    const employeeId = await ctx.db.insert("attendanceEmployees", {
      restaurantId,
      name: "QA Employee",
      role: "Server",
      joiningDate: `${month}-01`,
      currentMonthlySalaryPaise: 3_000_000,
      createdAt: now,
      updatedAt: now
    });
    await ctx.db.insert("attendanceEmployeeCompensations", {
      restaurantId,
      employeeId,
      effectiveMonth: month,
      monthlySalaryPaise: 3_000_000,
      createdAt: now,
      updatedAt: now
    });
    await ctx.db.insert("attendancePolicies", {
      restaurantId,
      effectiveMonth: month,
      ...DEFAULT_ATTENDANCE_POLICY,
      createdAt: now,
      updatedAt: now
    });
    const pairing = await createAttendancePairingCode(ctx, {
      restaurantId,
      expiresInMinutes: 60,
      createdByType: "internal",
      createdByIdentifier: `qa:${fixtureKey}`
    });
    await writeAttendanceAudit(ctx, {
      restaurantId,
      actorType: "internal",
      actorIdentifier: `qa:${fixtureKey}`,
      action: "qa_fixture.created",
      entityType: "restaurant",
      entityId: String(restaurantId)
    });
    return { restaurantId, employeeId, ...pairing, month };
  }
});

export const cleanupQaFixture = internalMutation({
  args: { fixtureKey: v.string() },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    const fixtureKey = args.fixtureKey.trim();
    const fixture = await ctx.db
      .query("attendanceQaFixtures")
      .withIndex("by_fixtureKey", (q) => q.eq("fixtureKey", fixtureKey))
      .unique();
    if (!fixture) return { deleted: false };
    const restaurant = await ctx.db.get(fixture.restaurantId);
    if (!restaurant || restaurant.name !== `[ATTENDANCE_QA:${fixtureKey}]`) {
      throw new Error("QA cleanup refused: fixture restaurant marker does not match");
    }

    const auditRows = await ctx.db
      .query("attendanceAuditRecords")
      .withIndex("by_restaurantId_and_occurredAt", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const attendanceRows = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_restaurantId_and_date", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const compensationRows = await ctx.db
      .query("attendanceEmployeeCompensations")
      .withIndex("by_restaurantId_and_effectiveMonth", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const policyRows = await ctx.db
      .query("attendancePolicies")
      .withIndex("by_restaurantId_and_effectiveMonth", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const employeeRows = await ctx.db
      .query("attendanceEmployees")
      .withIndex("by_restaurantId", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const pairingRows = await ctx.db
      .query("attendancePairingCodes")
      .withIndex("by_restaurantId_and_createdAt", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const credentialRows = await ctx.db
      .query("attendanceDeviceCredentials")
      .withIndex("by_restaurantId_and_createdAt", (q) => q.eq("restaurantId", fixture.restaurantId))
      .take(1001);
    const collections = [
      auditRows,
      attendanceRows,
      compensationRows,
      policyRows,
      employeeRows,
      pairingRows,
      credentialRows
    ];
    if (collections.some((rows) => rows.length > 1000)) {
      throw new Error("QA cleanup refused: fixture exceeded the bounded cleanup limit");
    }
    for (const row of auditRows) await ctx.db.delete(row._id);
    for (const row of attendanceRows) await ctx.db.delete(row._id);
    for (const row of compensationRows) await ctx.db.delete(row._id);
    for (const row of policyRows) await ctx.db.delete(row._id);
    for (const row of employeeRows) await ctx.db.delete(row._id);
    for (const row of pairingRows) await ctx.db.delete(row._id);
    for (const row of credentialRows) await ctx.db.delete(row._id);
    await ctx.db.delete(fixture._id);
    await ctx.db.delete(restaurant._id);
    return { deleted: true };
  }
});
