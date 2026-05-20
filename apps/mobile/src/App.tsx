import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  UIManager,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { SaleGroupKind } from "@gaurav-pos/shared";
import { HubClient, type CurrentDaySummary, type DailyReportDetail, type DailyReportRow, type HubBootstrap, type HubOrder, type KdsTicket } from "./lib/hub-client";
import { getMobileServiceViewModel } from "./lib/mobile-app-view-model";
import { palette, styles } from "./styles/app-styles";
import { AppHeader, ConnectionBanner, DraftBar, ModeTabs, OnboardingScreen } from "./components/app-shell";
import { PairingScannerModal } from "./components/pairing-scanner-modal";
import { BillingHistoryPanel, KitchenScreen, MenuScreen, TablePicker, TicketScreen } from "./components/screens";
import type { ConnectionState, ViewMode } from "./lib/mobile-types";
import { useBillingHistoryActions } from "./hooks/use-billing-history-actions";
import { useBillPrinterChooser } from "./hooks/use-bill-printer-chooser";
import { useDevicePairing } from "./hooks/use-device-pairing";
import { useKitchenActions } from "./hooks/use-kitchen-actions";
import { useMobileChime } from "./hooks/use-mobile-chime";
import { useMobileHubRefresh } from "./hooks/use-mobile-hub-refresh";
import { useOperationKeys } from "./hooks/use-operation-keys";
import { useOrderDraft } from "./hooks/use-order-draft";
import { useTableServiceActions } from "./hooks/use-table-service-actions";
import {
  nextConnectionAfterDevicePairing,
  shouldShowMobileOnboarding
} from "./lib/connection-health";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 780;

  const [initializing, setInitializing] = useState(true);
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("");
  const [deviceRole, setDeviceRoleState] = useState("");
  const [deviceName, setDeviceNameState] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("Checking hub connection...");
  const connectionFailuresRef = useRef(0);
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
    onDevicePaired: () => {
      const next = nextConnectionAfterDevicePairing();
      connectionFailuresRef.current = next.failures;
      setConnection(next.connection);
    },
  });
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [currentOrder, setCurrentOrder] = useState<HubOrder | null>(null);
  const [currentSummary, setCurrentSummary] = useState<CurrentDaySummary | null>(null);
  const [dailyReports, setDailyReports] = useState<DailyReportRow[]>([]);
  const [selectedHistoryDayId, setSelectedHistoryDayId] = useState<string | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<DailyReportDetail | null>(null);
  const [kitchenUnitId, setKitchenUnitId] = useState("");
  const [kdsTickets, setKdsTickets] = useState<KdsTicket[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuGroupFilter, setMenuGroupFilter] = useState<SaleGroupKind | null>(null);
  const [mode, setMode] = useState<ViewMode>("tables");
  const { operationKey, clearOperationKey } = useOperationKeys();
  const { notifyChime, chimeForNewKdsTickets } = useMobileChime();
  const client = useMemo(() => new HubClient(hubUrl, deviceToken), [deviceToken, hubUrl]);
  const {
    selectedTableId,
    setSelectedTableId,
    pax,
    setPax,
    items,
    savingDraft,
    selectTable,
    persistDraft,
    addItem,
    changeQty,
    changeItemNote,
    clearSelectedTableDraft,
  } = useOrderDraft({
    connection,
    loadTableOrder,
    setCurrentOrder,
    setMode,
    setMessage,
  });
  const { refresh } = useMobileHubRefresh({
    client,
    initializing,
    hubUrl,
    deviceToken,
    connection,
    bootstrap,
    kitchenUnitId,
    selectedHistoryDayId,
    selectedTableId,
    connectionFailuresRef,
    hydrateDrafts,
    loadTableOrder,
    notifyChime,
    chimeForNewKdsTickets,
    setInitializing,
    setHubUrlState,
    setDeviceTokenState,
    setDeviceRoleState,
    setDeviceNameState,
    setConnection,
    setLoading,
    setMessage,
    setBootstrap,
    setCurrentOrder,
    setCurrentSummary,
    setDailyReports,
    setSelectedHistoryDayId,
    setSelectedHistoryDetail,
    setKitchenUnitId,
    setKdsTickets,
  });

  const { chooseBillPrinter } = useBillPrinterChooser({ client, setMessage });
  const {
    printHistoryBill,
    editHistoryBill,
    selectHistoryDay,
  } = useBillingHistoryActions({
    client,
    deviceName,
    chooseBillPrinter,
    operationKey,
    clearOperationKey,
    refresh,
    selectedHistoryDayId,
    setSelectedHistoryDayId,
    setSelectedHistoryDetail,
    setSending,
    setMessage,
  });
  const { selectKitchenUnit, changeKotStatus } = useKitchenActions({
    client,
    connection,
    kitchenUnitId,
    setKitchenUnitId,
    setKdsTickets,
    setLoading,
    setSending,
    setMessage,
    chimeForNewKdsTickets,
  });
  const {
    selectedTable,
    activeTables,
    sentItems,
    draftTotal,
    tableTotal,
    hasNewItems,
    hasMenuSearch,
    saleGroupFilters,
    activeMenuGroup,
    visibleMenu,
    activeKdsUnits,
  } = getMobileServiceViewModel({
    bootstrap,
    selectedTableId,
    currentOrder,
    draftItems: items,
    menuSearch,
    menuGroupFilter,
  });
  const canBill = deviceRole === "admin" || deviceRole === "captain";
  const historyMode = mode === "history" && canBill;
  const isKitchenDevice = deviceRole === "kitchen";
  const shouldShowOnboarding = shouldShowMobileOnboarding({ setupOpen, deviceToken, connection });
  const useVirtualMenu = mode === "menu" && !isWide;
  const {
    submitOrder,
    shiftTable,
    shiftItem,
    generateBillForSelectedTable,
    saveOrderStateForSelectedTable,
    reprintSelectedBill,
    markSelectedBillNc,
    settleSelectedBill,
    reviseSelectedBill,
  } = useTableServiceActions({
    client,
    connection,
    currentOrder,
    deviceName,
    hasNewItems,
    items,
    menuItems: bootstrap?.menuItems ?? [],
    operationKey,
    clearOperationKey,
    pax,
    persistDraft,
    clearSelectedTableDraft,
    refresh,
    loadTableOrder,
    chooseBillPrinter,
    selectedTableId,
    sentItems,
    sending,
    setMessage,
    setMode,
    setSelectedTableId,
    setSending,
  });

  useEffect(() => {
    if (!canBill && mode === "history") setMode("tables");
  }, [canBill, mode]);

  async function loadTableOrder(tableId: string) {
    try {
      setCurrentOrder(await client.tableOrder(tableId));
    } catch (error) {
      setCurrentOrder(null);
      setMessage(error instanceof Error ? error.message : "Could not load table order.");
    }
  }

  if (initializing) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingShell}>
            <ActivityIndicator size="large" color={palette.green} />
            <Text style={styles.loadingText}>Opening POS app...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
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
          onChangeQty={changeQty}
          onChangeItemNote={changeItemNote}
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
    <SafeAreaProvider>
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

        <PairingScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScannedPayload={(data) => void handleScannedPayload(data)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
