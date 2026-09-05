import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { colors, font } from "../theme";

export function ScreenHeader({ eyebrow, title, right, onBack }: { eyebrow?: string; title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  copy: { flex: 1 },
  eyebrow: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 2 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 28, lineHeight: 33 },
});
