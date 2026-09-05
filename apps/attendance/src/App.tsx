import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useFonts, Manrope_400Regular, Manrope_600SemiBold } from "@expo-google-fonts/manrope";
import { RefreshCw, WifiOff } from "lucide-react-native";
import { useAttendance } from "./data-provider";
import type { AttendanceEmployee } from "./types";
import { colors, font } from "./theme";
import { BrandMark } from "./components/BrandMark";
import { BottomNav, type MainTab } from "./components/BottomNav";
import { Button, ErrorBanner, OfflineBanner } from "./components/ui";
import { PairingScreen } from "./screens/PairingScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TeamScreen } from "./screens/TeamScreen";
import { EmployeeDetailScreen } from "./screens/EmployeeDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_600SemiBold });
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.ivory} />
      {fontsLoaded || fontError ? <AttendanceApp /> : <LoadingScreen label="Preparing your workspace" />}
    </SafeAreaProvider>
  );
}

function AttendanceApp() {
  const attendance = useAttendance();
  const [tab, setTab] = useState<MainTab>("today");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [rosterDate, setRosterDate] = useState<string | null>(null);
  const previousAsOfDate = useRef<string | null>(null);
  const previousRestaurantId = useRef<string | null>(null);
  const selectedEmployee = attendance.data?.employees.find((employee) => employee.id === employeeId) ?? null;

  const attendanceStatusBar = (
    <StatusBar
      barStyle={attendance.phase === "pairing" ? "light-content" : "dark-content"}
      backgroundColor={attendance.phase === "pairing" ? colors.forest : colors.ivory}
    />
  );

  useEffect(() => {
    if (employeeId && attendance.data && !selectedEmployee) setEmployeeId(null);
  }, [attendance.data, employeeId, selectedEmployee]);

  useEffect(() => {
    const nextData = attendance.data;
    if (!nextData) return;
    const previousDate = previousAsOfDate.current;
    const restaurantChanged = previousRestaurantId.current !== nextData.restaurant.id;
    if (restaurantChanged || rosterDate === null) {
      setRosterDate(nextData.asOfDate);
      if (attendance.month !== nextData.asOfDate.slice(0, 7)) attendance.setMonth(nextData.asOfDate.slice(0, 7));
    } else if (previousDate && previousDate !== nextData.asOfDate && rosterDate === previousDate) {
      setRosterDate(nextData.asOfDate);
      if (attendance.month === previousDate.slice(0, 7)) attendance.setMonth(nextData.asOfDate.slice(0, 7));
    }
    previousAsOfDate.current = nextData.asOfDate;
    previousRestaurantId.current = nextData.restaurant.id;
  }, [attendance.data?.asOfDate, attendance.data?.restaurant.id, attendance.month, rosterDate]);

  if (attendance.phase === "loading") return <>{attendanceStatusBar}<LoadingScreen label="Opening attendance" /></>;
  if (attendance.phase === "pairing") return <>{attendanceStatusBar}<PairingScreen onPair={attendance.pair} loading={attendance.pendingAction === "pair"} initialError={attendance.errorMessage} /></>;
  if (attendance.phase === "error" || !attendance.data) {
    return <>{attendanceStatusBar}<ErrorScreen message={attendance.errorMessage ?? "Attendance could not be loaded."} loading={attendance.pendingAction === "refresh"} resetting={attendance.pendingAction === "sign_out"} onRetry={attendance.refresh} onReset={attendance.signOut} /></>;
  }

  const { data } = attendance;
  const openEmployee = (employee: AttendanceEmployee) => {
    const currentMonth = data.asOfDate.slice(0, 7);
    if (attendance.month !== currentMonth) attendance.setMonth(currentMonth);
    setEmployeeId(employee.id);
  };
  const changeTab = (nextTab: MainTab) => {
    if (nextTab === "today" || nextTab === "settings") {
      const currentMonth = data.asOfDate.slice(0, 7);
      if (attendance.month !== currentMonth) attendance.setMonth(currentMonth);
      if (nextTab === "today") setRosterDate(data.asOfDate);
    }
    setTab(nextTab);
  };

  if (selectedEmployee) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {attendanceStatusBar}
        {!attendance.isOnline ? <OfflineBanner /> : null}
        {attendance.errorMessage ? <ErrorBanner message={attendance.errorMessage} onDismiss={attendance.dismissError} /> : null}
        <EmployeeDetailScreen
          employee={selectedEmployee}
          data={data}
          month={attendance.month}
          savingAction={attendance.pendingAction}
          onMonthChange={attendance.setMonth}
          onBack={() => setEmployeeId(null)}
          onUpdate={(input) => attendance.updateEmployee(selectedEmployee.id, input)}
          onArchive={() => attendance.archiveEmployee(selectedEmployee.id)}
          onMark={attendance.markAttendance}
          onClear={attendance.clearAttendance}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {attendanceStatusBar}
      {!attendance.isOnline ? <OfflineBanner /> : null}
      <View style={styles.topbar}>
        <BrandMark compact />
        <View style={styles.venue}>
          <Text numberOfLines={1} style={styles.venueName}>{data.restaurant.name}</Text>
          <Pressable onPress={() => { void attendance.refresh().catch(() => undefined); }} disabled={attendance.pendingAction === "refresh"} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh attendance">
            <RefreshCw size={16} color={colors.inkMuted} />
          </Pressable>
        </View>
      </View>
      {attendance.errorMessage ? <ErrorBanner message={attendance.errorMessage} onDismiss={attendance.dismissError} /> : null}
      <View style={styles.screen}>
        {tab === "today" ? (
          <TodayScreen data={data} savingAction={attendance.pendingAction} markAttendance={attendance.markAttendance} clearAttendance={attendance.clearAttendance} markUnmarkedPresent={attendance.markUnmarkedPresent} currentMonth={attendance.month} onMonthChange={attendance.setMonth} date={rosterDate ?? data.asOfDate} onDateChange={setRosterDate} />
        ) : tab === "team" ? (
          <TeamScreen employees={data.employees} asOfDate={data.asOfDate} saving={attendance.pendingAction === "save_employee"} onAdd={attendance.addEmployee} onOpen={openEmployee} />
        ) : (
          <SettingsScreen restaurant={data.restaurant} policy={data.policy} month={attendance.month} savingAction={attendance.pendingAction} onUpdatePolicy={attendance.updatePolicy} onSignOut={attendance.signOut} />
        )}
      </View>
      <BottomNav value={tab} onChange={changeTab} />
    </SafeAreaView>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.stateScreen} accessibilityLabel={label}>
      <BrandMark />
      <ActivityIndicator size="small" color={colors.forest} style={styles.loader} />
      <Text style={styles.stateText}>{label}…</Text>
    </View>
  );
}

function ErrorScreen({ message, loading, resetting, onRetry, onReset }: { message: string; loading: boolean; resetting: boolean; onRetry: () => Promise<void>; onReset: () => Promise<void> }) {
  return (
    <SafeAreaView style={styles.stateScreen}>
      <View style={styles.errorIcon}><WifiOff size={25} color={colors.rose} /></View>
      <Text style={styles.errorTitle}>We couldn’t open attendance</Text>
      <Text style={styles.errorBody}>{message}</Text>
      <View style={styles.errorActions}>
        <Button icon={RefreshCw} loading={loading} onPress={() => { void onRetry().catch(() => undefined); }}>Try again</Button>
        <Button tone="quiet" loading={resetting} onPress={() => { void onReset().catch(() => undefined); }}>Remove device and pair again</Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ivory },
  topbar: { minHeight: 66, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  venue: { maxWidth: "46%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 9 },
  venueName: { flexShrink: 1, color: colors.inkMuted, fontFamily: font.medium, fontSize: 11 },
  screen: { flex: 1 },
  stateScreen: { flex: 1, backgroundColor: colors.ivory, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  loader: { marginTop: 28 },
  stateText: { color: colors.inkMuted, fontFamily: font.body, fontSize: 13, marginTop: 10 },
  errorIcon: { width: 58, height: 58, borderRadius: 22, backgroundColor: colors.roseSoft, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  errorTitle: { color: colors.ink, fontFamily: font.display, fontSize: 26, textAlign: "center" },
  errorBody: { color: colors.inkMuted, fontFamily: font.body, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 9, marginBottom: 20, maxWidth: 310 },
  errorActions: { width: "100%", maxWidth: 330, gap: 6 },
});
