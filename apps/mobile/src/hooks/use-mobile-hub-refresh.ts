import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Alert } from "react-native";

import { getDeviceToken, getHubUrl } from "../lib/draft-store";
import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubClient, HubOrder, KdsTicket } from "../lib/hub-client";
import {
  MOBILE_REALTIME_REFRESH_DEBOUNCE_MS,
  MOBILE_REFRESH_INTERVAL_MS,
  nextConnectionAfterRefresh
} from "../lib/connection-health";
import type { ConnectionState } from "../lib/mobile-types";

type UseMobileHubRefreshInput = {
  client: HubClient;
  initializing: boolean;
  hubUrl: string;
  deviceToken: string;
  connection: ConnectionState;
  bootstrap: HubBootstrap | null;
  kitchenUnitId: string;
  selectedHistoryDayId: string | null;
  selectedTableId: string | null;
  connectionFailuresRef: MutableRefObject<number>;
  hydrateDrafts: (hubUrl: string, token: string) => void;
  loadTableOrder: (tableId: string) => Promise<void>;
  notifyChime: () => void;
  chimeForNewKdsTickets: (unitId: string, nextTickets: KdsTicket[]) => void;
  setInitializing: Dispatch<SetStateAction<boolean>>;
  setHubUrlState: Dispatch<SetStateAction<string>>;
  setDeviceTokenState: Dispatch<SetStateAction<string>>;
  setDeviceRoleState: Dispatch<SetStateAction<string>>;
  setDeviceNameState: Dispatch<SetStateAction<string>>;
  setConnection: Dispatch<SetStateAction<ConnectionState>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setBootstrap: Dispatch<SetStateAction<HubBootstrap | null>>;
  setCurrentOrder: Dispatch<SetStateAction<HubOrder | null>>;
  setCurrentSummary: Dispatch<SetStateAction<CurrentDaySummary | null>>;
  setDailyReports: Dispatch<SetStateAction<DailyReportRow[]>>;
  setSelectedHistoryDayId: Dispatch<SetStateAction<string | null>>;
  setSelectedHistoryDetail: Dispatch<SetStateAction<DailyReportDetail | null>>;
  setKitchenUnitId: Dispatch<SetStateAction<string>>;
  setKdsTickets: Dispatch<SetStateAction<KdsTicket[]>>;
};

export function useMobileHubRefresh({
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
}: UseMobileHubRefreshInput) {
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

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

  return { refresh };
}
