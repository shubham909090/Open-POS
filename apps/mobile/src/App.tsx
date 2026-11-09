import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { feedbackTiming, type SaleGroupKind } from "@gaurav-pos/shared";
import { HubClient, type CurrentDaySummary, type DailyReportDetail, type DailyReportRow, type HubBootstrap, type HubOrder, type KdsTicket } from "./lib/hub-client";
import { getMobileServiceViewModel } from "./lib/mobile-app-view-model";
import { palette, styles } from "./styles/app-styles";
import { Button } from "./components/ui-primitives";
import { formatRupees } from "./lib/mobile-format";
import { AppHeader, ConnectionBanner, DraftBar, ModeTabs, OnboardingScreen } from "./components/app-shell";
import { PairingScannerModal } from "./components/pairing-scanner-modal";
import { PaymentQrModal } from "./components/payment-qr-modal";
import { BillingHistoryPanel, KitchenScreen, MenuScreen, TablePicker, TicketScreen } from "./components/screens";
import type { ConnectionState, ViewMode } from "./lib/mobile-types";
import { useBillingHistoryActions } from "./hooks/use-billing-history-actions";
import { useBillPrinterChooser } from "./hooks/use-bill-printer-chooser";
import { useDevicePairing } from "./hooks/use-device-pairing";
import { useKitchenActions } from "./hooks/use-kitchen-actions";
import { useMobileChime } from "./hooks/use-mobile-chime";
import { useMobileHubRefresh } from "./hooks/use-mobile-hub-refresh";
import { useOperationKeys } from "./hooks/use-operation-keys";
import { DRAFT_RESTORED_MESSAGE, useOrderDraft } from "./hooks/use-order-draft";
import { useTableServiceActions } from "./hooks/use-table-service-actions";
import { useMobileUpdate } from "./hooks/use-mobile-update";
import { useRestaurantBranding } from "./hooks/use-restaurant-branding";
import { useTableOrderPreference } from "./components/table-screen";
import { BrandingSettings, MobileUpdatePanel, RestaurantShortcutSettings } from "./components/settings-panels";
import {
  nextConnectionAfterDevicePairing,
  shouldShowMobileOnboarding
} from "./lib/connection-health";
import { orderMatchesTable } from "./lib/table-selection";

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [deviceToken, setDeviceTokenState] = useState("");
  const [deviceRole, setDeviceRoleState] = useState("");
  const [deviceName, setDeviceNameState] = useState("");
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("Checking hub connection...");
  useEffect(() => {
    if (message !== DRAFT_RESTORED_MESSAGE && !message.endsWith(" is paired and ready.")) return;
    const timer = setTimeout(() => setMessage((current) => (current === message ? "" : current)), feedbackTiming.successNoticeMs);
    return () => clearTimeout(timer);
  }, [message]);
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
  const [loadedOrder, setCurrentOrder] = useState<HubOrder | null>(null);
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
    draftLoading,
    isCurrentSelection,
    loadTableOrder,
    selectTable,
    persistDraft,
    addItem,
    addOpenItem,
    changeQty,
    changeItemNote,
    clearSelectedTableDraft,
  } = useOrderDraft({
    connection,
    client,
    setCurrentOrder,
    setMode,
    setMessage,
  });
  const currentOrder = isCurrentSelection() && orderMatchesTable(loadedOrder, selectedTableId) ? loadedOrder : null;
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

  const { tableOrder, setTableOrder } = useTableOrderPreference();
  const mobileUpdate = useMobileUpdate();
  const restaurantBranding = useRestaurantBranding({ client, hubUrl, online: Boolean(deviceToken) && connection === "online", deviceName });
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
    draftQuantitiesByMenuItemId,
    draftSelectionLabelsByMenuItemId,
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
  const useVirtualMenu = mode === "menu";
  const license = bootstrap?.setup?.license;
  const licenseBlocked = license?.status === "locked" || license?.status === "missing";
  const licenseWarning = license?.status === "warning";
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
    selectedTableName: selectedTable?.name ?? null,
    isCurrentSelection,
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

  useEffect(() => {
    if (shouldShowOnboarding) setPaymentQrOpen(false);
  }, [shouldShowOnboarding]);

  if (initializing || (deviceToken && !bootstrap && connection === "checking")) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingShell}>
            <ActivityIndicator size="large" color={palette.green} />
            <Text style={styles.loadingText}>{initializing ? "Opening POS app…" : "Connecting to your hub…"}</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const workArea = draftLoading && mode !== "tables" ? (
    <View style={styles.loadingShell} accessibilityRole="progressbar">
      <ActivityIndicator color={palette.green} />
      <Text style={styles.muted}>Loading this table…</Text>
    </View>
  ) : (
    <View style={[styles.workArea, (useVirtualMenu || mode === "ticket") && styles.workAreaMenuOnly]}>
      {!historyMode && mode === "tables" && (
        <TablePicker
          activeTables={activeTables}
          floors={bootstrap?.floors ?? []}
          selectedTableId={selectedTableId}
          loading={loading}
          tableOrder={tableOrder}
          onTableOrderChange={setTableOrder}
          onSelectTable={(tableId) => void selectTable(tableId)}
        />
      )}
      {!historyMode && mode === "menu" && (
        <MenuScreen
          selectedTableName={selectedTable?.name ?? null}
          visibleMenu={visibleMenu}
          saleGroupFilters={saleGroupFilters}
          selectedSaleGroup={activeMenuGroup}
          hasSearch={hasMenuSearch}
          draftTotal={draftTotal}
          hasNewItems={hasNewItems}
          draftQuantitiesByMenuItemId={draftQuantitiesByMenuItemId}
          draftSelectionLabelsByMenuItemId={draftSelectionLabelsByMenuItemId}
          searchValue={menuSearch}
          virtualized={useVirtualMenu}
          saleGroups={bootstrap?.saleGroups ?? []}
          productionUnits={bootstrap?.productionUnits ?? []}
          onSearchChange={setMenuSearch}
          onSaleGroupChange={setMenuGroupFilter}
          onAddItem={addItem}
          onAddOpenItem={addOpenItem}
        />
      )}
      {!historyMode && mode === "ticket" && (
        <TicketScreen
          selectedTableName={selectedTable?.name ?? null}
          deviceName={deviceName}
          pax={pax}
          items={items}
          sentItems={sentItems}
          menuItems={bootstrap?.menuItems ?? []}
          tables={activeTables}
          floors={bootstrap?.floors ?? []}
          tableOrder={tableOrder}
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
            void persistDraft(undefined, clean);
          }}
          onChangeQty={changeQty}
          onChangeItemNote={changeItemNote}
          onShiftTable={(tableId) => void shiftTable(tableId)}
          onShiftItem={(orderItemId, quantity, toTableId) => void shiftItem(orderItemId, quantity, toTableId)}
          onGenerateBill={(customerName) => void generateBillForSelectedTable(customerName)}
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
          actionMessage={message}
          currentSummary={currentSummary}
          dailyReports={dailyReports}
          selectedHistoryDayId={selectedHistoryDayId}
          selectedHistoryDetail={selectedHistoryDetail}
          menuItems={bootstrap?.menuItems ?? []}
          sending={sending}
          onHistoryPrint={(billId) => void printHistoryBill(billId)}
          onHistoryEdit={(billId, historyItems, customerName, masterPin, saveMode, payments) => editHistoryBill(billId, historyItems, customerName, masterPin, saveMode, payments)}
          onSelectHistoryDay={(posDayId) => void selectHistoryDay(posDayId)}
        />
      ) : null}
    </View>
  );

  const licenseBlockContent = (
    <>
      <ConnectionBanner message={license?.message ?? "This POS needs an active license check."} savingDraft={false} />
      <View style={styles.stepCard}>
        <Text style={styles.kicker}>License</Text>
        <Text style={styles.heroTitle}>{license?.status === "missing" ? "Activation required" : "Service locked"}</Text>
        <Text style={styles.muted}>
          {license?.hoursUntilOfflineLock !== undefined && license.hoursUntilOfflineLock > 0
            ? `${license.message} ${license.hoursUntilOfflineLock} hours remain before offline lock.`
            : license?.message ?? "Ask the hub admin to connect the hub to the internet and refresh the license."}
        </Text>
      </View>
    </>
  );

  const serviceContent = licenseBlocked ? licenseBlockContent : isKitchenDevice ? (
    <>
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
      {workArea}
    </>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.wash} />
        <KeyboardAvoidingView style={styles.keyboardShell} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <AppHeader
            branding={restaurantBranding.branding}
            connection={connection}
            title={shouldShowOnboarding ? (setupOpen ? "Settings" : !deviceToken ? "Connect this phone" : "Hub offline") : isKitchenDevice ? "Kitchen" : historyMode ? "History" : mode === "tables" ? "Tables" : selectedTable ? `Table ${selectedTable.name}` : mode === "menu" ? "Menu" : "Check"}

            onSetupPress={() => openSetup(hubUrl, deviceToken)}
            onPaymentQrPress={deviceToken && !shouldShowOnboarding ? () => setPaymentQrOpen(true) : undefined}
            setupVisible={shouldShowOnboarding}
            onBackPress={deviceToken && connection === "online" ? () => setSetupOpen(false) : undefined}
          />



          {!shouldShowOnboarding && !licenseBlocked && (message || licenseWarning) ? (
            <View style={styles.serviceFeedback}>
              <ConnectionBanner message={licenseWarning ? license.message : message} savingDraft={false} onDismiss={licenseWarning ? undefined : () => setMessage("")} />
            </View>
          ) : null}

          {shouldShowOnboarding ? (
            <OnboardingScreen
              connection={connection}
              formRevision={formRevision}
              hubUrl={hubUrlDraft}
              savedHubUrl={hubUrl}
              deviceName={deviceName}
              deviceRole={deviceRole}
              branding={restaurantBranding.branding}
              extraSections={
                <>
                  {deviceToken && canBill ? (
                    <BrandingSettings
                      branding={restaurantBranding.branding}
                      online={connection === "online"}
                      busy={restaurantBranding.busy}
                      error={restaurantBranding.error}
                      notice={restaurantBranding.notice}
                      onPickLogo={restaurantBranding.pickLogo}
                      onSave={restaurantBranding.save}
                    />
                  ) : null}
                  {deviceToken ? <RestaurantShortcutSettings branding={restaurantBranding.branding} /> : null}
                  <MobileUpdatePanel update={mobileUpdate} />
                </>
              }
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
              {useVirtualMenu || (!isKitchenDevice && mode === "ticket") ? (
                <View style={styles.screen}>
                  <View style={[styles.screenContent, styles.virtualMenuContent]}>
                    {serviceContent}
                  </View>
                </View>
              ) : (
                <ScrollView key={`${mode}:${selectedTableId ?? ""}:${selectedHistoryDayId ?? ""}`} style={styles.screen} contentContainerStyle={[styles.screenContent, hasNewItems && mode === "tables" && !isKitchenDevice && styles.screenContentWithDraft]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                  {serviceContent}
                </ScrollView>
              )}
              {!isKitchenDevice && hasNewItems && (mode === "menu" || mode === "tables") ? (
                <DraftBar
                  count={items.reduce((total, item) => total + item.quantity, 0)}
                  total={draftTotal}
                  onReview={() => setMode("ticket")}
                />
              ) : null}
            </>
          )}
          {!shouldShowOnboarding && !isKitchenDevice && !licenseBlocked ? (
            <ModeTabs mode={mode} onModeChange={setMode} newItemCount={items.reduce((total, item) => total + item.quantity, 0)} showHistory={canBill} />
          ) : null}
        </KeyboardAvoidingView>

        <PairingScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScannedPayload={(data) => void handleScannedPayload(data)}
        />
        {paymentQrOpen && deviceToken && !shouldShowOnboarding ? (
          <PaymentQrModal
            client={client}
            online={connection === "online"}
            canManage={canBill}
            deviceName={deviceName}
            onClose={() => setPaymentQrOpen(false)}
          />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
