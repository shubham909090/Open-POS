import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "../theme";

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function ModalShell({ visible, title, subtitle, onClose, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close dialog" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: { maxHeight: "91%", backgroundColor: colors.ivory, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#C7C1B7", alignSelf: "center", marginTop: 10 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 17, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headingCopy: { flex: 1, paddingRight: 16 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 25, lineHeight: 30 },
  subtitle: { color: colors.inkMuted, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: 3 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
