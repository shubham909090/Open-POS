import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getTableDisplayState, tableDisplayLabel, type OrderItemInput } from "@gaurav-pos/shared";
import { HubClient, type HubBootstrap, type HubOrder } from "./lib/hub-client";
import { clearDraft, getDeviceToken, getHubUrl, loadDraft, saveDraft, setDeviceToken, setHubUrl } from "./lib/draft-store";

type ConnectionState = "checking" | "online" | "offline";
type ViewMode = "tables" | "menu" | "ticket";

interface PairingPayload {
  kind: "gaurav-pos-pairing";
  version: number;
  hubUrl: string;
  code: string;
  deviceName?: string;
  role?: string;
  expiresAt?: string;
}

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 780;
  const contentWidth = Math.max(320, width - 32);
  const tablePanelWidth = isWide ? Math.min(360, Math.floor(contentWidth * 0.34)) : contentWidth;
  const tableColumns = tablePanelWidth >= 340 ? 2 : 1;
  const tableTileWidth = Math.floor((tablePanelWidth - 28 - 10 * (tableColumns - 1)) / tableColumns);

  const [initializing, setInitializing] = useState(true);
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("");
  const [deviceRole, setDeviceRoleState] = useState("");
  const [deviceName, setDeviceNameState] = useState("");
  const [hubUrlDraft, setHubUrlDraft] = useState("http://192.168.1.10:3737");
  const [deviceTokenDraft, setDeviceTokenDraft] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingPayload, setPairingPayload] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const scanLockRef = useRef(false);

  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [message, setMessage] = useState("Checking hub connection...");
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<HubOrder | null>(null);
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [mode, setMode] = useState<ViewMode>("tables");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const client = useMemo(() => new HubClient(hubUrl, deviceToken), [deviceToken, hubUrl]);
  const selectedTable = bootstrap?.tables.find((table) => table.id === selectedTableId) ?? null;
  const activeTables = (bootstrap?.tables ?? []).filter((table) => getTableDisplayState(table) !== "disabled");
  const sentItems = (currentOrder?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);
  const draftTotal = items.reduce((total, item) => {
    const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
    const variant = findMenuVariant(menuItem, item.menuItemVariantId);
    return total + (variant?.price_paise ?? menuItem?.price_paise ?? 0) * item.quantity;
  }, 0);
  const tableTotal = sentTotal + draftTotal;
  const hasNewItems = items.length > 0;
  const shouldShowOnboarding = setupOpen || !deviceToken || connection === "offline";

  const visibleMenu = (bootstrap?.menuItems ?? []).filter((item) => {
    if (!item.active) return false;
    const query = menuSearch.trim().toLowerCase();
    return !query || `${item.name} ${item.production_unit_name ?? ""}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    let alive = true;
    async function hydrate() {
      const [savedHubUrl, savedToken] = await Promise.all([getHubUrl(), getDeviceToken()]);
      if (!alive) return;
      setHubUrlState(savedHubUrl);
      setHubUrlDraft(savedHubUrl);
      setDeviceTokenState(savedToken);
      setDeviceTokenDraft(savedToken);
      setInitializing(false);
    }
    void hydrate();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (initializing) return;
    void refresh();
    const interval = setInterval(() => void refresh(false), 8_000);
    return () => clearInterval(interval);
  }, [client, initializing, selectedTableId]);

  async function refresh(showSpinner = true) {
    if (showSpinner) setLoading(true);
    if (showSpinner) setConnection("checking");
    try {
      const isOnline = await client.health();
      setConnection(isOnline ? "online" : "offline");
      if (!isOnline) {
        setMessage("Hub is not reachable. Check Wi-Fi and hub address. Drafts stay on this phone.");
        return;
      }

      const nextBootstrap = await client.bootstrap();
      setBootstrap(nextBootstrap);
      const session = await client.me();
      setDeviceNameState(session.name);
      setDeviceRoleState(session.role);
      await checkReadyNotifications();
      setMessage(`Connected. Business day ${nextBootstrap.currentBusinessDay.business_date} is active.`);
      if (selectedTableId) await loadTableOrder(selectedTableId);
    } catch (error) {
      setConnection("offline");
      setMessage(error instanceof Error ? error.message : "Could not reach the hub.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function checkReadyNotifications() {
    if (!deviceToken) return;
    try {
      const ready = await client.readyNotifications();
      for (const notification of ready) {
        const itemText = notification.items.map((item) => `${item.quantity} x ${item.name}`).join(", ");
        Alert.alert("Order ready", `${notification.productionUnitName} says Table ${notification.tableName} is ready.\n${itemText}`);
      }
    } catch {
      // Non-captain devices or older hubs may not expose ready alerts; the main refresh still works.
    }
  }

  async function loadTableOrder(tableId: string) {
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
      setPax(String(draft.pax));
      setMessage("Draft restored for this table.");
    }
    if (connection === "online") await loadTableOrder(tableId);
  }

  async function persistDraft(nextItems = items, nextPax = pax) {
    if (!selectedTableId) return;
    setSavingDraft(true);
    await saveDraft({
      tableId: selectedTableId,
      pax: normalisePax(nextPax),
      items: nextItems,
      updatedAt: new Date().toISOString()
    });
    setSavingDraft(false);
  }

  function addItem(menuItemId: string, menuItemVariantId?: string) {
    if (!selectedTableId) {
      setMessage("Choose a table before adding dishes.");
      setMode("tables");
      return;
    }
    const current = items.find((item) => item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId);
    const next = current
      ? items.map((item) => (item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId ? { ...item, quantity: item.quantity + 1 } : item))
      : [...items, { menuItemId, menuItemVariantId, quantity: 1 }];
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

  function orderSummary() {
    return items
      .map((item) => {
        const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
        const variant = findMenuVariant(menuItem, item.menuItemVariantId);
        return `${item.quantity} x ${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
      })
      .join("\n");
  }

  function confirmSendKot(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert("Send new items?", orderSummary(), [
        { text: "Review", style: "cancel", onPress: () => resolve(false) },
        { text: "Send", onPress: () => resolve(true) }
      ]);
    });
  }

  async function submitOrder() {
    if (sending) return;
    if (!selectedTableId) {
      setMessage("Choose a table first.");
      setMode("tables");
      return;
    }
    if (!hasNewItems) {
      setMessage("Add at least one dish before sending.");
      setMode("menu");
      return;
    }
    if (connection !== "online") {
      await persistDraft();
      Alert.alert("Draft saved", "Reconnect to the hub to send these items.");
      return;
    }
    if (!(await confirmSendKot())) return;

    try {
      setSending(true);
      await client.submitOrder({
        tableId: selectedTableId,
        pax: normalisePax(pax),
        orderType: "dine_in",
        items
      });
      await clearDraft(selectedTableId);
      setItems([]);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMode("ticket");
      setMessage("Sent. New items are cleared; sent items stay on the table check.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send order.");
    } finally {
      setSending(false);
    }
  }

  async function shiftTable(toTableId: string) {
    if (!selectedTableId) {
      setMessage("Choose a running table before shifting.");
      return;
    }
    if (connection !== "online") {
      setMessage("Reconnect to the hub before shifting a table.");
      return;
    }
    try {
      setSending(true);
      await client.moveTable({
        fromTableId: selectedTableId,
        toTableId,
        reason: "Shifted from captain app"
      });
      await refresh(false);
      setSelectedTableId(toTableId);
      await loadTableOrder(toTableId);
      setMode("ticket");
      setMessage("Table shifted. The running order is now on the new table.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shift table.");
    } finally {
      setSending(false);
    }
  }

  async function shiftItem(orderItemId: string, quantity: number, toTableId: string) {
    if (!selectedTableId) {
      setMessage("Choose a running table before shifting an item.");
      return;
    }
    if (connection !== "online") {
      setMessage("Reconnect to the hub before shifting items.");
      return;
    }
    try {
      setSending(true);
      await client.moveItems({
        fromTableId: selectedTableId,
        toTableId,
        reason: "Items shifted from captain app",
        items: [{ orderItemId, quantity }]
      });
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Item shifted. The table checks have been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shift item.");
    } finally {
      setSending(false);
    }
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
    try {
      const pairClient = new HubClient(pairHubUrl, deviceTokenDraft.trim());
      const result = await pairClient.exchangePairingCode({
        code: pairCode,
        deviceName: payload?.deviceName || "Captain phone"
      });
      await setHubUrl(pairHubUrl);
      await setDeviceToken(result.token);
      setHubUrlState(pairHubUrl);
      setHubUrlDraft(pairHubUrl);
      setDeviceTokenState(result.token);
      setDeviceTokenDraft(result.token);
      setDeviceRoleState(result.role);
      setDeviceNameState(result.deviceName);
      setPairingCode("");
      setPairingPayload("");
      setSetupOpen(false);
      setMessage(`${result.deviceName} is paired and ready.`);
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
    setHubUrlDraft(normaliseHubUrl(payload.hubUrl));
    setFormRevision((value) => value + 1);
    Alert.alert("Pair this phone?", `${payload.deviceName ?? "Captain phone"} as ${payload.role ?? "captain"}`, [
      { text: "Later", style: "cancel" },
      { text: "Pair Now", onPress: () => void pairDeviceFromPayload(payload) }
    ]);
  }

  async function pairDeviceFromPayload(payload: PairingPayload) {
    try {
      const pairHubUrl = normaliseHubUrl(payload.hubUrl);
      const pairClient = new HubClient(pairHubUrl, deviceTokenDraft.trim());
      const result = await pairClient.exchangePairingCode({
        code: payload.code,
        deviceName: payload.deviceName || "Captain phone"
      });
      await setHubUrl(pairHubUrl);
      await setDeviceToken(result.token);
      setHubUrlState(pairHubUrl);
      setHubUrlDraft(pairHubUrl);
      setDeviceTokenState(result.token);
      setDeviceTokenDraft(result.token);
      setDeviceRoleState(result.role);
      setDeviceNameState(result.deviceName);
      setPairingCode("");
      setPairingPayload("");
      setSetupOpen(false);
      setMessage(`${result.deviceName} is paired and ready.`);
      Alert.alert("Device paired", `${result.deviceName} is ready as ${result.role}.`);
    } catch (error) {
      Alert.alert("Pairing failed", error instanceof Error ? error.message : "Try a fresh code from the hub.");
    }
  }

  if (initializing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingShell}>
          <ActivityIndicator size="large" color={palette.green} />
          <Text style={styles.loadingText}>Opening waiter app...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.wash} />
      <KeyboardAvoidingView style={styles.keyboardShell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <AppHeader
          connection={connection}
          title={selectedTable ? `Table ${selectedTable.name}` : "Waiter"}
          subtitle={selectedTable ? "Add dishes or review sent items" : "Pick a table to start"}
          onSetupPress={() => {
            setHubUrlDraft(hubUrl);
            setDeviceTokenDraft(deviceToken);
            setSetupOpen(true);
          }}
        />

        {shouldShowOnboarding ? (
          <OnboardingScreen
            connection={connection}
            formRevision={formRevision}
            hubUrl={hubUrlDraft}
            deviceToken={deviceTokenDraft}
            pairingCode={pairingCode}
            pairingPayload={pairingPayload}
            hasSavedToken={Boolean(deviceToken)}
            loading={loading}
            message={message}
            onHubUrlChange={setHubUrlDraft}
            onDeviceTokenChange={setDeviceTokenDraft}
            onPairingCodeChange={(value) => setPairingCode(value.replace(/\D/g, "").slice(0, 6))}
            onPairingPayloadChange={setPairingPayload}
            onRetry={() => void refresh()}
            onSaveConnection={() => void saveHubConnection()}
            onScan={() => void openScanner()}
            onPair={() => void pairDevice()}
            onStart={() => setSetupOpen(false)}
          />
        ) : (
          <>
            <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="always">
              <ConnectionBanner message={message} savingDraft={savingDraft} />
              <ModeTabs mode={mode} onModeChange={setMode} />
              <View style={[styles.workArea, isWide && styles.workAreaWide]}>
                {(mode === "tables" || isWide) && (
                  <TablePicker
                    activeTables={activeTables}
                    selectedTableId={selectedTableId}
                    loading={loading}
                    tileWidth={tableTileWidth}
                    onSelectTable={(tableId) => void selectTable(tableId)}
                  />
                )}
                {(mode === "menu" || isWide) && (
                  <MenuScreen
                    selectedTableName={selectedTable?.name ?? null}
                    visibleMenu={visibleMenu}
                    draftTotal={draftTotal}
                    searchKey={selectedTableId ?? "no-table"}
                    onSearchChange={setMenuSearch}
                    onAddItem={addItem}
                  />
                )}
                {(mode === "ticket" || isWide) && (
                  <TicketScreen
                    selectedTableName={selectedTable?.name ?? null}
                    deviceName={deviceName}
                    pax={pax}
                    items={items}
                    sentItems={sentItems}
                    menuItems={bootstrap?.menuItems ?? []}
                    tables={activeTables}
                    selectedTableId={selectedTableId}
                    draftTotal={draftTotal}
                    tableTotal={tableTotal}
                    connection={connection}
                    sending={sending}
                    canShift={deviceRole === "captain"}
                    onPaxChange={(value) => {
                      const clean = value.replace(/\D/g, "").slice(0, 3);
                      setPax(clean);
                      void persistDraft(items, clean);
                    }}
                    onChangeQty={changeQty}
                    onShiftTable={(tableId) => void shiftTable(tableId)}
                    onShiftItem={(orderItemId, quantity, toTableId) => void shiftItem(orderItemId, quantity, toTableId)}
                    onSubmit={() => void submitOrder()}
                  />
                )}
              </View>
            </ScrollView>
            {hasNewItems && mode !== "ticket" ? (
              <DraftBar
                count={items.reduce((total, item) => total + item.quantity, 0)}
                total={draftTotal}
                onReview={() => setMode("ticket")}
              />
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerShell}>
          <View style={styles.scannerHeader}>
            <View style={styles.flexText}>
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

function AppHeader({
  connection,
  title,
  subtitle,
  onSetupPress
}: {
  connection: ConnectionState;
  title: string;
  subtitle: string;
  onSetupPress: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.kicker}>Gaurav POS</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.muted} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.headerActions}>
        <StatusPill connection={connection} />
        <Pressable style={styles.iconButton} onPress={onSetupPress} hitSlop={8}>
          <Text style={styles.iconButtonText}>Setup</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusPill({ connection }: { connection: ConnectionState }) {
  return (
    <View style={[styles.statusPill, styles[`status_${connection}`]]}>
      {connection === "checking" ? <ActivityIndicator size="small" /> : <View style={[styles.dot, styles[connection]]} />}
      <Text style={styles.statusText}>{connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Checking"}</Text>
    </View>
  );
}

function OnboardingScreen({
  connection,
  formRevision,
  hubUrl,
  deviceToken,
  pairingCode,
  pairingPayload,
  hasSavedToken,
  loading,
  message,
  onHubUrlChange,
  onDeviceTokenChange,
  onPairingCodeChange,
  onPairingPayloadChange,
  onRetry,
  onSaveConnection,
  onScan,
  onPair,
  onStart
}: {
  connection: ConnectionState;
  formRevision: number;
  hubUrl: string;
  deviceToken: string;
  pairingCode: string;
  pairingPayload: string;
  hasSavedToken: boolean;
  loading: boolean;
  message: string;
  onHubUrlChange: (value: string) => void;
  onDeviceTokenChange: (value: string) => void;
  onPairingCodeChange: (value: string) => void;
  onPairingPayloadChange: (value: string) => void;
  onRetry: () => void;
  onSaveConnection: () => void;
  onScan: () => void;
  onPair: () => void;
  onStart: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="always">
      <View style={styles.heroPanel}>
        <Text style={styles.kicker}>Phone Setup</Text>
        <Text style={styles.heroTitle}>Connect this phone to the hub PC.</Text>
        <Text style={styles.heroCopy}>Keep this phone on the same Wi-Fi as the hub. Scanning the QR is the easiest way.</Text>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="1" label="Find Hub" />
        <Text style={styles.muted}>{message}</Text>
        <UncontrolledInput
          inputKey={`hub-${formRevision}`}
          label="Hub address"
          defaultValue={hubUrl}
          onChangeText={onHubUrlChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          placeholder="http://192.168.1.202:3737"
        />
        <View style={styles.buttonStack}>
          <Pressable style={styles.primaryButton} onPress={onSaveConnection} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? "Checking..." : "Save And Check Hub"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onRetry} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="2" label="Pair This Phone" />
        <Pressable style={styles.scanButton} onPress={onScan}>
          <Text style={styles.scanButtonText}>Scan Hub QR</Text>
          <Text style={styles.scanButtonMeta}>Recommended</Text>
        </Pressable>
        <UncontrolledInput
          inputKey={`pair-code-${formRevision}`}
          label="Pairing code"
          defaultValue={pairingCode}
          onChangeText={onPairingCodeChange}
          keyboardType="number-pad"
          returnKeyType="done"
          placeholder="Six digits"
        />
        <UncontrolledInput
          inputKey={`payload-${formRevision}`}
          label="Paste QR text"
          defaultValue={pairingPayload}
          onChangeText={onPairingPayloadChange}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          placeholder="Use this only if scanning is not available"
        />
        <Pressable style={styles.primaryButton} onPress={onPair}>
          <Text style={styles.primaryButtonText}>Pair Phone</Text>
        </Pressable>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="3" label="Ready For Orders" />
        <Text style={styles.muted}>
          {connection === "online" && hasSavedToken
            ? "This phone is connected. Start taking table orders."
            : "Once the phone is paired and the hub is online, orders can be sent to the kitchen."}
        </Text>
        <UncontrolledInput
          inputKey={`token-${formRevision}`}
          label="Saved device password"
          defaultValue={deviceToken}
          onChangeText={onDeviceTokenChange}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Filled by pairing"
        />
        <Pressable
          style={[styles.primaryButton, (connection !== "online" || !hasSavedToken) && styles.buttonDisabled]}
          onPress={onStart}
          disabled={connection !== "online" || !hasSavedToken}
        >
          <Text style={styles.primaryButtonText}>Start Taking Orders</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StepNumber({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepCircle}>
        <Text style={styles.stepCircleText}>{value}</Text>
      </View>
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

function ConnectionBanner({ message, savingDraft }: { message: string; savingDraft: boolean }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
      {savingDraft ? <Text style={styles.bannerMeta}>Saving draft...</Text> : null}
    </View>
  );
}

function ModeTabs({ mode, onModeChange }: { mode: ViewMode; onModeChange: (mode: ViewMode) => void }) {
  return (
    <View style={styles.modeTabs}>
      {(["tables", "menu", "ticket"] as ViewMode[]).map((entry) => (
        <Pressable key={entry} style={[styles.modeTab, mode === entry && styles.modeTabActive]} onPress={() => onModeChange(entry)}>
          <Text style={[styles.modeTabText, mode === entry && styles.modeTabTextActive]}>
            {entry === "tables" ? "Tables" : entry === "menu" ? "Menu" : "Review"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TablePicker({
  activeTables,
  selectedTableId,
  loading,
  tileWidth,
  onSelectTable
}: {
  activeTables: HubBootstrap["tables"];
  selectedTableId: string | null;
  loading: boolean;
  tileWidth: number;
  onSelectTable: (tableId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Tables</Text>
          <Text style={styles.muted}>{activeTables.length} tables available</Text>
        </View>
        {loading ? <ActivityIndicator /> : null}
      </View>
      {activeTables.length === 0 ? (
        <EmptyState title="No tables yet" text="Add floors and tables on the hub setup screen." />
      ) : (
        <View style={styles.tableGrid}>
          {activeTables.map((table) => (
            <TableTile key={table.id} table={table} selected={table.id === selectedTableId} tileWidth={tileWidth} onSelectTable={onSelectTable} />
          ))}
        </View>
      )}
    </View>
  );
}

function TableTile({
  table,
  selected,
  tileWidth,
  onSelectTable
}: {
  table: HubBootstrap["tables"][number];
  selected: boolean;
  tileWidth: number;
  onSelectTable: (tableId: string) => void;
}) {
  const state = getTableDisplayState(table);
  return (
    <Pressable
      style={[
        styles.tableTile,
        { width: tileWidth },
        state === "running" && styles.busyTable,
        state === "bill_printed" && styles.billedTable,
        selected && styles.selectedTable
      ]}
      onPress={() => onSelectTable(table.id)}
    >
      <Text style={styles.tableName} numberOfLines={1}>{table.name}</Text>
      <Text style={[styles.tableStatus, state !== "free" && styles.tableStatusBusy, state === "bill_printed" && styles.tableStatusBilled]}>
        {tableDisplayLabel(state)}
      </Text>
    </Pressable>
  );
}

function MenuScreen({
  selectedTableName,
  visibleMenu,
  draftTotal,
  searchKey,
  onSearchChange,
  onAddItem
}: {
  selectedTableName: string | null;
  visibleMenu: HubBootstrap["menuItems"];
  draftTotal: number;
  searchKey: string;
  onSearchChange: (value: string) => void;
  onAddItem: (menuItemId: string, variantId?: string) => void;
}) {
  return (
    <View style={[styles.panel, styles.menuPanel]}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Menu</Text>
          <Text style={styles.muted}>{selectedTableName ? `Adding for Table ${selectedTableName}` : "Choose a table first"}</Text>
        </View>
        <Text style={styles.totalText}>Rs {formatRupees(draftTotal)}</Text>
      </View>
      <UncontrolledInput
        inputKey={`search-${searchKey}`}
        label="Search dishes"
        defaultValue=""
        onChangeText={onSearchChange}
        autoCorrect={false}
        returnKeyType="search"
        placeholder="Type dish name"
      />
      {!selectedTableName ? (
        <EmptyState title="No table selected" text="Tap a table, then add dishes here." />
      ) : visibleMenu.length === 0 ? (
        <EmptyState title="No dishes found" text="Try another search or add dishes on the hub." />
      ) : (
        <View style={styles.menuList}>
          {visibleMenu.map((menuItem) => {
            const variants = menuItem.variants?.filter((variant) => Boolean(variant.active)) ?? [];
            const activeVariants = variants.length || menuItem.sale_group_kind === "alcohol" ? variants : [{ id: "", label: "Regular", kind: "default", price_paise: menuItem.price_paise }];
            return (
              <View key={menuItem.id} style={styles.menuItem}>
                <View style={styles.menuText}>
                  <Text style={styles.menuName} numberOfLines={2}>{menuItem.name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{menuItem.production_unit_name ?? "No kitchen assigned"}</Text>
                </View>
                <View style={activeVariants.length > 1 ? styles.variantStack : styles.menuPriceBlock}>
                  {activeVariants.length === 0 ? (
                    <Text style={styles.muted}>Unavailable</Text>
                  ) : (
                    activeVariants.map((variant) => (
                      <Pressable key={variant.id || menuItem.id} style={activeVariants.length > 1 ? styles.variantChip : undefined} onPress={() => onAddItem(menuItem.id, variant.id || undefined)}>
                        <Text style={styles.price}>{variant.kind === "default" ? "" : `${variant.label} `}Rs {formatRupees(variant.price_paise)}</Text>
                        <Text style={styles.addText}>Add</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TicketScreen({
  selectedTableName,
  selectedTableId,
  deviceName,
  pax,
  items,
  sentItems,
  menuItems,
  tables,
  draftTotal,
  tableTotal,
  connection,
  sending,
  canShift,
  onPaxChange,
  onChangeQty,
  onShiftTable,
  onShiftItem,
  onSubmit
}: {
  selectedTableName: string | null;
  selectedTableId: string | null;
  deviceName: string;
  pax: string;
  items: OrderItemInput[];
  sentItems: HubOrder["items"];
  menuItems: HubBootstrap["menuItems"];
  tables: HubBootstrap["tables"];
  draftTotal: number;
  tableTotal: number;
  connection: ConnectionState;
  sending: boolean;
  canShift: boolean;
  onPaxChange: (value: string) => void;
  onChangeQty: (index: number, delta: number) => void;
  onShiftTable: (tableId: string) => void;
  onShiftItem: (orderItemId: string, quantity: number, toTableId: string) => void;
  onSubmit: () => void;
}) {
  const [itemShiftTargetId, setItemShiftTargetId] = useState("");
  const [itemShiftQty, setItemShiftQty] = useState<Record<string, string>>({});
  const canSubmit = Boolean(selectedTableName && items.length > 0 && !sending);
  const shiftTargets = tables.filter((table) => table.id !== selectedTableId && table.status === "free");
  return (
    <View style={styles.panel}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Review</Text>
          <Text style={styles.muted}>{selectedTableName ? `Table ${selectedTableName}` : "No table selected"}</Text>
        </View>
        <Text style={styles.totalText}>Rs {formatRupees(tableTotal)}</Text>
      </View>

      <View style={styles.formStack}>
        <Text style={styles.smallMuted}>Device: {deviceName || "paired waiter phone"}</Text>
        <UncontrolledInput
          inputKey={`pax-${selectedTableName ?? "none"}`}
          label="Pax"
          defaultValue={pax}
          onChangeText={onPaxChange}
          keyboardType="number-pad"
          returnKeyType="done"
        />
      </View>

      <Text style={styles.subhead}>New Items</Text>
      {items.length === 0 ? (
        <EmptyState title="No new dishes" text="Add dishes from the menu. Sent items stay below." compact />
      ) : (
        <View style={styles.ticketList}>
          {items.map((item, index) => {
            const menuItem = menuItems.find((entry) => entry.id === item.menuItemId);
            const variant = findMenuVariant(menuItem, item.menuItemVariantId);
            const lineName = `${menuItem?.name ?? item.menuItemId}${variant && variant.kind !== "default" ? ` ${variant.label}` : ""}`;
            const unitPrice = variant?.price_paise ?? menuItem?.price_paise ?? 0;
            return (
              <View key={`${item.menuItemId}-${item.menuItemVariantId ?? "default"}-${index}`} style={styles.ticketLine}>
                <View style={styles.ticketText}>
                  <Text style={styles.ticketName} numberOfLines={2}>{lineName}</Text>
                  <Text style={styles.muted}>Rs {formatRupees(unitPrice * item.quantity)}</Text>
                </View>
                <View style={styles.qtyControls}>
                  <Pressable style={styles.qtyButton} onPress={() => onChangeQty(index, -1)}>
                    <Text style={styles.qtyText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <Pressable style={styles.qtyButton} onPress={() => onChangeQty(index, 1)}>
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
            <View key={item.id} style={styles.sentLine}>
              <Text style={styles.sentName} numberOfLines={2}>{item.quantity} x {item.name_snapshot}</Text>
              <Text style={styles.muted}>Rs {formatRupees(item.unit_price_paise * item.quantity)}</Text>
            </View>
          ))}
        </View>
      )}

      {selectedTableId && sentItems.length > 0 && canShift ? (
        <>
          <Text style={styles.subhead}>Shift Table Or Items</Text>
          {shiftTargets.length === 0 ? (
            <Text style={styles.smallMuted}>No free table is available for shifting.</Text>
          ) : (
            <>
              <Text style={styles.smallMuted}>Full table</Text>
              <View style={styles.shiftGrid}>
                {shiftTargets.map((table) => (
                  <Pressable key={table.id} style={styles.shiftButton} onPress={() => onShiftTable(table.id)}>
                    <Text style={styles.shiftButtonText}>{table.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.smallMuted}>Selected item</Text>
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>Move item to</Text>
                <View style={styles.shiftGrid}>
                  {shiftTargets.map((table) => (
                    <Pressable key={table.id} style={[styles.shiftButton, itemShiftTargetId === table.id && styles.shiftButtonActive]} onPress={() => setItemShiftTargetId(table.id)}>
                      <Text style={styles.shiftButtonText}>{table.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {sentItems.map((item) => {
                const quantityText = itemShiftQty[item.id] ?? "1";
                const quantity = Math.min(item.quantity, Math.max(1, Number(quantityText.replace(/\D/g, "") || 1)));
                return (
                  <View key={`shift-${item.id}`} style={styles.itemShiftRow}>
                    <Text style={styles.sentName} numberOfLines={2}>{item.name_snapshot}</Text>
                    <TextInput
                      style={styles.shiftQtyInput}
                      value={quantityText}
                      onChangeText={(value) => setItemShiftQty((current) => ({ ...current, [item.id]: value.replace(/\D/g, "").slice(0, 3) }))}
                      keyboardType="number-pad"
                    />
                    <Pressable
                      style={[styles.shiftButton, (!itemShiftTargetId || sending) && styles.buttonDisabled]}
                      disabled={!itemShiftTargetId || sending}
                      onPress={() => onShiftItem(item.id, quantity, itemShiftTargetId)}
                    >
                      <Text style={styles.shiftButtonText}>Move</Text>
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}
        </>
      ) : selectedTableId && sentItems.length > 0 ? (
        <Text style={styles.smallMuted}>Only captain devices can shift tables or items.</Text>
      ) : null}

      <View style={styles.totalStrip}>
        <Text style={styles.totalLabel}>New Rs {formatRupees(draftTotal)}</Text>
        <Text style={styles.totalLabel}>Table Rs {formatRupees(tableTotal)}</Text>
      </View>
      <Pressable style={[styles.primaryButton, styles.sendButton, !canSubmit && styles.buttonDisabled]} onPress={onSubmit} disabled={!canSubmit}>
        <Text style={styles.primaryButtonText}>{sending ? "Sending..." : connection === "online" ? "Send New Items" : "Save Draft"}</Text>
      </Pressable>
    </View>
  );
}

function DraftBar({ count, total, onReview }: { count: number; total: number; onReview: () => void }) {
  return (
    <View style={styles.draftBar}>
      <View>
        <Text style={styles.draftBarTitle}>{count} new item{count === 1 ? "" : "s"}</Text>
        <Text style={styles.draftBarMeta}>Rs {formatRupees(total)} ready to review</Text>
      </View>
      <Pressable style={styles.draftBarButton} onPress={onReview}>
        <Text style={styles.draftBarButtonText}>Review</Text>
      </Pressable>
    </View>
  );
}

function UncontrolledInput({
  inputKey,
  label,
  defaultValue,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  returnKeyType,
  placeholder,
  multiline
}: {
  inputKey: string;
  label: string;
  defaultValue: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "number-pad" | "url";
  returnKeyType?: "done" | "next" | "search";
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        key={inputKey}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.multilineInput]}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        placeholder={placeholder}
        placeholderTextColor="#81786b"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
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

function normaliseHubUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "http://192.168.1.10:3737";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function normalisePax(value: string) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function findMenuVariant(menuItem: HubBootstrap["menuItems"][number] | undefined, variantId: string | undefined) {
  const variants = menuItem?.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}

function formatRupees(paise: number) {
  return (paise / 100).toFixed(0);
}

const palette = {
  ink: "#191815",
  muted: "#6f675d",
  paper: "#fffdf8",
  wash: "#f2ecdf",
  line: "#d8cebd",
  green: "#14665d",
  greenSoft: "#e5f3ed",
  amber: "#986022",
  amberSoft: "#fff0d6",
  red: "#a83a2f",
  redSoft: "#fff0ed"
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.wash },
  keyboardShell: { flex: 1 },
  loadingShell: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: palette.ink, fontWeight: "800" },
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 118, gap: 12 },
  onboardingContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34, gap: 12 },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: palette.paper,
    borderBottomWidth: 1,
    borderColor: palette.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  headerText: { flex: 1, minWidth: 0 },
  headerActions: { alignItems: "flex-end", gap: 6 },
  flexText: { flex: 1, minWidth: 0 },
  kicker: { color: palette.green, fontWeight: "800", fontSize: 11, textTransform: "uppercase", letterSpacing: 0 },
  title: { fontSize: 23, fontWeight: "900", color: palette.ink },
  heroTitle: { color: palette.ink, fontSize: 25, fontWeight: "900", lineHeight: 31 },
  heroCopy: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  muted: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  smallMuted: { color: palette.muted, fontSize: 12, lineHeight: 18, paddingVertical: 4 },
  heroPanel: {
    borderRadius: 10,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 7
  },
  stepCard: {
    padding: 14,
    gap: 12,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10
  },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  stepCircleText: { color: "#fffdfa", fontWeight: "900" },
  banner: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#fbf6eb",
    borderRadius: 10,
    padding: 12,
    gap: 3
  },
  bannerWarning: { borderColor: "#e4c17d", backgroundColor: palette.amberSoft },
  bannerText: { color: palette.ink, fontWeight: "800", lineHeight: 20 },
  bannerMeta: { color: palette.green, fontSize: 12, fontWeight: "800" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  online: { backgroundColor: palette.green },
  offline: { backgroundColor: palette.red },
  checking: { backgroundColor: palette.amber },
  statusPill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  status_online: { borderColor: "#a7cbc3", backgroundColor: palette.greenSoft },
  status_offline: { borderColor: "#e4b1a6", backgroundColor: palette.redSoft },
  status_checking: { borderColor: "#ead4a9", backgroundColor: palette.amberSoft },
  statusText: { color: palette.ink, fontWeight: "800", fontSize: 11 },
  iconButton: {
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper
  },
  iconButtonText: { color: palette.ink, fontWeight: "800", fontSize: 11 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: palette.ink },
  inputGroup: { gap: 5 },
  inputLabel: { color: palette.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 9,
    paddingHorizontal: 12,
    color: palette.ink,
    backgroundColor: "#fffaf1",
    fontWeight: "700"
  },
  multilineInput: {
    minHeight: 76,
    paddingTop: 11,
    paddingBottom: 11
  },
  buttonStack: { gap: 8 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 9,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: { color: "#fffdfa", fontWeight: "900" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: palette.paper
  },
  secondaryButtonText: { color: palette.ink, fontWeight: "900" },
  scanButton: {
    minHeight: 62,
    borderRadius: 10,
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  scanButtonText: { color: "#fffdfa", fontSize: 17, fontWeight: "900" },
  scanButtonMeta: { color: "#d6f1e9", fontSize: 12, fontWeight: "800" },
  modeTabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 10,
    backgroundColor: "#e6ded0",
    borderWidth: 1,
    borderColor: palette.line
  },
  modeTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  modeTabActive: { backgroundColor: palette.ink },
  modeTabText: { color: palette.ink, fontWeight: "900" },
  modeTabTextActive: { color: "#fffdfa" },
  workArea: { gap: 12 },
  workAreaWide: { flexDirection: "row", alignItems: "flex-start" },
  panel: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    backgroundColor: palette.paper,
    padding: 14,
    gap: 12
  },
  menuPanel: { flex: 1 },
  tableGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tableTile: {
    minHeight: 82,
    padding: 12,
    borderWidth: 2,
    borderColor: "#a8cdbf",
    borderRadius: 10,
    backgroundColor: "#f5fff9",
    justifyContent: "space-between"
  },
  busyTable: { borderColor: "#d08a4d", backgroundColor: palette.amberSoft },
  billedTable: { borderColor: "#78a6dd", backgroundColor: "#eef6ff" },
  selectedTable: { borderColor: palette.green, backgroundColor: palette.greenSoft },
  tableName: { fontSize: 21, fontWeight: "900", color: palette.ink },
  tableStatus: { color: palette.green, fontWeight: "900", fontSize: 12 },
  tableStatusBusy: { color: palette.amber },
  tableStatusBilled: { color: "#2867b2" },
  shiftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shiftButton: {
    minHeight: 42,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#eef6ff",
    borderWidth: 1,
    borderColor: "#78a6dd",
    alignItems: "center",
    justifyContent: "center"
  },
  shiftButtonActive: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  shiftButtonText: { color: "#1b4d84", fontWeight: "900" },
  fieldBlock: { gap: 8 },
  itemShiftRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fffaf1",
    borderRadius: 10,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  shiftQtyInput: {
    width: 54,
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#cfc4b2",
    borderRadius: 9,
    textAlign: "center",
    color: palette.ink,
    fontWeight: "900",
    backgroundColor: palette.paper
  },
  totalText: { color: palette.green, fontSize: 19, fontWeight: "900" },
  menuList: { gap: 8 },
  menuItem: {
    minHeight: 72,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fbf6eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  menuText: { flex: 1, minWidth: 0 },
  menuName: { fontSize: 16, fontWeight: "900", color: palette.ink, lineHeight: 20 },
  menuPriceBlock: { alignItems: "flex-end", gap: 4 },
  variantStack: { minWidth: 124, gap: 6, alignItems: "stretch" },
  variantChip: {
    borderWidth: 1,
    borderColor: "#d8cdbb",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "flex-end",
    backgroundColor: "#fffaf0"
  },
  price: { color: palette.green, fontWeight: "900" },
  addText: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  formStack: { gap: 9 },
  subhead: { color: palette.ink, fontWeight: "900", fontSize: 13, textTransform: "uppercase", letterSpacing: 0 },
  ticketList: { gap: 8 },
  ticketLine: {
    minHeight: 74,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5dccd",
    backgroundColor: "#fffaf1",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  ticketText: { flex: 1, minWidth: 0 },
  ticketName: { color: palette.ink, fontWeight: "900", fontSize: 15, lineHeight: 19 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyButton: {
    width: 42,
    height: 42,
    borderRadius: 9,
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
  sentName: { color: palette.ink, fontWeight: "800", flex: 1, lineHeight: 18 },
  totalStrip: {
    borderRadius: 10,
    backgroundColor: palette.greenSoft,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  totalLabel: { color: palette.green, fontWeight: "900" },
  sendButton: { minHeight: 54 },
  buttonDisabled: { opacity: 0.45 },
  draftBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "android" ? 14 : 24,
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: palette.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  draftBarTitle: { color: "#fffdfa", fontWeight: "900", fontSize: 15 },
  draftBarMeta: { color: "#dfd7c7", fontSize: 12, fontWeight: "700", marginTop: 2 },
  draftBarButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#fffdfa",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  draftBarButtonText: { color: palette.ink, fontWeight: "900" },
  empty: {
    minHeight: 120,
    borderRadius: 10,
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
