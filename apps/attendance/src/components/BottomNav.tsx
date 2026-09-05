import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarCheck2, Settings, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "../theme";

export type MainTab = "today" | "team" | "settings";

const items = [
  { key: "today", label: "Today", Icon: CalendarCheck2 },
  { key: "team", label: "Team", Icon: Users },
  { key: "settings", label: "Settings", Icon: Settings },
] as const;

export function BottomNav({ value, onChange }: { value: MainTab; onChange: (tab: MainTab) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map(({ key, label, Icon }) => {
        const active = key === value;
        return (
          <Pressable
            cssInterop={false}
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label} tab`}
            testID={`tab-${key}`}
            style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}
          >
            <Icon size={21} strokeWidth={active ? 2.4 : 1.8} color={active ? colors.forest : colors.inkMuted} />
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: "row", paddingTop: 8, paddingHorizontal: 12 },
  item: { flex: 1, minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 3 },
  itemActive: { backgroundColor: colors.forestSoft },
  label: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 11 },
  labelActive: { color: colors.forest },
  pressed: { opacity: 0.65 },
});
