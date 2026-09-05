import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock3, LogOut, ShieldCheck, Sparkles } from "lucide-react-native";
import type { AttendancePolicy, AttendancePolicyInput, AttendanceRestaurant } from "../types";
import { colors, font, shadow } from "../theme";
import { errorText, formatMonth } from "../utils";
import { BrandMark } from "../components/BrandMark";
import { Button, Field, SectionLabel } from "../components/ui";
import { ConfirmModal } from "../components/ConfirmModal";

type Props = {
  restaurant: AttendanceRestaurant;
  policy: AttendancePolicy;
  month: string;
  savingAction: string | null;
  onUpdatePolicy: (policy: AttendancePolicyInput) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function SettingsScreen({ restaurant, policy, month, savingAction, onUpdatePolicy, onSignOut }: Props) {
  const [paidOffDays, setPaidOffDays] = useState(String(policy.paidOffDays));
  const [standardHours, setStandardHours] = useState(String(policy.standardHours));
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(String(policy.overtimeMultiplier));
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previousMonth = useRef(month);

  useEffect(() => {
    const monthChanged = previousMonth.current !== month;
    const valuesMatchPolicy = Number(paidOffDays) === policy.paidOffDays
      && Number(standardHours) === policy.standardHours
      && Number(overtimeMultiplier) === policy.overtimeMultiplier;
    if (monthChanged || !dirty) {
      setPaidOffDays(String(policy.paidOffDays));
      setStandardHours(String(policy.standardHours));
      setOvertimeMultiplier(String(policy.overtimeMultiplier));
      setDirty(false);
      setError(null);
    } else if (valuesMatchPolicy) {
      setDirty(false);
    }
    previousMonth.current = month;
  }, [month, policy.paidOffDays, policy.standardHours, policy.overtimeMultiplier, dirty, paidOffDays, standardHours, overtimeMultiplier]);

  const save = async () => {
    const next: AttendancePolicyInput = { paidOffDays: Number(paidOffDays), standardHours: Number(standardHours), overtimeMultiplier: Number(overtimeMultiplier) };
    if (!Number.isInteger(next.paidOffDays) || next.paidOffDays < 0 || next.paidOffDays > 31) return setError("Paid off days must be a whole number from 0 to 31.");
    if (!Number.isFinite(next.standardHours) || next.standardHours <= 0 || next.standardHours > 24) return setError("Standard hours must be between 0 and 24.");
    if (!Number.isFinite(next.overtimeMultiplier) || next.overtimeMultiplier < 1 || next.overtimeMultiplier > 5) return setError("Overtime multiplier must be between 1 and 5.");
    try {
      setError(null);
      await onUpdatePolicy(next);
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <BrandMark compact />
          <View style={styles.rule} />
          <Text style={styles.restaurant}>{restaurant.name}</Text>
          <Text style={styles.timezone}>{restaurant.timezone}</Text>
          <View style={styles.secure}><ShieldCheck size={15} color={colors.forest} /><Text style={styles.secureText}>Securely paired</Text></View>
        </View>

        <SectionLabel>Attendance policy · {formatMonth(month)}</SectionLabel>
        <View style={styles.policyCard}>
          <View style={styles.policyHeading}>
            <View style={styles.policyIcon}><Clock3 size={21} color={colors.forest} /></View>
            <View style={styles.policyCopy}>
              <Text style={styles.policyTitle}>Pay rules</Text>
              <Text style={styles.policySubtitle}>Changes apply to {formatMonth(month)} and are preserved with that month’s payroll.</Text>
            </View>
          </View>
          <Field label="Paid off days per month" value={paidOffDays} onChangeText={(value) => { setPaidOffDays(value); setDirty(true); setError(null); }} keyboardType="number-pad" testID="paid-off-days" />
          <Field label="Standard hours per day" value={standardHours} onChangeText={(value) => { setStandardHours(value); setDirty(true); setError(null); }} keyboardType="decimal-pad" testID="standard-hours" />
          <Field label="Overtime multiplier" value={overtimeMultiplier} onChangeText={(value) => { setOvertimeMultiplier(value); setDirty(true); setError(null); }} keyboardType="decimal-pad" testID="overtime-multiplier" />
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Button icon={Sparkles} loading={savingAction === "save_policy"} onPress={save} testID="save-policy">Save policy</Button>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>How payroll works</Text>
          <Text style={styles.noteBody}>Monthly salary is adjusted for unpaid off days. Half days count as half a present day. Overtime uses the standard hourly rate multiplied by your overtime setting.</Text>
        </View>

        <Button tone="danger" icon={LogOut} onPress={() => setConfirmSignOut(true)}>Sign out this device</Button>
      </ScrollView>
      <ConfirmModal visible={confirmSignOut} title="Sign out this device?" body="You’ll need a new secure pairing code to open attendance again." confirmLabel="Sign out" danger loading={savingAction === "sign_out"} onClose={() => setConfirmSignOut(false)} onConfirm={onSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  identity: { backgroundColor: colors.paper, borderRadius: 23, padding: 18, borderWidth: 1, borderColor: colors.line, ...shadow },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 17 },
  restaurant: { color: colors.ink, fontFamily: font.display, fontSize: 26 },
  timezone: { color: colors.inkMuted, fontFamily: font.body, fontSize: 12, marginTop: 3 },
  secure: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.forestSoft, borderRadius: 14, height: 28, paddingHorizontal: 9, marginTop: 14 },
  secureText: { color: colors.forest, fontFamily: font.medium, fontSize: 10 },
  policyCard: { backgroundColor: colors.paper, borderRadius: 23, padding: 18, borderWidth: 1, borderColor: colors.line, gap: 17, ...shadow },
  policyHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  policyIcon: { width: 44, height: 44, borderRadius: 17, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  policyCopy: { flex: 1 },
  policyTitle: { color: colors.ink, fontFamily: font.display, fontSize: 21 },
  policySubtitle: { color: colors.inkMuted, fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 2 },
  error: { color: colors.rose, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  note: { borderLeftWidth: 3, borderLeftColor: colors.amber, paddingHorizontal: 14, paddingVertical: 6 },
  noteTitle: { color: colors.ink, fontFamily: font.medium, fontSize: 13 },
  noteBody: { color: colors.inkMuted, fontFamily: font.body, fontSize: 11, lineHeight: 18, marginTop: 5 },
});
