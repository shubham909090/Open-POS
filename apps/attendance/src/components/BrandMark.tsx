import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "../theme";

type Props = { compact?: boolean; light?: boolean };

export function BrandMark({ compact = false, light = false }: Props) {
  return (
    <View style={styles.row} accessibilityLabel="Sky Attendance">
      <LinearGradient colors={["#DCA44A", "#B86E28"]} style={[styles.sun, compact && styles.sunCompact]}>
        <Text style={[styles.sunText, compact && styles.sunTextCompact]}>S</Text>
      </LinearGradient>
      <View>
        <Text style={[styles.sky, light && styles.light, compact && styles.skyCompact]}>Sky</Text>
        <Text style={[styles.attendance, light && styles.lightMuted]}>ATTENDANCE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  sun: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  sunCompact: { width: 38, height: 38, borderRadius: 19 },
  sunText: { color: colors.white, fontFamily: font.display, fontSize: 26, lineHeight: 31 },
  sunTextCompact: { fontSize: 21, lineHeight: 25 },
  sky: { color: colors.ink, fontFamily: font.display, fontSize: 24, lineHeight: 25 },
  skyCompact: { fontSize: 21, lineHeight: 22 },
  attendance: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 9, letterSpacing: 2.1, marginTop: 2 },
  light: { color: colors.paper },
  lightMuted: { color: "#BACBC1" },
});
