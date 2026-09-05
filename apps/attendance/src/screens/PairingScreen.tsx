import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { KeyRound, ShieldCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui";
import { colors, font, shadow } from "../theme";
import { errorText } from "../utils";

export function PairingScreen({ onPair, loading, initialError }: { onPair: (code: string) => Promise<void>; loading: boolean; initialError?: string | null }) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const normalized = code.trim().toUpperCase();

  const submit = async () => {
    if (normalized.length < 4) return setError("Enter the full pairing code from your Sky dashboard.");
    try {
      setError(null);
      await onPair(normalized);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };

  return (
    <LinearGradient colors={["#173F32", "#102C23", "#0D241D"]} style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 }]}>
          <BrandMark light />
          <View style={styles.intro}>
            <Text style={styles.kicker}>STAFF, PERFECTLY IN STEP</Text>
            <Text style={styles.title}>A calmer start{`\n`}to every service.</Text>
            <Text style={styles.subtitle}>Pair this trusted device to record attendance, manage your team and settle payroll.</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.icon}><KeyRound size={21} color={colors.forest} /></View>
              <View style={styles.cardHeadingCopy}>
                <Text style={styles.cardTitle}>Pair this device</Text>
                <Text style={styles.cardSubtitle}>Enter the code shown in your admin dashboard.</Text>
              </View>
            </View>
            <Text style={styles.label}>SECURE PAIRING CODE</Text>
            <TextInput
              value={code}
              onChangeText={(value) => { setCode(value.toUpperCase()); setError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              placeholder="Paste code"
              placeholderTextColor="#99A19B"
              style={styles.input}
              accessibilityLabel="Secure pairing code"
              testID="pairing-code"
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            <Button onPress={submit} loading={loading} disabled={!normalized} testID="pair-device">Pair securely</Button>
            <View style={styles.security}>
              <ShieldCheck size={16} color={colors.inkMuted} />
              <Text style={styles.securityText}>The code is exchanged once and stored securely on this device.</Text>
            </View>
          </View>
          <Text style={styles.foot}>Built for the quiet precision behind great hospitality.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22 },
  intro: { marginTop: 54, marginBottom: 30 },
  kicker: { color: "#D8B979", fontFamily: font.medium, fontSize: 10, letterSpacing: 2.2, marginBottom: 13 },
  title: { color: colors.paper, fontFamily: font.display, fontSize: 42, lineHeight: 47, letterSpacing: -0.7 },
  subtitle: { color: "#BACBC1", fontFamily: font.body, fontSize: 15, lineHeight: 23, marginTop: 16, maxWidth: 330 },
  card: { backgroundColor: colors.ivory, borderRadius: 26, padding: 20, gap: 15, ...shadow },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 1 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  cardHeadingCopy: { flex: 1 },
  cardTitle: { color: colors.ink, fontFamily: font.display, fontSize: 22 },
  cardSubtitle: { color: colors.inkMuted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  label: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 10, letterSpacing: 1.5, marginTop: 4 },
  input: { minHeight: 62, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper, color: colors.ink, fontFamily: font.medium, fontSize: 16, letterSpacing: 0.8, paddingHorizontal: 16 },
  error: { color: colors.rose, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  security: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 3 },
  securityText: { flex: 1, color: colors.inkMuted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
  foot: { color: "#81968A", fontFamily: font.body, fontSize: 11, textAlign: "center", marginTop: 22 },
});
