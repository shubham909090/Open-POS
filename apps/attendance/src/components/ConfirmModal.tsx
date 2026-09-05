import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { ModalShell } from "./ModalShell";
import { Button } from "./ui";
import { colors, font } from "../theme";
import { errorText } from "../utils";

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  danger?: boolean;
};

export function ConfirmModal({ visible, title, body, confirmLabel, onConfirm, onClose, loading, danger }: Props) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) setError(null); }, [visible]);
  const confirm = async () => {
    try {
      setError(null);
      await onConfirm();
    } catch (nextError) {
      setError(errorText(nextError));
    }
  };
  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.icon}><AlertTriangle size={24} color={danger ? colors.rose : colors.amber} /></View>
        <Text style={styles.copy}>{body}</Text>
      </View>
      <View style={styles.actions}>
        <Button tone="secondary" style={styles.action} onPress={onClose}>Cancel</Button>
        <Button tone={danger ? "danger" : "primary"} style={styles.action} loading={loading} onPress={() => { void confirm(); }}>{confirmLabel}</Button>
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.paper, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amberSoft, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, color: colors.ink, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  error: { color: colors.rose, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
});
