import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { OrderItemInput } from "@gaurav-pos/shared";
import { HubClient, type HubBootstrap } from "./lib/hub-client";
import { clearDraft, getDeviceToken, getHubUrl, loadDraft, saveDraft, setDeviceToken, setHubUrl } from "./lib/draft-store";

type ConnectionState = "checking" | "online" | "offline";

export default function App() {
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("dev-admin-token");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingPayload, setPairingPayload] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanLockRef = useRef(false);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [captainId, setCaptainId] = useState("waiter-1");
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const client = useMemo(() => new HubClient(hubUrl, deviceToken), [deviceToken, hubUrl]);
  const selectedTable = bootstrap?.tables.find((table) => table.id === selectedTableId) ?? null;
  const visibleMenu = (bootstrap?.menuItems ?? []).filter((item) => {
    if (!item.active) return false;
    const query = menuSearch.trim().toLowerCase();
    return !query || `${item.name} ${item.production_unit_name}`.toLowerCase().includes(query);
  });
  const ticketTotal = items.reduce((total, item) => {
    const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
    const modifierTotal = (item.modifiers ?? []).reduce((sum, modifier) => {
      const group = bootstrap?.modifierGroups.find((entry) => entry.id === modifier.groupId);
      const option = group?.options.find((entry) => entry.id === modifier.optionId);
      return sum + (option?.price_delta_paise ?? 0);
    }, 0);
    return total + ((menuItem?.price_paise ?? 0) + modifierTotal) * item.quantity;
  }, 0);

  useEffect(() => {
    void getHubUrl().then((url) => {
      setHubUrlState(url);
    });
    void getDeviceToken().then((token) => {
      setDeviceTokenState(token);
    });
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(interval);
  }, [client]);

  async function refresh() {
    setConnection("checking");
    const isOnline = await client.health();
    setConnection(isOnline ? "online" : "offline");
    if (!isOnline) return;
    setBootstrap(await client.bootstrap());
  }

  async function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    const draft = await loadDraft(tableId);
    if (draft) {
      setCaptainId(draft.captainId);
      setPax(String(draft.pax));
      setItems(draft.items);
      return;
    }

    if (connection === "online") {
      const order = await client.tableOrder(tableId);
      setItems(
        (order?.items ?? [])
          .filter((item) => item.status !== "cancelled")
          .map((item) => ({
            menuItemId: item.menu_item_id,
            quantity: item.quantity,
            notes: item.notes
              ? item.notes
              : undefined,
            modifiers: item.modifiers_json ? JSON.parse(item.modifiers_json) : undefined
          }))
      );
      if (order?.order?.pax) setPax(String(order.order.pax));
    } else {
      setItems([]);
    }
  }

  async function persistDraft(nextItems = items) {
    if (!selectedTableId) return;
    await saveDraft({
      tableId: selectedTableId,
      captainId,
      pax: Number(pax || 1),
      items: nextItems,
      updatedAt: new Date().toISOString()
    });
  }

  function addItem(menuItemId: string) {
    const current = items.find((item) => item.menuItemId === menuItemId && !item.notes);
    const next = current
      ? items.map((item) =>
          item.menuItemId === menuItemId && !item.notes ? { ...item, quantity: item.quantity + 1 } : item
        )
      : [...items, { menuItemId, quantity: 1 }];
    setItems(next);
    void persistDraft(next);
  }

  function changeQty(index: number, delta: number) {
    const next = items
      .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
      .filter((item) => item.quantity > 0);
    setItems(next);
    void persistDraft(next);
  }

  function changeNotes(index: number, notes: string) {
    const next = items.map((item, itemIndex) => (itemIndex === index ? { ...item, notes } : item));
    setItems(next);
    void persistDraft(next);
  }

  function toggleModifier(index: number, groupId: string, optionId: string, single: boolean) {
    const next = items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const current = item.modifiers ?? [];
      const selected = current.some((modifier) => modifier.groupId === groupId && modifier.optionId === optionId);
      const without = current.filter((modifier) => (single ? modifier.groupId !== groupId : modifier.optionId !== optionId));
      return { ...item, modifiers: selected ? without : [...without, { groupId, optionId }] };
    });
    setItems(next);
    void persistDraft(next);
  }

  function applyNoteTemplate(index: number, note: string) {
    const current = items[index]?.notes?.trim();
    changeNotes(index, [current, note].filter(Boolean).join(" | "));
  }

  function orderSummary() {
    return items
      .map((item) => {
        const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
        const note = item.notes?.trim() ? ` (${item.notes.trim()})` : "";
        return `${item.quantity} x ${menuItem?.name ?? item.menuItemId}${note}`;
      })
      .join("\n");
  }

  function confirmSendKot(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert("Review KOT", orderSummary(), [
        { text: "Go Back", style: "cancel", onPress: () => resolve(false) },
        { text: "Send KOT", onPress: () => resolve(true) }
      ]);
    });
  }

  async function submitOrder() {
    if (!selectedTableId || items.length === 0) return;
    if (connection !== "online") {
      await persistDraft();
      Alert.alert("Saved locally", "Reconnect to the hub to send KOT.");
      return;
    }

    if (!(await confirmSendKot())) return;

    await client.submitOrder({
      tableId: selectedTableId,
      captainId,
      pax: Number(pax || 1),
      orderType: "dine_in",
      items
    });
    await clearDraft(selectedTableId);
    await refresh();
    Alert.alert("KOT sent", "Kitchen and cashier are updated.");
  }

  async function saveHub() {
    await setHubUrl(hubUrl);
    await setDeviceToken(deviceToken);
    await refresh();
  }

  async function pairDevice() {
    const payload = parsePairingPayload(pairingPayload || pairingCode);
    const pairHubUrl = payload?.hubUrl ?? hubUrl;
    const pairCode = payload?.code ?? pairingCode.trim();
    if (!pairCode) {
      Alert.alert("Pairing code needed", "Scan the hub QR, paste the QR payload, or type the six-digit code.");
      return;
    }
    if (payload?.hubUrl && payload.hubUrl !== hubUrl) {
      setHubUrlState(payload.hubUrl);
      await setHubUrl(payload.hubUrl);
    }
    const pairClient = new HubClient(pairHubUrl, deviceToken);
    const result = await pairClient.exchangePairingCode({
      code: pairCode,
      deviceName: captainId || payload?.deviceName || "Android waiter"
    });
    setDeviceTokenState(result.token);
    await setDeviceToken(result.token);
    setPairingCode("");
    setPairingPayload("");
    await refresh();
    Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
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
    if (payload.hubUrl) setHubUrlState(payload.hubUrl);
    Alert.alert("Pair this device?", `${payload.deviceName} as ${payload.role}`, [
      { text: "Later", style: "cancel" },
      { text: "Pair Now", onPress: () => void pairDeviceFromPayload(payload) }
    ]);
  }

  async function pairDeviceFromPayload(payload: PairingPayload) {
    const pairClient = new HubClient(payload.hubUrl, deviceToken);
    const result = await pairClient.exchangePairingCode({
      code: payload.code,
      deviceName: captainId || payload.deviceName || "Android waiter"
    });
    setHubUrlState(payload.hubUrl);
    setDeviceTokenState(result.token);
    await setHubUrl(payload.hubUrl);
    await setDeviceToken(result.token);
    setPairingCode("");
    setPairingPayload("");
    await refresh();
    Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Waiter Station</Text>
          <Text style={styles.muted}>{selectedTable ? `Table ${selectedTable.name}` : "Choose table, punch items, send KOT"}</Text>
        </View>
        <View style={styles.statusPill}>
          {connection === "checking" ? <ActivityIndicator size="small" /> : <View style={[styles.dot, styles[connection]]} />}
          <Text style={styles.statusText}>{connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Checking"}</Text>
        </View>
      </View>

      <View style={styles.connectionCard}>
        <View style={styles.hubRow}>
          <TextInput value={hubUrl} onChangeText={setHubUrlState} style={styles.hubInput} autoCapitalize="none" />
          <TextInput
            value={deviceToken}
            onChangeText={setDeviceTokenState}
            style={styles.tokenInput}
            autoCapitalize="none"
            secureTextEntry
          />
          <Pressable style={styles.primaryButton} onPress={saveHub}>
            <Text style={styles.primaryButtonText}>Set</Text>
          </Pressable>
        </View>
        <View style={styles.hubRow}>
          <TextInput value={pairingCode} onChangeText={setPairingCode} style={styles.hubInput} placeholder="Pairing code" />
          <Pressable style={styles.secondaryButton} onPress={() => void openScanner()}>
            <Text style={styles.secondaryButtonText}>Scan</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void pairDevice()}>
            <Text style={styles.primaryButtonText}>Pair</Text>
          </Pressable>
        </View>
        <TextInput
          value={pairingPayload}
          onChangeText={setPairingPayload}
          style={styles.payloadInput}
          placeholder="Paste QR payload"
          autoCapitalize="none"
          multiline
        />
      </View>

      <View style={styles.body}>
        <View style={styles.tablePanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>Tables</Text>
            <Text style={styles.muted}>{bootstrap?.tables.length ?? 0} total</Text>
          </View>
        <FlatList
          data={bootstrap?.tables ?? []}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.tableList}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.tableTile, item.status !== "free" && styles.busyTable, item.id === selectedTableId && styles.selectedTable]}
              onPress={() => void selectTable(item.id)}
            >
              <Text style={styles.tableName}>{item.name}</Text>
              <Text style={styles.muted}>{item.status}</Text>
            </Pressable>
          )}
        />
        </View>

        <View style={styles.order}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>{selectedTable ? `Table ${selectedTable.name}` : "Select table"}</Text>
            <Text style={styles.totalText}>₹{(ticketTotal / 100).toFixed(0)}</Text>
          </View>
          <View style={styles.inputs}>
            <TextInput value={captainId} onChangeText={setCaptainId} style={styles.input} />
            <TextInput value={pax} onChangeText={setPax} keyboardType="numeric" style={styles.paxInput} />
          </View>
          <TextInput
            value={menuSearch}
            onChangeText={setMenuSearch}
            style={styles.input}
            placeholder="Search menu"
          />

          <ScrollView style={styles.menu}>
            {visibleMenu
              .map((menuItem) => (
                <Pressable key={menuItem.id} style={styles.menuItem} onPress={() => addItem(menuItem.id)}>
                  <View>
                    <Text style={styles.menuName}>{menuItem.name}</Text>
                    <Text style={styles.muted}>{menuItem.production_unit_name}</Text>
                  </View>
                  <Text style={styles.price}>₹{(menuItem.price_paise / 100).toFixed(0)}</Text>
                </Pressable>
              ))}
          </ScrollView>

          <View style={styles.ticket}>
            {items.map((item, index) => {
              const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
              return (
                <View key={`${item.menuItemId}-${index}`} style={styles.ticketLine}>
                  <View style={styles.ticketText}>
                    <Text style={styles.ticketName}>{menuItem?.name ?? item.menuItemId}</Text>
                    <TextInput
                      value={item.notes ?? ""}
                      onChangeText={(notes) => changeNotes(index, notes)}
                      style={styles.noteInput}
                      placeholder="Kitchen note"
                    />
                    <View style={styles.noteChipRow}>
                      {(bootstrap?.noteTemplates ?? []).map((note) => (
                        <Pressable key={note.id} style={styles.noteChip} onPress={() => applyNoteTemplate(index, note.note)}>
                          <Text style={styles.noteChipText}>{note.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {(bootstrap?.modifierGroups ?? [])
                      .filter((group) => {
                        const menuItemIds = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId)?.modifier_group_ids ?? [];
                        return menuItemIds.includes(group.id);
                      })
                      .map((group) => (
                        <View key={group.id} style={styles.modifierBlock}>
                          <Text style={styles.muted}>{group.name}</Text>
                          <View style={styles.noteChipRow}>
                            {group.options
                              .filter((option) => option.active)
                              .map((option) => {
                                const active = (item.modifiers ?? []).some((modifier) => modifier.groupId === group.id && modifier.optionId === option.id);
                                return (
                                  <Pressable
                                    key={option.id}
                                    style={[styles.noteChip, active && styles.activeChip]}
                                    onPress={() => toggleModifier(index, group.id, option.id, group.selection_type === "single")}
                                  >
                                    <Text style={styles.noteChipText}>
                                      {option.name}
                                      {option.price_delta_paise ? ` +₹${(option.price_delta_paise / 100).toFixed(0)}` : ""}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                          </View>
                        </View>
                      ))}
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyButton} onPress={() => changeQty(index, -1)}>
                      <Text>-</Text>
                    </Pressable>
                    <Text>{item.quantity}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => changeQty(index, 1)}>
                      <Text>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable style={[styles.primaryButton, styles.sendButton]} onPress={() => void submitOrder()}>
            <Text style={styles.primaryButtonText}>{connection === "online" ? "Send KOT" : "Save Draft"}</Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerShell}>
          <View style={styles.scannerHeader}>
            <Text style={styles.title}>Scan Pairing QR</Text>
            <Pressable style={styles.secondaryButton} onPress={() => setScannerOpen(false)}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => void handleScannedPayload(data)}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

interface PairingPayload {
  kind: "gaurav-pos-pairing";
  version: number;
  hubUrl: string;
  code: string;
  deviceName?: string;
  role?: string;
  expiresAt?: string;
}

function parsePairingPayload(value: string): PairingPayload | null {
  const trimmed = value.trim();
  if (!trimmed || /^[0-9]{6}$/.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<PairingPayload>;
    if (parsed.kind !== "gaurav-pos-pairing" || !parsed.hubUrl || !parsed.code) return null;
    return {
      kind: "gaurav-pos-pairing",
      version: parsed.version ?? 1,
      hubUrl: parsed.hubUrl,
      code: parsed.code,
      deviceName: parsed.deviceName,
      role: parsed.role,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ebe6dc" },
  header: {
    padding: 16,
    backgroundColor: "#fffaf1",
    borderBottomWidth: 1,
    borderColor: "#d8cfbf",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: { fontSize: 24, fontWeight: "800", color: "#18140f" },
  muted: { color: "#716a60", fontSize: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  online: { backgroundColor: "#2c6f68" },
  offline: { backgroundColor: "#a6422b" },
  checking: { backgroundColor: "#9b8a64" },
  statusPill: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d8cfbf",
    backgroundColor: "#fffdf7",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  statusText: { color: "#18140f", fontWeight: "700", fontSize: 12 },
  connectionCard: {
    padding: 10,
    gap: 8,
    backgroundColor: "#fffaf1",
    borderBottomWidth: 1,
    borderColor: "#d8cfbf"
  },
  hubRow: { flexDirection: "row", gap: 8 },
  hubInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 10,
    color: "#18140f",
    backgroundColor: "#fffdf7"
  },
  tokenInput: {
    width: 112,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 10,
    color: "#18140f",
    backgroundColor: "#fffdf7"
  },
  payloadInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#18140f",
    backgroundColor: "#fffdf7"
  },
  body: { flex: 1, padding: 10, gap: 10 },
  tablePanel: {
    maxHeight: 192,
    borderWidth: 1,
    borderColor: "#d8cfbf",
    borderRadius: 10,
    backgroundColor: "#fffdf7",
    padding: 10
  },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tableList: { paddingTop: 10, gap: 8 },
  tableTile: {
    flex: 1,
    minHeight: 76,
    margin: 4,
    padding: 12,
    borderWidth: 2,
    borderColor: "#b9d4c7",
    borderRadius: 8,
    backgroundColor: "#f8fff9",
    justifyContent: "space-between"
  },
  busyTable: { borderColor: "#d18b5d", backgroundColor: "#fff3e8" },
  selectedTable: { borderColor: "#2c6f68", borderWidth: 3 },
  tableName: { fontSize: 20, fontWeight: "800", color: "#18140f" },
  order: {
    flex: 1,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d8cfbf",
    borderRadius: 10,
    backgroundColor: "#fffdf7"
  },
  sectionTitle: { fontSize: 19, fontWeight: "800", color: "#18140f" },
  totalText: { color: "#2c6f68", fontSize: 20, fontWeight: "800" },
  inputs: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fffaf1"
  },
  paxInput: {
    width: 64,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fffaf1"
  },
  menu: { maxHeight: 238 },
  menuItem: {
    minHeight: 64,
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#f8f3e8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  menuName: { fontSize: 16, fontWeight: "700", color: "#18140f" },
  price: { color: "#2c6f68", fontWeight: "800" },
  ticket: { flex: 1, gap: 8 },
  ticketLine: {
    minHeight: 76,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fffaf1",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  ticketText: { flex: 1, gap: 6 },
  ticketName: { color: "#18140f", fontWeight: "700" },
  noteInput: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: "#d8cfbf",
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f8f3e9"
  },
  noteChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  noteChip: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdf7"
  },
  activeChip: { borderColor: "#2c6f68", backgroundColor: "#e4f1eb" },
  noteChipText: { color: "#18140f", fontSize: 12, fontWeight: "700" },
  modifierBlock: { gap: 5 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdf7"
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#211d17",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryButtonText: { color: "#fffdfa", fontWeight: "700" },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#211d17",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#fffdf7"
  },
  secondaryButtonText: { color: "#211d17", fontWeight: "700" },
  sendButton: { minHeight: 50 },
  scannerShell: { flex: 1, backgroundColor: "#11100e" },
  scannerHeader: {
    padding: 16,
    backgroundColor: "#fffdfa",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  camera: { flex: 1 }
});
