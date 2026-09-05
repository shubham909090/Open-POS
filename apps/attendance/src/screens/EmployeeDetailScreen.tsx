import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Archive, CalendarDays, ChevronLeft, ChevronRight, Pencil, Share2, TriangleAlert } from "lucide-react-native";
import type { AttendanceData, AttendanceEmployee, AttendanceInput, EmployeeInput } from "../types";
import { colors, font, shadow } from "../theme";
import { addMonths, buildPayrollCsv, errorText, formatMonth, formatRupees, formatShortDate, initials, pad, payrollFileName, recordFor, statusLabel } from "../utils";
import { AttendanceSheet } from "../components/AttendanceSheet";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmployeeFormModal } from "../components/EmployeeFormModal";
import { ScreenHeader } from "../components/ScreenHeader";
import { Button, EmptyState, SectionLabel, StatusPill } from "../components/ui";

const week = ["S", "M", "T", "W", "T", "F", "S"];

type Props = {
  employee: AttendanceEmployee;
  data: AttendanceData;
  month: string;
  savingAction: string | null;
  onMonthChange: (month: string) => void;
  onBack: () => void;
  onUpdate: (input: EmployeeInput) => Promise<void>;
  onArchive: () => Promise<void>;
  onMark: (input: AttendanceInput) => Promise<void>;
  onClear: (employeeId: string, date: string) => Promise<void>;
};

export function EmployeeDetailScreen({ employee, data, month, savingAction, onMonthChange, onBack, onUpdate, onArchive, onMark, onClear }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const payroll = data.payroll.find((row) => row.employeeId === employee.id && row.month === month);
  const currentMonth = data.asOfDate.slice(0, 7);
  const selectedRecord = selectedDate ? recordFor(data.records, employee.id, selectedDate) : undefined;
  const calendar = useMemo(() => {
    const [yearValue, monthValue] = month.split("-");
    const year = Number(yearValue);
    const numericMonth = Number(monthValue);
    const leading = new Date(year, numericMonth - 1, 1, 12).getDay();
    const count = new Date(year, numericMonth, 0, 12).getDate();
    return [...Array.from({ length: leading }, () => null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);

  const sharePayroll = async () => {
    if (!payroll) return;
    try {
      setSharing(true);
      setShareError(null);
      if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
      const file = new File(Paths.cache, payrollFileName(employee.name, month));
      file.write(`\uFEFF${buildPayrollCsv(employee.name, payroll)}`);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: `${employee.name} · ${formatMonth(month)} payroll` });
    } catch (nextError) {
      setShareError(errorText(nextError));
    } finally {
      setSharing(false);
    }
  };

  const archive = async () => {
    await onArchive();
    setConfirmArchive(false);
    onBack();
  };

  return (
    <View style={styles.fill}>
      <ScreenHeader title={employee.name} eyebrow="Team member" onBack={onBack} right={employee.archivedAt ? undefined :
        <Pressable onPress={() => setEditing(true)} style={styles.headerAction} accessibilityRole="button" accessibilityLabel={`Edit ${employee.name}`}><Pencil size={19} color={colors.ink} /></Pressable>
      } />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(employee.name)}</Text></View>
          <View style={styles.profileCopy}>
            <Text style={styles.role}>{employee.role}</Text>
            <Text style={styles.meta}>Joined {formatShortDate(employee.joiningDate)}</Text>
          </View>
          {employee.archivedAt ? <View style={styles.archivePill}><Archive size={13} color={colors.inkMuted} /><Text style={styles.archiveText}>Archived</Text></View> : null}
        </View>

        <View style={styles.monthNav}>
          <Pressable onPress={() => onMonthChange(addMonths(month, -1))} style={styles.monthButton} accessibilityRole="button" accessibilityLabel="Previous month"><ChevronLeft size={20} color={colors.ink} /></Pressable>
          <Text style={styles.month}>{formatMonth(month)}</Text>
          <Pressable disabled={month >= currentMonth} onPress={() => onMonthChange(addMonths(month, 1))} style={[styles.monthButton, month >= currentMonth && styles.disabled]} accessibilityRole="button" accessibilityLabel="Next month"><ChevronRight size={20} color={colors.ink} /></Pressable>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>{week.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.calendarGrid}>
            {calendar.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const date = `${month}-${pad(day)}`;
              const record = recordFor(data.records, employee.id, date);
              const archivedDate = employee.archivedDate ?? employee.archivedAt?.slice(0, 10);
              const disabled = date > data.asOfDate || date < employee.joiningDate || (!!archivedDate && date > archivedDate);
              const tone = record?.status === "present" ? colors.forest : record?.status === "off" ? colors.amber : record?.status === "half_day" ? colors.lilac : record?.status === "overtime" ? colors.blue : undefined;
              return (
                <Pressable
                  cssInterop={false}
                  key={date}
                  disabled={disabled}
                  onPress={() => setSelectedDate(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatShortDate(date)}, ${record ? statusLabel[record.status] : disabled ? "unavailable" : "unmarked"}`}
                  style={({ pressed }) => [styles.dayCell, pressed && styles.pressed]}
                >
                  <View style={[styles.dayCircle, record && { backgroundColor: tone }, date === data.asOfDate && !record && styles.todayCircle]}>
                    <Text style={[styles.dayText, record && styles.dayTextMarked, disabled && styles.dayDisabled]}>{day}</Text>
                  </View>
                  {record?.status === "overtime" && record.overtimeHours ? <Text style={styles.hours}>{record.overtimeHours}h</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            {(["present", "off", "half_day", "overtime"] as const).map((status) => <StatusPill key={status} status={status} compact />)}
          </View>
        </View>

        <SectionLabel>Payroll</SectionLabel>
        {payroll ? (
          <View style={styles.payrollCard}>
            <View style={styles.payrollHero}>
              <View>
                <Text style={styles.payrollLabel}>{payroll.netPayPaise === null ? "ESTIMATED NET PAY" : "FINAL NET PAY"}</Text>
                <Text style={styles.payrollTotal}>{formatRupees(payroll.netPayPaise ?? payroll.projectedNetPayPaise)}</Text>
              </View>
              <Pressable disabled={sharing} onPress={() => { void sharePayroll(); }} style={[styles.share, sharing && styles.disabled]} accessibilityRole="button" accessibilityLabel="Share payroll CSV" testID="share-payroll"><Share2 size={20} color={colors.forest} /></Pressable>
            </View>
            {payroll.unresolvedDays > 0 ? <View style={styles.unresolved}><TriangleAlert size={16} color={colors.amber} /><Text style={styles.unresolvedText}>{payroll.unresolvedDays} elapsed {payroll.unresolvedDays === 1 ? "day needs" : "days need"} attendance before payroll can be final.</Text></View> : payroll.resolution === "in_progress" ? <Text style={styles.inProgress}>This month is still in progress. Future eligible days: {payroll.futureEligibleDays}.</Text> : null}
            <View style={styles.breakdown}>
              <PayRow label="Base pay" value={formatRupees(payroll.basePayPaise)} />
              <PayRow label={`Deductions · ${payroll.unpaidOffDays} unpaid off`} value={`− ${formatRupees(payroll.deductionsPaise)}`} negative />
              <PayRow label={`Overtime · ${payroll.overtimeHours}h`} value={`+ ${formatRupees(payroll.overtimePayPaise)}`} positive />
            </View>
            <View style={styles.dayStats}>
              <DayStat value={payroll.presentDays} label="Present" />
              <DayStat value={payroll.halfDays} label="Half days" />
              <DayStat value={payroll.offDays} label="Off days" />
              <DayStat value={payroll.markedDays} label="Marked" />
            </View>
            {shareError ? <Text style={styles.shareError} accessibilityRole="alert">{shareError}</Text> : null}
            <Button icon={Share2} tone="secondary" loading={sharing} onPress={() => { void sharePayroll(); }}>Share CSV file</Button>
          </View>
        ) : <EmptyState icon={CalendarDays} title="No payroll for this month" body="Choose a month between this employee’s joining and archive dates." />}

        {!employee.archivedAt ? <Button tone="danger" icon={Archive} onPress={() => setConfirmArchive(true)}>Archive team member</Button> : null}
      </ScrollView>

      <AttendanceSheet employee={employee} date={selectedDate ?? data.asOfDate} record={selectedRecord} visible={!!selectedDate} saving={savingAction === "mark_attendance"} onClose={() => setSelectedDate(null)} onSave={onMark} onClear={onClear} />
      <EmployeeFormModal visible={editing} employee={employee} saving={savingAction === "save_employee"} onClose={() => setEditing(false)} onSave={onUpdate} />
      <ConfirmModal visible={confirmArchive} title="Archive team member?" body={`${employee.name} will leave active rosters. Their attendance and payroll history will be kept.`} confirmLabel="Archive" danger loading={savingAction === "archive_employee"} onClose={() => setConfirmArchive(false)} onConfirm={archive} />
    </View>
  );
}

function PayRow({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return <View style={styles.payRow}><Text style={styles.payLabel}>{label}</Text><Text style={[styles.payValue, positive && styles.positive, negative && styles.negative]}>{value}</Text></View>;
}

function DayStat({ value, label }: { value: number; label: string }) {
  return <View style={styles.dayStat}><Text style={styles.dayStatValue}>{value}</Text><Text style={styles.dayStatLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 42, gap: 18 },
  headerAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  profile: { backgroundColor: colors.forest, borderRadius: 23, padding: 17, flexDirection: "row", alignItems: "center", gap: 13, ...shadow },
  avatar: { width: 56, height: 56, borderRadius: 19, backgroundColor: "#E4ECD9", alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.forest, fontFamily: font.medium, fontSize: 16 },
  profileCopy: { flex: 1 },
  role: { color: colors.paper, fontFamily: font.medium, fontSize: 16 },
  meta: { color: "#BACBC1", fontFamily: font.body, fontSize: 11, marginTop: 5 },
  archivePill: { flexDirection: "row", gap: 5, backgroundColor: colors.paper, borderRadius: 14, paddingHorizontal: 9, height: 28, alignItems: "center" },
  archiveText: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 10 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  month: { color: colors.ink, fontFamily: font.display, fontSize: 22 },
  disabled: { opacity: 0.3 },
  calendarCard: { backgroundColor: colors.paper, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 12, ...shadow },
  weekRow: { flexDirection: "row", marginBottom: 7 },
  weekday: { width: "14.2857%", color: colors.inkMuted, fontFamily: font.medium, fontSize: 10, textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.2857%", minHeight: 51, alignItems: "center" },
  dayCircle: { width: 35, height: 35, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  todayCircle: { borderWidth: 1.5, borderColor: colors.forest },
  dayText: { color: colors.ink, fontFamily: font.medium, fontSize: 12 },
  dayTextMarked: { color: colors.white },
  dayDisabled: { color: "#C5C4BF" },
  hours: { color: colors.blue, fontFamily: font.medium, fontSize: 8, marginTop: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 12, marginTop: 4 },
  payrollCard: { backgroundColor: colors.paper, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 17, gap: 15, ...shadow },
  payrollHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payrollLabel: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 9, letterSpacing: 1.4 },
  payrollTotal: { color: colors.ink, fontFamily: font.display, fontSize: 31, marginTop: 5 },
  share: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  unresolved: { backgroundColor: colors.amberSoft, padding: 12, borderRadius: 14, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  unresolvedText: { flex: 1, color: "#76531E", fontFamily: font.body, fontSize: 11, lineHeight: 17 },
  inProgress: { color: colors.inkMuted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
  breakdown: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
  payRow: { minHeight: 35, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  payLabel: { flex: 1, color: colors.inkMuted, fontFamily: font.body, fontSize: 12 },
  payValue: { color: colors.ink, fontFamily: font.medium, fontSize: 12 },
  positive: { color: colors.forest },
  negative: { color: colors.rose },
  dayStats: { flexDirection: "row", backgroundColor: colors.ivory, borderRadius: 16, paddingVertical: 11 },
  dayStat: { flex: 1, alignItems: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line },
  dayStatValue: { color: colors.ink, fontFamily: font.display, fontSize: 18 },
  dayStatLabel: { color: colors.inkMuted, fontFamily: font.body, fontSize: 8, marginTop: 3 },
  pressed: { opacity: 0.62 },
  shareError: { color: colors.rose, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
});
