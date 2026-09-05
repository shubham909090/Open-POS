import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCheck, ChevronLeft, ChevronRight, CircleDashed, Users } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { AttendanceData, AttendanceEmployee, AttendanceInput } from "../types";
import { colors, font, shadow } from "../theme";
import { addDays, formatDayHeading, initials, monthKey, recordFor } from "../utils";
import { AttendanceSheet } from "../components/AttendanceSheet";
import { ConfirmModal } from "../components/ConfirmModal";
import { Button, EmptyState, SectionLabel, StatusPill } from "../components/ui";

type Props = {
  data: AttendanceData;
  savingAction: string | null;
  markAttendance: (input: AttendanceInput) => Promise<void>;
  clearAttendance: (employeeId: string, date: string) => Promise<void>;
  markUnmarkedPresent: (date: string, employeeIds: string[]) => Promise<void>;
  currentMonth: string;
  onMonthChange: (month: string) => void;
  date: string;
  onDateChange: (date: string) => void;
};

export function TodayScreen({ data, savingAction, markAttendance, clearAttendance, markUnmarkedPresent, currentMonth, onMonthChange, date, onDateChange }: Props) {
  const today = data.asOfDate;
  const [selected, setSelected] = useState<AttendanceEmployee | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const employees = useMemo(() => data.employees.filter((employee) => {
    const archivedDate = employee.archivedDate ?? employee.archivedAt?.slice(0, 10);
    return employee.joiningDate <= date && (!archivedDate || archivedDate >= date);
  }), [data.employees, date]);
  const marked = employees.filter((employee) => recordFor(data.records, employee.id, date));
  const unmarked = employees.filter((employee) => !recordFor(data.records, employee.id, date));
  const completion = employees.length ? Math.round(marked.length / employees.length * 100) : 0;
  const selectedRecord = selected ? recordFor(data.records, selected.id, date) : undefined;
  const changeDate = (nextDate: string) => {
    onDateChange(nextDate);
    const nextMonth = monthKey(new Date(`${nextDate}T12:00:00`));
    if (nextMonth !== currentMonth) onMonthChange(nextMonth);
  };

  const batch = async () => {
    await markUnmarkedPresent(date, unmarked.map((employee) => employee.id));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmBatch(false);
  };

  return (
    <View style={styles.fill}>
      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.dateRow}>
              <Pressable onPress={() => changeDate(addDays(date, -1))} style={styles.dateButton} accessibilityRole="button" accessibilityLabel="Previous day"><ChevronLeft size={21} color={colors.ink} /></Pressable>
              <View style={styles.dateCopy}>
                <Text style={styles.date}>{formatDayHeading(date, today)}</Text>
                {date !== today ? <Pressable onPress={() => changeDate(today)} hitSlop={8}><Text style={styles.backToday}>BACK TO TODAY</Text></Pressable> : <Text style={styles.backToday}>LIVE ROSTER</Text>}
              </View>
              <Pressable disabled={date >= today} onPress={() => changeDate(addDays(date, 1))} style={[styles.dateButton, date >= today && styles.disabled]} accessibilityRole="button" accessibilityLabel="Next day"><ChevronRight size={21} color={colors.ink} /></Pressable>
            </View>
            <View style={styles.summary}>
              <View style={styles.summaryTop}>
                <View>
                  <SectionLabel>Attendance progress</SectionLabel>
                  <Text style={styles.summaryNumber}>{marked.length}<Text style={styles.summaryDenominator}> / {employees.length} marked</Text></Text>
                </View>
                <View style={styles.percentCircle}><Text style={styles.percent}>{completion}%</Text></View>
              </View>
              <View style={styles.track}><View style={[styles.trackFill, { width: `${completion}%` }]} /></View>
              {unmarked.length > 0 ? <Button icon={CheckCheck} tone="secondary" onPress={() => setConfirmBatch(true)} testID="batch-present">Mark {unmarked.length} unmarked present</Button> : employees.length ? <View style={styles.complete}><CheckCheck size={18} color={colors.forest} /><Text style={styles.completeText}>Everyone is accounted for.</Text></View> : null}
            </View>
            <View style={styles.sectionRow}>
              <SectionLabel>Team roster</SectionLabel>
              <Text style={styles.count}>{employees.length} {employees.length === 1 ? "person" : "people"}</Text>
            </View>
          </>
        }
        renderItem={({ item }) => {
          const record = recordFor(data.records, item.id, date);
          return (
            <Pressable
              cssInterop={false}
              onPress={() => setSelected(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${record ? record.status.replace("_", " ") : "not marked"}`}
              testID={`roster-${item.id}`}
              style={({ pressed }) => [styles.person, pressed && styles.pressed]}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.name)}</Text></View>
              <View style={styles.personCopy}>
                <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.role}>{item.role}</Text>
              </View>
              {record ? <StatusPill status={record.status} compact /> : <View style={styles.unmarked}><CircleDashed size={14} color={colors.inkMuted} /><Text style={styles.unmarkedText}>Mark</Text></View>}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState icon={Users} title="No one on this roster" body="Add a team member or choose a date after their joining day." />}
      />
      <AttendanceSheet
        employee={selected}
        date={date}
        record={selectedRecord}
        visible={!!selected}
        saving={savingAction === "mark_attendance"}
        onClose={() => setSelected(null)}
        onSave={markAttendance}
        onClear={clearAttendance}
      />
      <ConfirmModal
        visible={confirmBatch}
        title="Mark everyone present?"
        body={`This will mark ${unmarked.length} unmarked ${unmarked.length === 1 ? "person" : "people"} present for ${formatDayHeading(date, today)}. Existing entries stay unchanged.`}
        confirmLabel="Mark present"
        loading={savingAction === "batch_present"}
        onClose={() => setConfirmBatch(false)}
        onConfirm={batch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: 18, paddingBottom: 30 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  dateButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  dateCopy: { flex: 1, alignItems: "center" },
  date: { color: colors.ink, fontFamily: font.display, fontSize: 20, textAlign: "center" },
  backToday: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 9, letterSpacing: 1.3, marginTop: 4 },
  disabled: { opacity: 0.3 },
  summary: { borderRadius: 22, padding: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 15, ...shadow },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryNumber: { color: colors.ink, fontFamily: font.display, fontSize: 28, marginTop: 5 },
  summaryDenominator: { color: colors.inkMuted, fontFamily: font.body, fontSize: 14 },
  percentCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  percent: { color: colors.forest, fontFamily: font.medium, fontSize: 13 },
  track: { height: 6, borderRadius: 3, backgroundColor: "#E8E4DB", overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 3, backgroundColor: colors.forest },
  complete: { minHeight: 44, borderRadius: 14, backgroundColor: colors.forestSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completeText: { color: colors.forest, fontFamily: font.medium, fontSize: 13 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 10 },
  count: { color: colors.inkMuted, fontFamily: font.body, fontSize: 12 },
  person: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper, paddingHorizontal: 13, paddingVertical: 10 },
  avatar: { width: 45, height: 45, borderRadius: 15, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.forest, fontFamily: font.medium, fontSize: 14 },
  personCopy: { flex: 1 },
  name: { color: colors.ink, fontFamily: font.medium, fontSize: 15 },
  role: { color: colors.inkMuted, fontFamily: font.body, fontSize: 12, marginTop: 3 },
  unmarked: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 29, borderRadius: 15, borderWidth: 1, borderColor: colors.line },
  unmarkedText: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 11 },
  pressed: { opacity: 0.65 },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 70 },
});
