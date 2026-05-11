import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { OrderItemInput } from "@gaurav-pos/shared";
import { HubClient, type HubBootstrap, type HubOrder } from "./lib/hub-client";
import { clearDraft, getDeviceToken, getHubUrl, loadDraft, saveDraft, setDeviceToken, setHubUrl } from "./lib/draft-store";

type ConnectionState = "checking" | "online" | "offline";
type ViewMode = "tables" | "menu" | "ticket";

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const tableColumns = width >= 900 ? 5 : width >= 640 ? 4 : 3;

  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("dev-admin-token");
  const [showToken, setShowToken] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingPayload, setPairingPayload] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const scanLockRef = useRef(false);

  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [message, setMessage] = useState("Checking hub connection...");
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<HubOrder | null>(null);
  const [captainId, setCaptainId] = useState("waiter-1");
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [mode, setMode] = useState<ViewMode>("tables");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const client = useMemo(() => new HubClient(hubUrl, deviceToken), [deviceToken, hubUrl]);
  const selectedTable = bootstrap?.tables.find((table) => table.id === selectedTableId) ?? null;
  const openDay = Boolean(bootstrap?.openDay);
  const activeTables = (bootstrap?.tables ?? []).filter((table) => table.status !== "disabled");
  const sentItems = (currentOrder?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);
  const draftTotal = items.reduce((total, item) => {
    const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
    return total + (menuItem?.price_paise ?? 0) * item.quantity;
  }, 0);
  const tableTotal = sentTotal + draftTotal;

  const visibleMenu = (bootstrap?.menuItems ?? []).filter((item) => {
    if (!item.active) return false;
    const query = menuSearch.trim().toLowerCase();
    return !query || `${item.name} ${item.production_unit_name ?? ""}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    void getHubUrl().then(setHubUrlState);
    void getDeviceToken().then(setDeviceTokenState);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(false), 8_000);
    return () => clearInterval(interval);
  }, [client, selectedTableId]);

  async function refresh(showSpinner = true) {
    if (showSpinner) setLoading(true);
    if (showSpinner) setConnection("checking");
    try {
      const isOnline = await client.health();
      setConnection(isOnline ? "online" : "offline");
      if (!isOnline) {
        setMessage("Hub is offline. Drafts stay on this phone until the hub is back.");
        return;
      }

      const nextBootstrap = await client.bootstrap();
      setBootstrap(nextBootstrap);
      setMessage(nextBootstrap.openDay ? "Connected to hub. Ready for service." : "Hub connected, but today's POS day is not open.");
      if (selectedTableId) await loadTableOrder(selectedTableId);
    } catch (error) {
      setConnection("offline");
      setMessage(error instanceof Error ? error.message : "Could not reach the hub.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function loadTableOrder(tableId: string) {
    if (connection === "offline") return;
    try {
      setCurrentOrder(await client.tableOrder(tableId));
    } catch (error) {
      setCurrentOrder(null);
      setMessage(error instanceof Error ? error.message : "Could not load table order.");
    }
  }

  async function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    setMode("menu");
    setCurrentOrder(null);
    const draft = await loadDraft(tableId);
    setItems(draft?.items ?? []);
    if (draft) {
      setCaptainId(draft.captainId);
      setPax(String(draft.pax));
      setMessage("Draft restored for this table.");
    }
    await loadTableOrder(tableId);
  }

  async function persistDraft(nextItems = items) {
    if (!selectedTableId) return;
    setSavingDraft(true);
    await saveDraft({
      tableId: selectedTableId,
      captainId,
      pax: Number(pax || 1),
      items: nextItems,
      updatedAt: new Date().toISOString()
    });
    setSavingDraft(false);
  }

  function addItem(menuItemId: string) {
    if (!selectedTableId) {
      setMessage("Choose a table before adding dishes.");
      setMode("tables");
      return;
    }
    const current = items.find((item) => item.menuItemId === menuItemId);
    const next = current
      ? items.map((item) => (item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + 1 } : item))
      : [...items, { menuItemId, quantity: 1 }];
    setItems(next);
    setMode("ticket");
    void persistDraft(next);
  }

  function changeQty(index: number, delta: number) {
    const next = items
      .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
      .filter((item) => item.quantity > 0);
    setItems(next);
    void persistDraft(next);
  }

  function orderSummary() {
    return items
      .map((item) => {
        const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
        return `${item.quantity} x ${menuItem?.name ?? item.menuItemId}`;
      })
      .join("\n");
  }

  function confirmSendKot(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert("Send these new items?", orderSummary(), [
        { text: "Review", style: "cancel", onPress: () => resolve(false) },
        { text: "Send To Kitchen", onPress: () => resolve(true) }
      ]);
    });
  }

  async function submitOrder() {
    if (!selectedTableId) {
      setMessage("Choose a table first.");
      setMode("tables");
      return;
    }
    if (items.length === 0) {
      setMessage("Add at least one dish before sending.");
      setMode("menu");
      return;
    }
    if (connection !== "online") {
      await persistDraft();
      Alert.alert("Draft saved", "Reconnect to the hub to send these items.");
      return;
    }
    if (!openDay) {
      Alert.alert("POS day is closed", "Ask the cashier to open today's POS day on the hub.");
      return;
    }
    if (!(await confirmSendKot())) return;

    try {
      setLoading(true);
      await client.submitOrder({
        tableId: selectedTableId,
        captainId,
        pax: Number(pax || 1),
        orderType: "dine_in",
        items
      });
      await clearDraft(selectedTableId);
      setItems([]);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMode("ticket");
      setMessage("Sent to kitchen. New items cleared; table check stays visible.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send order.");
    } finally {
      setLoading(false);
    }
  }

  async function saveHub() {
    await setHubUrl(hubUrl);
    await setDeviceToken(deviceToken);
    await refresh();
    setSetupOpen(false);
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
    try {
      const pairClient = new HubClient(pairHubUrl, deviceToken);
      const result = await pairClient.exchangePairingCode({
        code: pairCode,
        deviceName: captainId || payload?.deviceName || "Android waiter"
      });
      setDeviceTokenState(result.token);
      await setDeviceToken(result.token);
      setPairingCode("");
      setPairingPayload("");
      setSetupOpen(false);
      await refresh();
      Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
    } catch (error) {
      Alert.alert("Pairing failed", error instanceof Error ? error.message : "Try a fresh code from the hub.");
    }
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
    Alert.alert("Pair this device?", `${payload.deviceName ?? "Android waiter"} as ${payload.role ?? "waiter"}`, [
      { text: "Later", style: "cancel" },
      { text: "Pair Now", onPress: () => void pairDeviceFromPayload(payload) }
    ]);
  }

  async function pairDeviceFromPayload(payload: PairingPayload) {
    try {
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
      setSetupOpen(false);
      await refresh();
      Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
    } catch (error) {
      Alert.alert("Pairing failed", error instanceof Error ? error.message : "Try a fresh code from the hub.");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Gaurav POS</Text>
          <Text style={styles.title}>{selectedTable ? `Table ${selectedTable.name}` : "Waiter App"}</Text>
          <Text style={styles.muted}>{selectedTable ? "Add new items or review the table check." : "Pick a table to start taking an order."}</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.statusPill, styles[`status_${connection}`]]}>
            {connection === "checking" ? <ActivityIndicator size="small" /> : <View style={[styles.dot, styles[connection]]} />}
            <Text style={styles.statusText}>{connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Checking"}</Text>
          </View>
          <Pressable style={styles.ghostButton} onPress={() => setSetupOpen((value) => !value)}>
            <Text style={styles.ghostButtonText}>{setupOpen ? "Hide Setup" : "Setup"}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
          {savingDraft ? <Text style={styles.bannerMeta}>Saving draft...</Text> : null}
        </View>

        {setupOpen || connection === "offline" ? (
          <View style={styles.setupCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.sectionTitle}>Connect This Phone</Text>
                <Text style={styles.muted}>Scan the QR from the hub or enter the hub address manually.</Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => void refresh()}>
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
            <LabeledInput label="Hub address" value={hubUrl} onChangeText={setHubUrlState} autoCapitalize="none" />
            <View style={styles.secretRow}>
              <View style={styles.secretInput}>
                <LabeledInput
                  label="Device password"
                  value={deviceToken}
                  onChangeText={setDeviceTokenState}
                  autoCapitalize="none"
                  secureTextEntry={!showToken}
                />
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => setShowToken((value) => !value)}>
                <Text style={styles.secondaryButtonText}>{showToken ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.primaryButton} onPress={saveHub}>
                <Text style={styles.primaryButtonText}>Save Connection</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void openScanner()}>
                <Text style={styles.secondaryButtonText}>Scan QR</Text>
              </Pressable>
            </View>
            <LabeledInput label="Six digit pairing code" value={pairingCode} onChangeText={setPairingCode} keyboardType="number-pad" />
            <TextInput
              value={pairingPayload}
              onChangeText={setPairingPayload}
              style={styles.payloadInput}
              placeholder="Paste QR payload if scanning is not available"
              placeholderTextColor="#81786b"
              autoCapitalize="none"
              multiline
            />
            <Pressable style={styles.primaryButton} onPress={() => void pairDevice()}>
              <Text style={styles.primaryButtonText}>Pair Device</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.modeTabs}>
          {(["tables", "menu", "ticket"] as ViewMode[]).map((entry) => (
            <Pressable key={entry} style={[styles.modeTab, mode === entry && styles.modeTabActive]} onPress={() => setMode(entry)}>
              <Text style={[styles.modeTabText, mode === entry && styles.modeTabTextActive]}>
                {entry === "tables" ? "Tables" : entry === "menu" ? "Menu" : "Ticket"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.workArea, isWide && styles.workAreaWide]}>
          {(mode === "tables" || isWide) && (
            <View style={[styles.panel, isWide && styles.sidePanel]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Tables</Text>
                  <Text style={styles.muted}>{openDay ? `${activeTables.length} tables available` : "Open POS day on the hub first"}</Text>
                </View>
                {loading ? <ActivityIndicator /> : null}
              </View>
              {activeTables.length === 0 ? (
                <EmptyState title="No tables yet" text="Add rooms and tables on the hub setup screen." />
              ) : (
                <View style={styles.tableGrid}>
                  {activeTables.map((table) => (
                    <Pressable
                      key={table.id}
                      style={[
                        styles.tableTile,
                        { width: `${100 / tableColumns - 2}%` },
                        table.status !== "free" && styles.busyTable,
                        table.id === selectedTableId && styles.selectedTable
                      ]}
                      onPress={() => void selectTable(table.id)}
                    >
                      <Text style={styles.tableName}>{table.name}</Text>
                      <Text style={[styles.tableStatus, table.status !== "free" && styles.tableStatusBusy]}>
                        {table.status === "free" ? "Free" : "Occupied"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {(mode === "menu" || isWide) && (
            <View style={[styles.panel, styles.menuPanel]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Add Dishes</Text>
                  <Text style={styles.muted}>{selectedTable ? `New items for Table ${selectedTable.name}` : "Choose a table first"}</Text>
                </View>
                <Text style={styles.totalText}>Rs {(draftTotal / 100).toFixed(0)}</Text>
              </View>
              <TextInput
                value={menuSearch}
                onChangeText={setMenuSearch}
                style={styles.input}
                placeholder="Search dishes"
                placeholderTextColor="#81786b"
              />
              {!selectedTable ? (
                <EmptyState title="No table selected" text="Tap a table, then add dishes here." />
              ) : visibleMenu.length === 0 ? (
                <EmptyState title="No dishes found" text="Try another search or add dishes on the hub." />
              ) : (
                <View style={styles.menuList}>
                  {visibleMenu.map((menuItem) => (
                    <Pressable key={menuItem.id} style={styles.menuItem} onPress={() => addItem(menuItem.id)}>
                      <View style={styles.menuText}>
                        <Text style={styles.menuName}>{menuItem.name}</Text>
                        <Text style={styles.muted}>{menuItem.production_unit_name ?? "No kitchen assigned"}</Text>
                      </View>
                      <View style={styles.menuPriceBlock}>
                        <Text style={styles.price}>Rs {(menuItem.price_paise / 100).toFixed(0)}</Text>
                        <Text style={styles.addText}>Add</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {(mode === "ticket" || isWide) && (
            <View style={[styles.panel, isWide && styles.sidePanel]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Table Check</Text>
                  <Text style={styles.muted}>{selectedTable ? `Table ${selectedTable.name}` : "No table selected"}</Text>
                </View>
                <Text style={styles.totalText}>Rs {(tableTotal / 100).toFixed(0)}</Text>
              </View>

              <View style={styles.formRow}>
                <LabeledInput label="Waiter" value={captainId} onChangeText={setCaptainId} />
                <View style={styles.paxBox}>
                  <LabeledInput label="Pax" value={pax} onChangeText={setPax} keyboardType="number-pad" />
                </View>
              </View>

              <Text style={styles.subhead}>New Items</Text>
              {items.length === 0 ? (
                <EmptyState title="No new dishes" text="Add dishes from the menu. Sent items stay below for reference." compact />
              ) : (
                <View style={styles.ticketList}>
                  {items.map((item, index) => {
                    const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
                    return (
                      <View key={`${item.menuItemId}-${index}`} style={styles.ticketLine}>
                        <View style={styles.ticketText}>
                          <Text style={styles.ticketName}>{menuItem?.name ?? item.menuItemId}</Text>
                          <Text style={styles.muted}>Rs {(((menuItem?.price_paise ?? 0) * item.quantity) / 100).toFixed(0)}</Text>
                        </View>
                        <View style={styles.qtyControls}>
                          <Pressable style={styles.qtyButton} onPress={() => changeQty(index, -1)}>
                            <Text style={styles.qtyText}>-</Text>
                          </Pressable>
                          <Text style={styles.qtyValue}>{item.quantity}</Text>
                          <Pressable style={styles.qtyButton} onPress={() => changeQty(index, 1)}>
                            <Text style={styles.qtyText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={styles.subhead}>Already Sent</Text>
              {sentItems.length === 0 ? (
                <Text style={styles.smallMuted}>Nothing has been sent for this table yet.</Text>
              ) : (
                <View style={styles.sentList}>
                  {sentItems.map((item) => (
                    <View key={item.menu_item_id} style={styles.sentLine}>
                      <Text style={styles.sentName}>{item.quantity} x {item.name_snapshot}</Text>
                      <Text style={styles.muted}>Rs {((item.unit_price_paise * item.quantity) / 100).toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.totalStrip}>
                <Text style={styles.totalLabel}>New Rs {(draftTotal / 100).toFixed(0)}</Text>
                <Text style={styles.totalLabel}>Table Rs {(tableTotal / 100).toFixed(0)}</Text>
              </View>
              <Pressable style={[styles.primaryButton, styles.sendButton, (!selectedTable || items.length === 0) && styles.buttonDisabled]} onPress={() => void submitOrder()}>
                <Text style={styles.primaryButtonText}>{connection === "online" ? "Send New Items" : "Save Draft"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerShell}>
          <View style={styles.scannerHeader}>
            <View>
              <Text style={styles.title}>Scan Pairing QR</Text>
              <Text style={styles.muted}>Use the QR shown on the hub PC.</Text>
            </View>
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

function LabeledInput({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  keyboardType
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        placeholderTextColor="#81786b"
      />
    </View>
  );
}

function EmptyState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

const palette = {
  ink: "#1c1915",
  muted: "#6f675d",
  paper: "#fffdf7",
  wash: "#f3eee3",
  line: "#d7cdbc",
  green: "#16645d",
  greenSoft: "#e8f4ef",
  amber: "#9d5d20",
  amberSoft: "#fff0dc",
  red: "#a6422b"
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.wash },
  screen: { flex: 1 },
  screenContent: { padding: 12, gap: 12, paddingBottom: 28 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: palette.paper,
    borderBottomWidth: 1,
    borderColor: palette.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  headerText: { flex: 1, minWidth: 0 },
  headerActions: { alignItems: "flex-end", gap: 8 },
  kicker: { color: palette.green, fontWeight: "800", fontSize: 11, textTransform: "uppercase", letterSpacing: 0 },
  title: { fontSize: 25, fontWeight: "900", color: palette.ink },
  muted: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  smallMuted: { color: palette.muted, fontSize: 12, lineHeight: 18, paddingVertical: 4 },
  banner: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#fbf6eb",
    borderRadius: 8,
    padding: 12,
    gap: 3
  },
  bannerText: { color: palette.ink, fontWeight: "700", lineHeight: 20 },
  bannerMeta: { color: palette.green, fontSize: 12, fontWeight: "800" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  online: { backgroundColor: palette.green },
  offline: { backgroundColor: palette.red },
  checking: { backgroundColor: palette.amber },
  statusPill: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  status_online: { borderColor: "#a7cbc3", backgroundColor: palette.greenSoft },
  status_offline: { borderColor: "#e4b1a6", backgroundColor: "#fff0ed" },
  status_checking: { borderColor: "#ead4a9", backgroundColor: palette.amberSoft },
  statusText: { color: palette.ink, fontWeight: "800", fontSize: 12 },
  ghostButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper
  },
  ghostButtonText: { color: palette.ink, fontWeight: "800", fontSize: 12 },
  setupCard: {
    padding: 12,
    gap: 10,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: "900", color: palette.ink },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { color: palette.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 11,
    color: palette.ink,
    backgroundColor: "#fffaf1",
    fontWeight: "700"
  },
  payloadInput: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: palette.ink,
    backgroundColor: "#fffaf1"
  },
  secretRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  secretInput: { flex: 1 },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  primaryButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: { color: "#fffdfa", fontWeight: "900" },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: palette.paper
  },
  secondaryButtonText: { color: palette.ink, fontWeight: "900" },
  modeTabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#e6ded0",
    borderWidth: 1,
    borderColor: palette.line
  },
  modeTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  modeTabActive: { backgroundColor: palette.ink },
  modeTabText: { color: palette.ink, fontWeight: "900" },
  modeTabTextActive: { color: "#fffdfa" },
  workArea: { gap: 12 },
  workAreaWide: { flexDirection: "row", alignItems: "flex-start" },
  panel: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    backgroundColor: palette.paper,
    padding: 12,
    gap: 12
  },
  sidePanel: { flex: 1 },
  menuPanel: { flex: 1.35 },
  tableGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tableTile: {
    minHeight: 78,
    padding: 11,
    borderWidth: 2,
    borderColor: "#a8cdbf",
    borderRadius: 8,
    backgroundColor: "#f5fff9",
    justifyContent: "space-between"
  },
  busyTable: { borderColor: "#d08a4d", backgroundColor: palette.amberSoft },
  selectedTable: { borderColor: palette.green, backgroundColor: palette.greenSoft },
  tableName: { fontSize: 20, fontWeight: "900", color: palette.ink },
  tableStatus: { color: palette.green, fontWeight: "900", fontSize: 12 },
  tableStatusBusy: { color: palette.amber },
  totalText: { color: palette.green, fontSize: 20, fontWeight: "900" },
  menuList: { gap: 8 },
  menuItem: {
    minHeight: 68,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fbf6eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  menuText: { flex: 1, minWidth: 0 },
  menuName: { fontSize: 16, fontWeight: "900", color: palette.ink },
  menuPriceBlock: { alignItems: "flex-end", gap: 4 },
  price: { color: palette.green, fontWeight: "900" },
  addText: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  formRow: { flexDirection: "row", gap: 8 },
  paxBox: { width: 88 },
  subhead: { color: palette.ink, fontWeight: "900", fontSize: 13, textTransform: "uppercase", letterSpacing: 0 },
  ticketList: { gap: 8 },
  ticketLine: {
    minHeight: 72,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fffaf1",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  ticketText: { flex: 1, minWidth: 0 },
  ticketName: { color: palette.ink, fontWeight: "900", fontSize: 15 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper
  },
  qtyText: { color: palette.ink, fontSize: 20, fontWeight: "900" },
  qtyValue: { color: palette.ink, fontSize: 16, fontWeight: "900", minWidth: 20, textAlign: "center" },
  sentList: { borderTopWidth: 1, borderColor: "#ece2d4" },
  sentLine: {
    minHeight: 42,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#ece2d4",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  sentName: { color: palette.ink, fontWeight: "800", flex: 1 },
  totalStrip: {
    borderRadius: 8,
    backgroundColor: palette.greenSoft,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  totalLabel: { color: palette.green, fontWeight: "900" },
  sendButton: { minHeight: 52 },
  buttonDisabled: { opacity: 0.45 },
  empty: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eadfce",
    backgroundColor: "#fffaf1",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 6
  },
  emptyCompact: { minHeight: 78, alignItems: "flex-start" },
  emptyTitle: { color: palette.ink, fontWeight: "900", fontSize: 15 },
  scannerShell: { flex: 1, backgroundColor: "#11100e" },
  scannerHeader: {
    padding: 16,
    backgroundColor: palette.paper,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  camera: { flex: 1 }
});
