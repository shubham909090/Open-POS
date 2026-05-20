import { CameraView } from "expo-camera";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";
import { styles } from "../styles/app-styles";

export function PairingScannerModal({
  visible,
  onClose,
  onScannedPayload
}: {
  visible: boolean;
  onClose: () => void;
  onScannedPayload: (data: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.scannerShell}>
        <View style={styles.scannerHeader}>
          <View style={styles.flexText}>
            <Text style={styles.title}>Scan Pairing QR</Text>
            <Text style={styles.muted}>Use the QR shown on the hub PC.</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => onScannedPayload(data)}
        />
      </SafeAreaView>
    </Modal>
  );
}
