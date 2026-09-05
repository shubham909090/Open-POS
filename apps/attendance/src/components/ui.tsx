import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AlertCircle, CloudOff, X } from "lucide-react-native";
import { colors, font, shadow } from "../theme";
import type { AttendanceStatus } from "../types";
import { statusLabel } from "../utils";

type ButtonProps = PressableProps & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger" | "quiet";
  loading?: boolean;
  icon?: LucideIcon;
};

export function Button({ children, tone = "primary", loading = false, icon: Icon, disabled, style, ...props }: ButtonProps) {
  return (
    <Pressable
      cssInterop={false}
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, styles[`button_${tone}`], pressed && styles.pressed, (disabled || loading) && styles.disabled, typeof style === "function" ? style({ pressed }) : style]}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={tone === "primary" ? colors.white : colors.forest} /> : Icon ? <Icon size={18} color={tone === "primary" ? colors.white : tone === "danger" ? colors.rose : colors.forest} /> : null}
      <Text style={[styles.buttonText, styles[`buttonText_${tone}`]]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#9A9F99"
        style={[styles.input, props.editable === false && styles.inputDisabled, !!error && styles.inputError, props.multiline && styles.multiline, style]}
        accessibilityLabel={label}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function StatusPill({ status, compact = false }: { status: AttendanceStatus; compact?: boolean }) {
  const tone = status === "present" ? "green" : status === "off" ? "amber" : status === "half_day" ? "lilac" : "blue";
  return (
    <View style={[styles.pill, styles[`pill_${tone}`], compact && styles.pillCompact]}>
      <View style={[styles.dot, styles[`dot_${tone}`]]} />
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{statusLabel[status]}</Text>
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={25} color={colors.forest} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

export function OfflineBanner() {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <CloudOff size={15} color={colors.paper} />
      <Text style={styles.offlineText}>Offline — changes may not save</Text>
    </View>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <AlertCircle size={18} color={colors.rose} />
      <Text style={styles.errorBannerText}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss error">
        <X size={18} color={colors.rose} />
      </Pressable>
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { minHeight: 50, paddingHorizontal: 18, borderRadius: 16, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  button_primary: { backgroundColor: colors.forest, borderColor: colors.forest },
  button_secondary: { backgroundColor: colors.paper, borderColor: colors.line },
  button_danger: { backgroundColor: colors.roseSoft, borderColor: "#E7C7C3" },
  button_quiet: { backgroundColor: "transparent", borderColor: "transparent", minHeight: 42 },
  buttonText: { fontFamily: font.medium, fontSize: 15 },
  buttonText_primary: { color: colors.white },
  buttonText_secondary: { color: colors.forest },
  buttonText_danger: { color: colors.rose },
  buttonText_quiet: { color: colors.forest },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.48 },
  fieldWrap: { gap: 7 },
  fieldLabel: { color: colors.ink, fontFamily: font.medium, fontSize: 13 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 15, color: colors.ink, fontFamily: font.body, fontSize: 16 },
  inputError: { borderColor: colors.rose },
  inputDisabled: { color: colors.inkMuted, backgroundColor: "#ECE9E1" },
  multiline: { minHeight: 90, paddingTop: 14, textAlignVertical: "top" },
  fieldError: { color: colors.rose, fontFamily: font.body, fontSize: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingHorizontal: 10, height: 30, borderRadius: 15 },
  pillCompact: { height: 26, paddingHorizontal: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontFamily: font.medium, fontSize: 12 },
  pill_green: { backgroundColor: colors.forestSoft }, dot_green: { backgroundColor: colors.forest }, pillText_green: { color: colors.forest },
  pill_amber: { backgroundColor: colors.amberSoft }, dot_amber: { backgroundColor: colors.amber }, pillText_amber: { color: "#7B551C" },
  pill_lilac: { backgroundColor: colors.lilacSoft }, dot_lilac: { backgroundColor: colors.lilac }, pillText_lilac: { color: "#5F4C79" },
  pill_blue: { backgroundColor: colors.blueSoft }, dot_blue: { backgroundColor: colors.blue }, pillText_blue: { color: "#3F6377" },
  empty: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 42, gap: 10 },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontFamily: font.display, fontSize: 22, textAlign: "center" },
  emptyBody: { color: colors.inkMuted, fontFamily: font.body, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 290, marginBottom: 8 },
  offline: { minHeight: 32, backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  offlineText: { color: colors.paper, fontFamily: font.medium, fontSize: 12 },
  errorBanner: { marginHorizontal: 18, marginTop: 10, padding: 13, borderRadius: 14, backgroundColor: colors.roseSoft, flexDirection: "row", alignItems: "center", gap: 10 },
  errorBannerText: { flex: 1, color: "#703D38", fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  sectionLabel: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
});
