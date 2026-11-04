import { CameraView } from "expo-camera";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Pressable } from "./pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, styles } from "../styles/app-styles";
import { X } from "lucide-react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";

export function PairingScannerModal({
  visible,
  onClose,
  onScannedPayload
}: {
  visible: boolean;
  onClose: () => void;
  onScannedPayload: (data: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType={reducedMotion ? "none" : "slide"} onRequestClose={onClose}>
      <SafeAreaView style={styles.scannerShell}>
        <View style={styles.scannerHeader}>
          <View style={styles.flexText}>
            <Text style={styles.title}>Scan pairing QR</Text>
            <Text style={styles.muted}>Use the QR shown on the hub PC.</Text>
          </View>
          <Pressable accessibilityLabel="Close pairing scanner" style={styles.iconButton} onPress={onClose}>
            <X size={20} color={palette.muted} strokeWidth={1.7} />
          </Pressable>
        </View>
        <View style={styles.camera}>
          <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => onScannedPayload(data)} />
          <View style={styles.scannerGuide} pointerEvents="none">
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Keep the entire hub QR inside the frame.</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
