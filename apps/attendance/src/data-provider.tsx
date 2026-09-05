import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AttendanceData, AttendancePendingAction, AttendanceViewModel } from "./types";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;
const sessionKey = "sky-attendance-session-v1";
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  return message.replace(/\[CONVEX[^\]]*\]\s*/g, "").replace(/\[Request ID:[^\]]*\]\s*/g, "")
    .replace(/Server Error\s*/g, "").split(/\n\s*at /)[0]?.replace(/^Uncaught (?:Error|ConvexError):\s*/, "").trim()
    || "Could not save. Please try again.";
}

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
}

export function useAttendance(): AttendanceViewModel {
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [month, setMonthState] = useState(currentMonth);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [pendingAction, setPendingAction] = useState<AttendancePendingAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setOnline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(Date.now);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(sessionKey, secureOptions)
      .then(value => { if (active) setToken(value); })
      .catch(() => { if (active) setErrorMessage("Secure storage could not be opened. Try restarting the app."); })
      .finally(() => { if (active) setInitialized(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!client) return;
    setOnline(client.connectionState().isWebSocketConnected);
    return client.subscribeToConnectionState(state => setOnline(state.isWebSocketConnected));
  }, []);

  useEffect(() => { setData(null); }, [token, month]);

  // Convex queries react to data, not passage of time. Refresh the clock on
  // foreground and each minute so midnight and credential expiry are observed.
  useEffect(() => {
    const tick = () => { if (AppState.currentState === "active") setRevision(Date.now()); };
    const interval = setInterval(tick, 60_000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") tick(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!client || !token) return;
    let active = true;
    const watch = client.watchQuery(api.attendance.bootstrap, { token, month, refreshKey: String(revision) });
    const update = () => {
      if (!active) return;
      try {
        const value = watch.localQueryResult();
        if (!value) return;
        setData({ asOfDate: value.asOfDate, restaurant: value.restaurant, employees: value.employees.map(employee => ({ ...employee, archivedAt: employee.archivedAt ?? null })), records: value.attendance.map(record => ({ ...record, notes: record.notes ?? null })),
          payroll: value.payroll, policy: value.policy });
        setLastSyncedAt(Date.now());
        setErrorMessage(null);
      } catch (error) {
        setData(null);
        setErrorMessage(messageOf(error));
      }
    };
    const unsubscribe = watch.onUpdate(update);
    update();
    const timeout = setTimeout(() => {
      try {
        if (active && watch.localQueryResult() === undefined) setErrorMessage("The server is taking longer than expected. Check your connection and retry.");
      } catch { /* The subscription already reports server errors. */ }
    }, 12_000);
    return () => { active = false; clearTimeout(timeout); unsubscribe(); };
  }, [token, month, revision]);

  const perform = useCallback(async (action: AttendancePendingAction, work: () => Promise<unknown>) => {
    if (busy.current) throw new Error("Please wait for the current change to finish.");
    if (!client) throw new Error("The app has no server address configured.");
    if (!client.connectionState().isWebSocketConnected && action !== "sign_out") {
      const error = new Error("You're offline. Reconnect before making changes.");
      setErrorMessage(error.message);
      throw error;
    }
    busy.current = true;
    setPendingAction(action);
    setErrorMessage(null);
    try { await work(); }
    catch (error) { setErrorMessage(messageOf(error)); throw error; }
    finally { busy.current = false; setPendingAction(null); }
  }, []);

  const requireSession = () => {
    if (!client || !token) throw new Error("Pair this device to continue.");
    return { convex: client, token };
  };
  const employeeId = (id: string) => id as Id<"attendanceEmployees">;

  return {
    phase: !initialized ? "loading" : !client ? "error" : !token ? "pairing" : data ? "ready" : errorMessage ? "error" : "loading",
    data, isOnline, pendingAction,
    errorMessage: !client ? "This build is missing its Convex server address. Set EXPO_PUBLIC_CONVEX_URL and rebuild." : errorMessage,
    lastSyncedAt, month,
    setMonth: value => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) { setErrorMessage(null); setMonthState(value); } },
    dismissError: () => setErrorMessage(null),
    pair: code => perform("pair", async () => {
      const result = await client!.mutation(api.attendancePairing.pair, { code: code.trim() });
      await SecureStore.setItemAsync(sessionKey, result.token, secureOptions);
      setToken(result.token);
    }),
    refresh: () => perform("refresh", async () => { setRevision(value => value + 1); }),
    markAttendance: input => perform("mark_attendance", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.mark, { ...input, employeeId: employeeId(input.employeeId), token: session.token });
    }),
    clearAttendance: (id, date) => perform("mark_attendance", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.clear, { token: session.token, employeeId: employeeId(id), date });
    }),
    markUnmarkedPresent: (date, ids) => perform("batch_present", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.batchMarkPresent, { token: session.token, date, employeeIds: ids.map(employeeId) });
    }),
    addEmployee: input => perform("save_employee", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.saveEmployee, { ...input, token: session.token });
    }),
    updateEmployee: (id, input) => perform("save_employee", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.saveEmployee, { ...input, token: session.token, employeeId: employeeId(id) });
    }),
    archiveEmployee: id => perform("archive_employee", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.archiveEmployee, { token: session.token, employeeId: employeeId(id) });
    }),
    updatePolicy: policy => perform("save_policy", async () => {
      const session = requireSession();
      await session.convex.mutation(api.attendance.updatePolicy, { ...policy, token: session.token, month });
    }),
    signOut: () => perform("sign_out", async () => {
      if (token && client?.connectionState().isWebSocketConnected) {
        try { await client.mutation(api.attendance.signOut, { token }); }
        catch { /* Expired/revoked credentials can still be removed locally. */ }
      }
      await SecureStore.deleteItemAsync(sessionKey, secureOptions);
      setToken(null); setData(null); setLastSyncedAt(null); setErrorMessage(null);
    }),
  };
}
