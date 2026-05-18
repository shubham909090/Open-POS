import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  StatusBar,
  Text,
  TextInput,
  UIManager,
  Vibration,
  useWindowDimensions,
  View
} from "react-native";
import { CameraView } from "expo-camera";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { getTableDisplayState, searchMenuItems, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";
import { HubClient, type CurrentDaySummary, type DailyReportDetail, type DailyReportRow, type HubBootstrap, type HubOrder, type KdsTicket } from "./lib/hub-client";
import { clearDraft, getDeviceToken, getHubUrl, loadDraft, saveDraft } from "./lib/draft-store";
import {
  approvalPayload,
  createOperationKey,
  findMenuVariant,
  normalisePax,
  stableStringify
} from "./lib/mobile-format";
import { palette, styles } from "./styles/app-styles";
import { AppHeader, ConnectionBanner, DraftBar, ModeTabs, OnboardingScreen } from "./components/app-shell";
import { BillingHistoryPanel, KitchenScreen, MenuScreen, TablePicker, TicketScreen } from "./components/screens";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode, ViewMode } from "./lib/mobile-types";
import { useDevicePairing } from "./hooks/use-device-pairing";
import { MOBILE_REALTIME_REFRESH_DEBOUNCE_MS, MOBILE_REFRESH_INTERVAL_MS, nextConnectionAfterRefresh } from "./lib/connection-health";

type HistoryEditPayloadItem =
  | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
  | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number };

const POS_CHIME_SOURCE =
  "data:audio/wav;base64,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";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  const chimePlayer = useAudioPlayer(POS_CHIME_SOURCE, { updateInterval: 1000 });
  const { width } = useWindowDimensions();
  const isWide = width >= 780;
  const contentWidth = Math.max(320, width - 32);
  const tablePanelWidth = isWide ? Math.min(360, Math.floor(contentWidth * 0.34)) : contentWidth;
  const tableColumns = isWide && tablePanelWidth >= 340 ? 2 : 1;
  const tableGridGap = 12;
  const tableTileWidth = Math.floor((tablePanelWidth - 28 - tableGridGap * (tableColumns - 1)) / tableColumns);

  const [initializing, setInitializing] = useState(true);
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("");
  const [deviceRole, setDeviceRoleState] = useState("");
  const [deviceName, setDeviceNameState] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [message, setMessage] = useState("Checking hub connection...");
  const {
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
  } = useDevicePairing({
    setHubUrlState,
    setDeviceTokenState,
    setDeviceRoleState,
    setDeviceNameState,
    setMessage,
  });
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<HubOrder | null>(null);
  const [currentSummary, setCurrentSummary] = useState<CurrentDaySummary | null>(null);
  const [dailyReports, setDailyReports] = useState<DailyReportRow[]>([]);
  const [selectedHistoryDayId, setSelectedHistoryDayId] = useState<string | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<DailyReportDetail | null>(null);
  const [kitchenUnitId, setKitchenUnitId] = useState("");
  const [kdsTickets, setKdsTickets] = useState<KdsTicket[]>([]);
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [kotNote, setKotNote] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [menuGroupFilter, setMenuGroupFilter] = useState<SaleGroupKind | null>(null);
  const [mode, setMode] = useState<ViewMode>("tables");
  const operationKeysRef = useRef<Record<string, string>>({});
  const knownKdsTicketIdsRef = useRef<{ unitId: string; ids: Set<string>; initialized: boolean }>({ unitId: "", ids: new Set(), initialized: false });
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const connectionFailuresRef = useRef(0);

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
  const canBill = deviceRole === "admin" || deviceRole === "captain";
  const historyMode = mode === "history" && canBill;
  const isKitchenDevice = deviceRole === "kitchen";
  const shouldShowOnboarding = setupOpen || !deviceToken || connection === "offline";
  const useVirtualMenu = mode === "menu" && !isWide;

  const hasMenuSearch = menuSearch.trim().length > 0;
  const saleGroupFilters = Array.from(
    new Map(
      (bootstrap?.menuItems ?? [])
        .filter((item) => Boolean(item.active) && Boolean(item.sale_group_kind))
        .map((item) => [item.sale_group_kind as SaleGroupKind, item.sale_group_name ?? item.sale_group_kind ?? "Other"])
    ).entries()
  );
  const activeMenuGroup = menuGroupFilter ?? saleGroupFilters[0]?.[0] ?? null;
  const menuFilters = { saleGroupKind: activeMenuGroup ?? undefined };
  const visibleMenu = searchMenuItems(bootstrap?.menuItems ?? [], menuSearch, menuFilters).slice(0, 120);
  const activeKdsUnits = (bootstrap?.productionUnits ?? []).filter((unit) => unit.active !== false && unit.active !== 0 && unit.kds_enabled !== false && unit.kds_enabled !== 0);

  function operationKey(prefix: string, scope: unknown) {
    const mapKey = `${prefix}:${stableStringify(scope)}`;
    operationKeysRef.current[mapKey] ??= createOperationKey(prefix);
    return operationKeysRef.current[mapKey];
  }

  function clearOperationKey(prefix: string, scope: unknown) {
    delete operationKeysRef.current[`${prefix}:${stableStringify(scope)}`];
  }

  useEffect(() => {
    let alive = true;
    async function hydrate() {
      const [savedHubUrl, savedToken] = await Promise.all([getHubUrl(), getDeviceToken()]);
      if (!alive) return;
      setHubUrlState(savedHubUrl);
      setDeviceTokenState(savedToken);
      hydrateDrafts(savedHubUrl, savedToken);
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
    const interval = setInterval(() => void refresh(false), MOBILE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [client, initializing, kitchenUnitId, selectedHistoryDayId, selectedTableId]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initializing || !deviceToken) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = client.subscribeRealtime(() => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh(false);
      }, MOBILE_REALTIME_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [client, deviceToken, initializing, kitchenUnitId, selectedHistoryDayId, selectedTableId]);

  useEffect(() => {
    if (!canBill && mode === "history") setMode("tables");
  }, [canBill, mode]);

  async function refresh(showSpinner = true) {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      await runRefresh(showSpinner);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refresh(false);
      }
    }
  }

  async function runRefresh(showSpinner = true) {
    if (showSpinner) setLoading(true);
    if (showSpinner && !bootstrap) setConnection("checking");
    try {
      if (!deviceToken) {
        const isOnline = await client.health();
        setConnection(isOnline ? "checking" : "offline");
        if (isOnline) return;
        setMessage("Hub is not reachable. Check Wi-Fi and hub address. Drafts stay on this phone.");
        return;
      }

      const [nextBootstrap, session] = await Promise.all([client.bootstrap(), client.me()]);
      const healthy = nextConnectionAfterRefresh({
        success: true,
        previous: connection,
        failures: connectionFailuresRef.current,
        hasBootstrap: Boolean(bootstrap),
        showSpinner
      });
      connectionFailuresRef.current = healthy.failures;
      setConnection(healthy.connection);
      setBootstrap(nextBootstrap);
      setDeviceNameState(session.name);
      setDeviceRoleState(session.role);
      if (session.role === "kitchen") {
        const kitchenUnits = nextBootstrap.productionUnits.filter((unit) => unit.active !== false && unit.active !== 0 && unit.kds_enabled !== false && unit.kds_enabled !== 0);
        const nextUnitId = kitchenUnits.some((unit) => unit.id === kitchenUnitId) ? kitchenUnitId : kitchenUnits[0]?.id ?? "";
        const nextTickets = nextUnitId ? await client.kds(nextUnitId) : [];
        chimeForNewKdsTickets(nextUnitId, nextTickets);
        setKitchenUnitId(nextUnitId);
        setCurrentSummary(null);
        setDailyReports([]);
        setSelectedHistoryDetail(null);
        setCurrentOrder(null);
        setKdsTickets(nextTickets);
        setMessage(nextUnitId ? `Kitchen screen connected for ${kitchenUnits.find((unit) => unit.id === nextUnitId)?.name ?? "selected counter"}.` : "No enabled kitchen screen is available. Enable KDS on the hub setup screen.");
        return;
      }
      if (session.role === "admin" || session.role === "captain") {
        try {
          const [summary, reports] = await Promise.all([client.currentBusinessDaySummary(), client.dailyReports()]);
          setCurrentSummary(summary);
          setDailyReports(reports);
          if (selectedHistoryDayId) {
            try {
              setSelectedHistoryDetail(await client.dailyReport(selectedHistoryDayId));
            } catch {
              setSelectedHistoryDayId(null);
              setSelectedHistoryDetail(null);
            }
          } else {
            setSelectedHistoryDetail(null);
          }
        } catch {
          setCurrentSummary(null);
          setDailyReports([]);
          setSelectedHistoryDetail(null);
        }
      } else {
        setCurrentSummary(null);
        setDailyReports([]);
        setSelectedHistoryDetail(null);
      }
      await checkReadyNotifications();
      setMessage(`Connected. Business day ${nextBootstrap.currentBusinessDay.business_date} is active.`);
      if (selectedTableId) await loadTableOrder(selectedTableId);
    } catch (error) {
      const next = nextConnectionAfterRefresh({
        success: false,
        previous: connection,
        failures: connectionFailuresRef.current,
        hasBootstrap: Boolean(bootstrap),
        showSpinner
      });
      connectionFailuresRef.current = next.failures;
      setConnection(next.connection);
      setMessage(
        next.shouldShowOfflineMessage
          ? error instanceof Error ? error.message : "Could not reach the hub."
          : "Connection hiccup. Keeping latest hub data while the phone reconnects."
      );
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
        notifyChime();
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

  function notifyChime() {
    void chimePlayer.seekTo(0).then(() => chimePlayer.play()).catch(() => undefined);
    Vibration.vibrate([0, 180, 80, 180]);
  }

  function chimeForNewKdsTickets(unitId: string, nextTickets: KdsTicket[]) {
    const previous = knownKdsTicketIdsRef.current.unitId === unitId ? knownKdsTicketIdsRef.current.ids : new Set<string>();
    const initialized = knownKdsTicketIdsRef.current.unitId === unitId && knownKdsTicketIdsRef.current.initialized;
    const nextIds = new Set(nextTickets.map((ticket) => ticket.id));
    if (initialized && nextTickets.some((ticket) => !previous.has(ticket.id))) notifyChime();
    knownKdsTicketIdsRef.current = { unitId, ids: nextIds, initialized: Boolean(unitId) };
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

  function confirmSendKot(printMode: PrintMode): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(printMode === "kot" ? "Save KOT?" : "Print and KOT?", orderSummary(), [
        { text: "Review", style: "cancel", onPress: () => resolve(false) },
        { text: printMode === "kot" ? "KOT" : "Print and KOT", onPress: () => resolve(true) }
      ]);
    });
  }

  async function submitOrder(printMode: PrintMode) {
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
    if (!(await confirmSendKot(printMode))) return;

    try {
      setSending(true);
      const input = {
        tableId: selectedTableId,
        pax: normalisePax(pax),
        orderType: "dine_in" as const,
        printMode,
        note: kotNote.trim() || undefined,
        items
      };
      const scope = { tableId: selectedTableId, items, pax: normalisePax(pax), printMode, note: kotNote.trim() };
      await client.submitOrder(input, { idempotencyKey: operationKey("mobile-order", scope) });
      clearOperationKey("mobile-order", scope);
      await clearDraft(selectedTableId);
      setItems([]);
      setKotNote("");
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMode("ticket");
      setMessage(printMode === "kot" ? "KOT saved. New items are cleared; sent items stay on the table check." : "Print and KOT sent. New items are cleared; sent items stay on the table check.");
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
      setMessage("Table transferred. Source and target checks have been refreshed.");
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
      setMessage("Item quantity transferred. The table checks have been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shift item.");
    } finally {
      setSending(false);
    }
  }

  async function generateBillForSelectedTable() {
    if (!currentOrder?.order || !selectedTableId) {
      setMessage("Send items first, then generate the bill.");
      return;
    }
    try {
      setSending(true);
      const scope = { orderId: currentOrder.order.id };
      await client.generateBill(currentOrder.order.id, { idempotencyKey: operationKey("mobile-bill-generate", scope) });
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Bill generated and print queued for this table.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate bill.");
    } finally {
      setSending(false);
    }
  }

  async function saveOrderStateForSelectedTable(
    saveMode: OrderStateSaveMode,
    stateItems: MobileOrderStateItem[],
    managerApproval?: { pin: string; reason: string }
  ) {
    if (!currentOrder?.order || !selectedTableId) {
      setMessage("Choose a running or billed table first.");
      return;
    }
    try {
      setSending(true);
      const approval = managerApproval ? approvalPayload(managerApproval.pin, managerApproval.reason, deviceName).managerApproval : undefined;
      const scope = { orderId: currentOrder.order.id, saveMode, stateItems, approval };
      await client.updateOrderState(
        currentOrder.order.id,
        { saveMode, items: stateItems, ...(approval ? { managerApproval: approval } : {}) },
        { idempotencyKey: operationKey("mobile-order-state", scope) }
      );
      clearOperationKey("mobile-order-state", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage(saveMode === "save" ? "Table state saved. No KDS or print update was sent." : "Table state saved and modification tickets were sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save table state.");
    } finally {
      setSending(false);
    }
  }

  async function reprintSelectedBill(pin: string, reason: string) {
    if (!currentOrder?.bill) {
      setMessage("Generate the bill before reprinting.");
      return;
    }
    try {
      setSending(true);
      const payload = approvalPayload(pin, reason, deviceName);
      const scope = { billId: currentOrder.bill.id, payload };
      await client.reprintBill(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-reprint", scope) });
      clearOperationKey("mobile-bill-reprint", scope);
      setMessage("Bill reprint queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reprint bill.");
    } finally {
      setSending(false);
    }
  }

  async function printHistoryBill(billId: string) {
    try {
      setSending(true);
      await client.historyReprintBill(billId, { idempotencyKey: operationKey("mobile-history-reprint", { billId }) });
      clearOperationKey("mobile-history-reprint", { billId });
      setMessage("History bill print queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not print history bill.");
    } finally {
      setSending(false);
    }
  }

  async function editHistoryBill(billId: string, items: HistoryEditPayloadItem[], masterPin: string): Promise<boolean> {
    try {
      setSending(true);
      const payload = {
        masterApproval: { pin: masterPin, reason: "Owner history edit", approvedBy: deviceName || "owner" },
        items
      };
      const scope = { billId, payload };
      await client.historyEditBill(billId, payload, { idempotencyKey: operationKey("mobile-history-edit", scope) });
      clearOperationKey("mobile-history-edit", scope);
      await refresh(false);
      if (selectedHistoryDayId) setSelectedHistoryDetail(await client.dailyReport(selectedHistoryDayId));
      setMessage("History bill edited and updated bill print queued.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not edit history bill.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function selectHistoryDay(posDayId: string | null) {
    setSelectedHistoryDayId(posDayId);
    if (!posDayId) {
      setSelectedHistoryDetail(null);
      return;
    }
    try {
      setSending(true);
      setSelectedHistoryDetail(await client.dailyReport(posDayId));
    } catch (error) {
      setSelectedHistoryDetail(null);
      setMessage(error instanceof Error ? error.message : "Could not load order history for that day.");
    } finally {
      setSending(false);
    }
  }

  async function markSelectedBillNc(pin: string, reason: string) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before marking NC.");
      return;
    }
    try {
      setSending(true);
      const payload = approvalPayload(pin, reason, deviceName);
      const scope = { billId: currentOrder.bill.id, payload };
      await client.markBillNc(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-nc", scope) });
      clearOperationKey("mobile-bill-nc", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("NC bill saved and print queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark NC bill.");
    } finally {
      setSending(false);
    }
  }

  async function settleSelectedBill(input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{ method: PaymentMethod; amountPaise: number; reference?: string }>;
  }) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before taking payment.");
      return;
    }
    try {
      setSending(true);
      const scope = { billId: currentOrder.bill.id, existingPaid: currentOrder.bill.paid_paise ?? 0, input };
      await client.settleBill(currentOrder.bill.id, input, { idempotencyKey: operationKey("mobile-bill-settle", scope) });
      clearOperationKey("mobile-bill-settle", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Payment saved. Table status has been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not punch bill.");
    } finally {
      setSending(false);
    }
  }

  async function reviseSelectedBill(pin: string, reason: string) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before revising.");
      return;
    }
    if (!items.length && !sentItems.length) {
      setMessage("Add new dishes before revising this bill.");
      return;
    }
    const existingItems = sentItems.map((item) =>
      item.menu_item_id
        ? {
            orderItemId: item.id,
            menuItemId: item.menu_item_id,
            menuItemVariantId: item.menu_item_variant_id ?? undefined,
            quantity: item.quantity
          }
        : {
            orderItemId: item.id,
            openName: item.name_snapshot,
            openPricePaise: item.unit_price_paise,
            saleGroupId: item.sale_group_id ?? "sg-food",
            productionUnitId: item.production_unit_id ?? null,
            quantity: item.quantity
          }
    );
    const newItems = items
      .filter((item): item is OrderItemInput & { menuItemId: string } => Boolean(item.menuItemId))
      .map((item) => ({
        menuItemId: item.menuItemId,
        menuItemVariantId: item.menuItemVariantId,
        quantity: item.quantity
      }));
    try {
      setSending(true);
      const payload = {
        ...approvalPayload(pin, reason, deviceName),
        items: [...existingItems, ...newItems]
      };
      const scope = { billId: currentOrder.bill.id, payload };
      await client.reviseBill(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-revise", scope) });
      clearOperationKey("mobile-bill-revise", scope);
      await clearDraft(selectedTableId);
      setItems([]);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Bill revised. Latest bill is ready for payment or print.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revise bill.");
    } finally {
      setSending(false);
    }
  }

  async function selectKitchenUnit(unitId: string) {
    setKitchenUnitId(unitId);
    if (connection !== "online") return;
    try {
      setLoading(true);
      const tickets = await client.kds(unitId);
      chimeForNewKdsTickets(unitId, tickets);
      setKdsTickets(tickets);
      setMessage("Kitchen tickets refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load kitchen tickets.");
    } finally {
      setLoading(false);
    }
  }

  async function changeKotStatus(kotId: string, status: "preparing" | "ready" | "served") {
    if (!kitchenUnitId) {
      setMessage("Choose a kitchen counter first.");
      return;
    }
    try {
      setSending(true);
      await client.updateKotStatus(kotId, status);
      setKdsTickets(await client.kds(kitchenUnitId));
      setMessage(status === "ready" ? "Ticket marked ready. Captain has been notified." : `Ticket marked ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update kitchen ticket.");
    } finally {
      setSending(false);
    }
  }

  if (initializing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingShell}>
          <ActivityIndicator size="large" color={palette.green} />
          <Text style={styles.loadingText}>Opening POS app...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const workArea = (
    <View style={[styles.workArea, isWide && !historyMode && styles.workAreaWide, useVirtualMenu && styles.workAreaMenuOnly]}>
      {!historyMode && (mode === "tables" || isWide) && (
        <TablePicker
          activeTables={activeTables}
          floors={bootstrap?.floors ?? []}
          selectedTableId={selectedTableId}
          loading={loading}
          tileWidth={tableTileWidth}
          onSelectTable={(tableId) => void selectTable(tableId)}
        />
      )}
      {!historyMode && (mode === "menu" || isWide) && (
        <MenuScreen
          selectedTableName={selectedTable?.name ?? null}
          visibleMenu={visibleMenu}
          saleGroupFilters={saleGroupFilters}
          selectedSaleGroup={activeMenuGroup}
          hasSearch={hasMenuSearch}
          draftTotal={draftTotal}
          searchValue={menuSearch}
          virtualized={useVirtualMenu}
          onSearchChange={setMenuSearch}
          onSaleGroupChange={setMenuGroupFilter}
          onAddItem={addItem}
        />
      )}
      {!historyMode && (mode === "ticket" || isWide) && (
        <TicketScreen
          selectedTableName={selectedTable?.name ?? null}
          deviceName={deviceName}
          pax={pax}
          items={items}
          sentItems={sentItems}
          menuItems={bootstrap?.menuItems ?? []}
          tables={activeTables}
          floors={bootstrap?.floors ?? []}
          selectedTableId={selectedTableId}
          draftTotal={draftTotal}
          tableTotal={tableTotal}
          kotNote={kotNote}
          currentOrder={currentOrder}
          connection={connection}
          sending={sending}
          canShift={deviceRole === "admin" || deviceRole === "captain"}
          canBill={canBill}
          onPaxChange={(value) => {
            const clean = value.replace(/\D/g, "").slice(0, 3);
            setPax(clean);
            void persistDraft(items, clean);
          }}
          onKotNoteChange={setKotNote}
          onChangeQty={changeQty}
          onShiftTable={(tableId) => void shiftTable(tableId)}
          onShiftItem={(orderItemId, quantity, toTableId) => void shiftItem(orderItemId, quantity, toTableId)}
          onGenerateBill={() => void generateBillForSelectedTable()}
          onSaveOrderState={(saveMode, stateItems, approval) => void saveOrderStateForSelectedTable(saveMode, stateItems, approval)}
          onReprintBill={(pin, reason) => void reprintSelectedBill(pin, reason)}
          onMarkNc={(pin, reason) => void markSelectedBillNc(pin, reason)}
          onReviseBill={(pin, reason) => void reviseSelectedBill(pin, reason)}
          onSettleBill={(input) => void settleSelectedBill(input)}
          onSubmit={(printMode) => void submitOrder(printMode)}
        />
      )}
      {historyMode ? (
        <BillingHistoryPanel
          currentSummary={currentSummary}
          dailyReports={dailyReports}
          selectedHistoryDayId={selectedHistoryDayId}
          selectedHistoryDetail={selectedHistoryDetail}
          menuItems={bootstrap?.menuItems ?? []}
          sending={sending}
          onHistoryPrint={(billId) => void printHistoryBill(billId)}
          onHistoryEdit={(billId, historyItems, masterPin) => editHistoryBill(billId, historyItems, masterPin)}
          onSelectHistoryDay={(posDayId) => void selectHistoryDay(posDayId)}
        />
      ) : null}
    </View>
  );

  const serviceContent = isKitchenDevice ? (
    <>
      <ConnectionBanner message={message} savingDraft={false} />
      <KitchenScreen
        units={activeKdsUnits}
        selectedUnitId={kitchenUnitId}
        tickets={kdsTickets}
        loading={loading}
        sending={sending}
        onSelectUnit={(unitId) => void selectKitchenUnit(unitId)}
        onStatusChange={(kotId, status) => void changeKotStatus(kotId, status)}
      />
    </>
  ) : (
    <>
      <ConnectionBanner message={message} savingDraft={savingDraft} />
      <ModeTabs mode={mode} onModeChange={setMode} newItemCount={items.reduce((total, item) => total + item.quantity, 0)} showHistory={canBill} />
      {workArea}
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.wash} />
      <KeyboardAvoidingView style={styles.keyboardShell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <AppHeader
          connection={connection}
          title={isKitchenDevice ? "Kitchen Screen" : selectedTable ? `Table ${selectedTable.name}` : canBill ? "Captain POS" : "Waiter"}
          subtitle={isKitchenDevice ? deviceName || "Kitchen device" : selectedTable ? "Add dishes or review sent items" : "Pick a table to start"}
          onSetupPress={() => openSetup(hubUrl, deviceToken)}
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
            {useVirtualMenu ? (
              <View style={styles.screen}>
                <View style={[styles.screenContent, styles.virtualMenuContent]}>
                  {serviceContent}
                </View>
              </View>
            ) : (
              <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="always">
                {serviceContent}
              </ScrollView>
            )}
            {!isKitchenDevice && hasNewItems && mode !== "ticket" ? (
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
