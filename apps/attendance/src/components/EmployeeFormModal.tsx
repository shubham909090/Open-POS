import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { AttendanceEmployee, EmployeeInput } from "../types";
import { errorText, toDateKey } from "../utils";
import { colors, font } from "../theme";
import { ModalShell } from "./ModalShell";
import { Button, Field } from "./ui";

type Props = {
  visible: boolean;
  employee?: AttendanceEmployee | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: EmployeeInput) => Promise<void>;
  defaultJoiningDate?: string;
};

export function EmployeeFormModal({ visible, employee, saving, onClose, onSave, defaultJoiningDate }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [joiningDate, setJoiningDate] = useState(defaultJoiningDate ?? toDateKey(new Date()));
  const [salary, setSalary] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(employee?.name ?? "");
    setRole(employee?.role ?? "");
    setJoiningDate(employee?.joiningDate ?? defaultJoiningDate ?? toDateKey(new Date()));
    setSalary(employee ? String(employee.monthlySalaryPaise / 100) : "");
    setError(null);
  }, [visible, employee?.id, defaultJoiningDate]);

  const submit = async () => {
    const rupees = Number(salary.replace(/,/g, ""));
    if (!name.trim() || !role.trim()) return setError("Name and role are required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) || Number.isNaN(new Date(`${joiningDate}T12:00:00`).getTime())) return setError("Use a valid joining date in YYYY-MM-DD format.");
    if (!salary.trim() || !Number.isFinite(rupees) || rupees < 0 || !Number.isSafeInteger(Math.round(rupees * 100))) return setError("Enter a valid monthly salary.");
    try {
      setError(null);
      await onSave({ name: name.trim(), role: role.trim(), joiningDate, monthlySalaryPaise: Math.round(rupees * 100) });
      onClose();
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };

  return (
    <ModalShell visible={visible} title={employee ? "Edit team member" : "Add team member"} subtitle={employee ? "Salary changes apply from the current restaurant month; past payroll stays unchanged." : "Keep employment details accurate for payroll."} onClose={onClose}>
      <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Meera Joshi" testID="employee-name" />
      <Field label="Role" value={role} onChangeText={setRole} autoCapitalize="words" placeholder="e.g. Floor captain" testID="employee-role" />
      <Field label="Joining date" value={joiningDate} onChangeText={setJoiningDate} editable={!employee} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" testID="employee-joining-date" />
      {employee ? <Text style={styles.hint}>Joining date is locked after a team member is created to keep past payroll accurate.</Text> : null}
      <Field label="Monthly salary (₹)" value={salary} onChangeText={setSalary} keyboardType="decimal-pad" placeholder="e.g. 24000" testID="employee-salary" />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <Button loading={saving} onPress={submit} testID="save-employee">{employee ? "Save changes" : "Add to team"}</Button>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.rose, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.inkMuted, fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: -10 },
});
