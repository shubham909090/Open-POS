import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BriefcaseBusiness, Clock3, Coffee, TimerReset } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { AttendanceEmployee, AttendanceInput, AttendanceRecord, AttendanceStatus } from "../types";
import { colors, font } from "../theme";
import { errorText, formatShortDate, statusLabel } from "../utils";
import { ModalShell } from "./ModalShell";
import { Button, Field } from "./ui";

const choices = [
  { value: "present", Icon: BriefcaseBusiness, color: colors.forest, soft: colors.forestSoft },
  { value: "off", Icon: Coffee, color: colors.amber, soft: colors.amberSoft },
  { value: "half_day", Icon: TimerReset, color: colors.lilac, soft: colors.lilacSoft },
  { value: "overtime", Icon: Clock3, color: colors.blue, soft: colors.blueSoft },
] as const;

type Props = {
  employee: AttendanceEmployee | null;
  date: string;
  record?: AttendanceRecord;
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: AttendanceInput) => Promise<void>;
  onClear: (employeeId: string, date: string) => Promise<void>;
};

export function AttendanceSheet({ employee, date, record, visible, saving, onClose, onSave, onClear }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(record?.status ?? "present");
  const [hours, setHours] = useState(record?.overtimeHours ? String(record.overtimeHours) : "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStatus(record?.status ?? "present");
    setHours(record?.overtimeHours ? String(record.overtimeHours) : "");
    setNotes(record?.notes ?? "");
    setError(null);
  }, [visible, employee?.id, date]);

  if (!employee) return null;

  const submit = async () => {
    const overtimeHours = Number(hours);
    if (status === "overtime" && (!Number.isFinite(overtimeHours) || overtimeHours <= 0 || overtimeHours > 24)) {
      setError("Enter overtime hours between 0 and 24.");
      return;
    }
    try {
      setError(null);
      await onSave({ employeeId: employee.id, date, status, ...(status === "overtime" ? { overtimeHours } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };

  const clear = async () => {
    try {
      setError(null);
      await onClear(employee.id, date);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };

  return (
    <ModalShell visible={visible} title={employee.name} subtitle={`${employee.role} · ${formatShortDate(date)}`} onClose={onClose}>
      <View style={styles.grid}>
        {choices.map(({ value, Icon, color, soft }) => {
          const selected = value === status;
          return (
            <Pressable
              cssInterop={false}
              key={value}
              onPress={() => { setStatus(value); Haptics.selectionAsync(); }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Mark ${statusLabel[value]}`}
              testID={`status-${value}`}
              style={({ pressed }) => [styles.choice, selected && { borderColor: color, backgroundColor: soft }, pressed && styles.pressed]}
            >
              <View style={[styles.choiceIcon, { backgroundColor: soft }]}><Icon size={21} color={color} /></View>
              <Text style={[styles.choiceText, selected && { color }]}>{statusLabel[value]}</Text>
            </Pressable>
          );
        })}
      </View>
      {status === "overtime" ? <Field label="Overtime hours" value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="e.g. 2.5" testID="overtime-hours" /> : null}
      <Field label="Note (optional)" value={notes} onChangeText={setNotes} multiline maxLength={240} placeholder="Add a useful detail for payroll" testID="attendance-note" />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <Button loading={saving} onPress={submit} testID="save-attendance">Save attendance</Button>
      {record ? <Button tone="quiet" disabled={saving} onPress={clear} testID="clear-attendance">Clear this day</Button> : null}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: { width: "48%", minHeight: 96, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.line, borderRadius: 18, padding: 13, justifyContent: "space-between" },
  choiceIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  choiceText: { color: colors.ink, fontFamily: font.medium, fontSize: 14 },
  pressed: { opacity: 0.72 },
  error: { color: colors.rose, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
});
