import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useCameraPermissions } from "expo-camera";
import {
  getLocalOnlyHubUrlMessage,
  getPairingFailureAlert,
  HubClient,
} from "../lib/hub-client";
import {
  setDeviceToken,
  setHubUrl,
} from "../lib/draft-store";
import {
  normaliseHubUrl,
  parsePairingPayload,
  type PairingPayload,
} from "../lib/mobile-format";

export function useDevicePairing({
  setHubUrlState,
  setDeviceTokenState,
  setDeviceRoleState,
  setDeviceNameState,
  setMessage,
  onDevicePaired,
}: {
  setHubUrlState: (value: string) => void;
  setDeviceTokenState: (value: string) => void;
  setDeviceRoleState: (value: string) => void;
  setDeviceNameState: (value: string) => void;
  setMessage: (value: string) => void;
  onDevicePaired?: () => void;
}) {
  const [hubUrlDraft, setHubUrlDraft] = useState("http://192.168.1.10:3737");
  const [deviceTokenDraft, setDeviceTokenDraft] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingPayload, setPairingPayload] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  function hydrateDrafts(savedHubUrl: string, savedToken: string) {
    setHubUrlDraft(savedHubUrl);
    setDeviceTokenDraft(savedToken);
  }

  function openSetup(hubUrl: string, deviceToken: string) {
    setHubUrlDraft(hubUrl);
    setDeviceTokenDraft(deviceToken);
    setSetupOpen(true);
  }

  async function saveHubConnection() {
    const cleanHubUrl = normaliseHubUrl(hubUrlDraft);
    const cleanToken = deviceTokenDraft.trim();
    await setHubUrl(cleanHubUrl);
    await setDeviceToken(cleanToken);
    setHubUrlState(cleanHubUrl);
    setHubUrlDraft(cleanHubUrl);
    setDeviceTokenState(cleanToken);
    setDeviceTokenDraft(cleanToken);
    setMessage("Connection saved. Checking hub...");
  }

  async function pairDevice() {
    const payload = parsePairingPayload(pairingPayload || pairingCode);
    const pairHubUrl = normaliseHubUrl(payload?.hubUrl ?? hubUrlDraft);
    const pairCode = payload?.code ?? pairingCode.trim();
    if (!pairCode) {
      Alert.alert("Pairing code needed", "Scan the hub QR, paste the QR payload, or type the six-digit code.");
      return;
    }
    const localOnlyMessage = getLocalOnlyHubUrlMessage(pairHubUrl);
    if (localOnlyMessage) {
      Alert.alert("Pairing URL needs hub IP", localOnlyMessage);
      return;
    }
    await exchangePairingCode(pairHubUrl, pairCode, payload?.deviceName || "Captain phone");
  }

  async function openScanner() {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) {
      Alert.alert("Camera permission needed", "Use paste/manual pairing if camera access is unavailable.");
      return;
    }
    scanLockRef.current = false;
    setScannerOpen(true);
  }

  async function handleScannedPayload(data: string) {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScannerOpen(false);
    const payload = parsePairingPayload(data);
    if (!payload) {
      Alert.alert("Unsupported QR", "This is not a Gaurav POS pairing QR.");
      return;
    }
    setPairingPayload(data);
    setPairingCode(payload.code);
    setHubUrlDraft(normaliseHubUrl(payload.hubUrl));
    setFormRevision((value) => value + 1);
    Alert.alert("Pair this phone?", `${payload.deviceName ?? "Captain phone"} as ${payload.role ?? "captain"}`, [
      { text: "Later", style: "cancel" },
      { text: "Pair Now", onPress: () => void pairDeviceFromPayload(payload) },
    ]);
  }

  async function pairDeviceFromPayload(payload: PairingPayload) {
    const pairHubUrl = normaliseHubUrl(payload.hubUrl);
    const localOnlyMessage = getLocalOnlyHubUrlMessage(pairHubUrl);
    if (localOnlyMessage) {
      Alert.alert("Pairing URL needs hub IP", localOnlyMessage);
      return;
    }
    await exchangePairingCode(pairHubUrl, payload.code, payload.deviceName || "Captain phone");
  }

  async function exchangePairingCode(pairHubUrl: string, code: string, deviceName: string) {
    try {
      const pairClient = new HubClient(pairHubUrl, deviceTokenDraft.trim());
      const result = await pairClient.exchangePairingCode({ code, deviceName });
      await setHubUrl(pairHubUrl);
      await setDeviceToken(result.token);
      setHubUrlState(pairHubUrl);
      setHubUrlDraft(pairHubUrl);
      setDeviceTokenState(result.token);
      setDeviceTokenDraft(result.token);
      setDeviceRoleState(result.role);
      setDeviceNameState(result.deviceName);
      onDevicePaired?.();
      setPairingCode("");
      setPairingPayload("");
      setSetupOpen(false);
      setMessage(`${result.deviceName} is paired and ready.`);
      Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
    } catch (error) {
      const alert = getPairingFailureAlert(pairHubUrl, error);
      Alert.alert(alert.title, alert.message);
    }
  }

  return {
    hubUrlDraft,
    setHubUrlDraft,
    deviceTokenDraft,
    setDeviceTokenDraft,
    pairingCode,
    setPairingCode,
    pairingPayload,
    setPairingPayload,
    formRevision,
    scannerOpen,
    setScannerOpen,
    setupOpen,
    setSetupOpen,
    hydrateDrafts,
    openSetup,
    saveHubConnection,
    pairDevice,
    openScanner,
    handleScannedPayload,
  };
}
