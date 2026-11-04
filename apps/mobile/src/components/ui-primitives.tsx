import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Pressable } from "./pressable";
import { palette, tabularFigures } from "../styles/app-style-tokens";

export function Button({ label, onPress, tone = "primary", disabled, busy, icon, style, accessibilityLabel }: {
  label: string; onPress: () => void; tone?: "primary" | "kitchen" | "money" | "secondary" | "quiet" | "danger";
  disabled?: boolean; busy?: boolean; icon?: ReactNode; style?: ViewStyle; accessibilityLabel?: string;
}) {
  const filled = tone === "primary" || tone === "kitchen" || tone === "money";
  const labelColor = disabled || busy ? palette.muted : filled ? palette.inverseText : tone === "danger" ? palette.red : palette.ink;
  // Android dropped the caption after a disabled/background transition; remount the native control.
  return <Pressable key={disabled || busy ? "disabled" : tone} accessibilityLabel={accessibilityLabel ?? label} disabled={disabled || busy} onPress={onPress} style={[ui.button, ui[tone], (disabled || busy) && ui.disabled, style]}>
    {busy ? <ActivityIndicator size="small" color={filled ? palette.inverseText : palette.green} /> : icon}
    <Text style={[ui.buttonLabel, { color: labelColor }]}>{label}</Text>
  </Pressable>;
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  return <View style={ui.field}>
    <Text style={ui.label}>{label}</Text>
    <TextInput {...input} accessibilityLabel={input.accessibilityLabel ?? label} placeholderTextColor={palette.muted} style={[ui.input, error && ui.invalid, input.style]} />
    {error ? <Text accessibilityLiveRegion="polite" style={ui.dangerLabel}>{error}</Text> : null}
  </View>;
}

export function Section({ title, trailing, children }: { title?: string; trailing?: ReactNode; children: ReactNode }) {
  return <View style={ui.section}>
    {title || trailing ? <View style={ui.sectionHeader}>{title ? <Text style={ui.sectionTitle}>{title}</Text> : null}{trailing}</View> : null}
    {children}
  </View>;
}

export const ui = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  disabled: { backgroundColor: palette.wash, borderWidth: 1, borderColor: palette.line },
  primary: { backgroundColor: palette.chrome },
  kitchen: { backgroundColor: palette.green },
  /** Settles money: the only green action. */
  money: { backgroundColor: palette.success },
  secondary: { backgroundColor: palette.softWash, borderWidth: 1, borderColor: palette.lineStrong },
  quiet: { backgroundColor: "transparent" },
  danger: { backgroundColor: palette.redSoft, borderWidth: 1, borderColor: palette.redLine },
  // Android measures weight "600" with the regular face but draws it heavier, clipping the last word
  // ("Scan pairing QR" rendered as "Scan pairing"). "700" measures and draws with the same face.
  buttonLabel: { flexShrink: 1, textAlign: "center", color: palette.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  dangerLabel: { color: palette.red, fontSize: 13, lineHeight: 20 },
  field: { gap: 8 },
  label: { color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 6, backgroundColor: palette.paper, color: palette.ink, fontSize: 15, paddingHorizontal: 12, paddingVertical: 12 },
  invalid: { borderColor: palette.red },
  section: { gap: 12, padding: 16, borderRadius: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  amount: { fontVariant: tabularFigures, textAlign: "right" },
});
