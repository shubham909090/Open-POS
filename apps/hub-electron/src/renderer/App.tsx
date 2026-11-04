import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCw, Save, Settings, X } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Badge } from "./components/ui/badge.js";
import {
  HubLoading,
  HubNavigation,
  hubNavigation,
} from "./components/hub-navigation.js";
import { Dialog } from "./components/ui/dialog.js";
import { Input } from "./components/ui/input.js";
import { Notice } from "./components/ui/notice.js";
import {
  clearAuthToken,
  getAuthToken,
  hubApi,
  setAuthToken,
} from "./hub-api.js";
import { useHubStore } from "./store.js";
import { connectHubRealtime, getRealtimeInvalidationKeys } from "./realtime.js";
import {
  useManagerApproval,
  ManagerApprovalModal,
} from "./hooks/use-manager-approval.js";
import { messageOf } from "./lib/format.js";

import { SetupView } from "./components/setup/setup-view.js";
import { OrdersView } from "./components/orders/orders-view.js";
import { AlcoholView } from "./components/alcohol/alcohol-view.js";
import { KitchenView } from "./components/kitchen/kitchen-view.js";
import { ReportsView } from "./components/reports/reports-view.js";
import { AdvancedView } from "./components/advanced/advanced-view.js";

import "./styles/tokens.css";
import "./styles/globals.css";
import "./styles/hub-shell.css";
import "./styles/layout-primitives.css";
import "./styles/row-primitives.css";
import "./styles/action-primitives.css";
import "./styles.css";
import "./styles/setup.css";
import "./styles/records.css";
import "./styles/orders.css";
import "./styles/order-table-map.css";
import "./styles/order-billing.css";
import "./styles/order-revision.css";
import "./styles/order-state-editor.css";
import "./styles/order-transfer.css";
import "./styles/order-workspace.css";
import "./styles/printer.css";
import "./styles/print-layout.css";
import "./styles/pairing.css";
import "./styles/app-update.css";
import "./styles/components.css";
import "./styles/alcohol.css";
import "./styles/kitchen.css";
import "./styles/reports.css";
import "./styles/report-history.css";
import "./styles/report-stock-movements.css";
import "./styles/responsive.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 3_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HubShell />
    </QueryClientProvider>
  );
}

/* ─── View title map ─── */

/* ─── Hub Shell (main layout) ─── */

function HubShell() {
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);
  const managerApproval = useManagerApproval();
  const view = useHubStore((s) => s.view);
  const setView = useHubStore((s) => s.setView);
  const sessionStatus = useQuery({
    queryKey: ["admin-session-status"],
    queryFn: hubApi.adminSessionStatus,
  });
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: hubApi.bootstrap,
  });
  const hubUnlocked = Boolean(bootstrap.data && !bootstrap.error);
  const managerPinConfigured =
    bootstrap.data?.setup?.managerPinConfigured ??
    sessionStatus.data?.managerPinConfigured ??
    true;
  const firstRunNeedsPin = sessionStatus.data?.managerPinConfigured === false;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  useEffect(() => {
    const handleFocusRepair = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "f")
        return;
      event.preventDefault();
      void window.gauravPos?.repairFocus?.();
    };
    window.addEventListener("keydown", handleFocusRepair);
    return () => window.removeEventListener("keydown", handleFocusRepair);
  }, []);

  useEffect(() => {
    if (!hubUnlocked) return;
    const pendingKeys = new Map<string, readonly unknown[]>();
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = connectHubRealtime({
      token: getAuthToken(),
      onEvent: (event) => {
        for (const queryKey of getRealtimeInvalidationKeys(event)) {
          pendingKeys.set(JSON.stringify(queryKey), queryKey);
        }
        if (invalidateTimer) return;
        invalidateTimer = setTimeout(() => {
          invalidateTimer = null;
          const keys = [...pendingKeys.values()];
          pendingKeys.clear();
          for (const queryKey of keys) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }, 250);
      },
    });
    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      unsubscribe();
    };
  }, [hubUnlocked]);

  const createPin = useMutation({
    mutationFn: () => hubApi.setManagerPin({ newPin, updatedBy: "admin" }),
    onSuccess: async () => {
      setNotice({
        tone: "good",
        text: "Manager PIN created. Use it to unlock setup.",
      });
      setNewPin("");
      await queryClient.invalidateQueries({
        queryKey: ["admin-session-status"],
      });
    },
    onError: (err) => setNotice({ tone: "bad", text: messageOf(err) }),
  });

  const unlock = useMutation({
    mutationFn: () => hubApi.unlockAdminSession(pin),
    onSuccess: async (result) => {
      setAuthToken(result.token);
      setPin("");
      await queryClient.invalidateQueries();
      setNotice({ tone: "good", text: "Setup unlocked." });
    },
    onError: (err) => setNotice({ tone: "bad", text: messageOf(err) }),
  });

  async function lockHub() {
    try {
      await hubApi.lockAdminSession();
    } catch {
      /* noop */
    }
    clearAuthToken();
    await queryClient.invalidateQueries();
    setNotice({ tone: "good", text: "Setup locked on this device." });
  }

  /* ─── First run: create PIN ─── */
  if (firstRunNeedsPin) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6">
        <section className="grid w-[min(520px,100%)] gap-4 rounded-lg border border-line bg-panel p-8 shadow-pos">
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-accent-soft text-accent-dark">
            <Settings size={28} />
          </div>
          <p className="text-xs font-medium text-muted">First setup</p>
          <h1 className="m-0 text-2xl font-semibold leading-[1.05] text-ink">
            Create Manager PIN
          </h1>
          <p className="m-0 text-[1.04rem] text-muted">
            This PIN unlocks setup on the hub PC and approves sensitive actions
            like bill reprints, NC bills, cancellations, and printer layout
            changes.
          </p>
          {notice ? (
            <Notice variant={notice.tone === "good" ? "success" : "error"}>
              <span className="flex-1">{notice.text}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={14} />
              </Button>
            </Notice>
          ) : null}
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              createPin.mutate();
            }}
          >
            <input
              className="sr-only"
              name="username"
              tabIndex={-1}
              autoComplete="username"
              value="manager"
              readOnly
              aria-hidden="true"
            />
            <Input
              label="Manager PIN"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="4 digits or more"
            />
            <Button
              type="submit"
              variant="accent"
              size="touch"
              disabled={newPin.length < 4 || createPin.isPending}
            >
              <Save size={16} />
              Create PIN
            </Button>
          </form>
          <span className="text-sm font-semibold text-muted">
            For safety, the first PIN can only be created from this hub PC.
          </span>
        </section>
      </main>
    );
  }

  /* ─── Main layout ─── */
  return (
    <main className="hub-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <HubNavigation
        view={view}
        onChange={setView}
        unlocked={hubUnlocked}
        managerPinConfigured={managerPinConfigured}
        onUnlock={() => setUnlockModalOpen(true)}
        onLock={() => void lockHub()}
      />

      {/* ─── Main content ─── */}
      <section className="hub-main" id="workspace-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="workspace-breadcrumb">
              Workspace <span>/</span>{" "}
              {hubNavigation.find((item) => item.view === view)?.label}
            </p>
            <h1 className="workspace-page-title">
              {hubNavigation.find((item) => item.view === view)?.label}
            </h1>
          </div>
          <div className="workspace-toolbar">
            <span className="workspace-day">
              {bootstrap.data?.currentBusinessDay.business_date}
            </span>
            <Badge
              variant={
                bootstrap.data?.setup?.printerOutputMode === "live"
                  ? "accent"
                  : "warning"
              }
            >
              {bootstrap.data?.setup?.printerOutputMode === "live"
                ? "Printers live"
                : "Printer test mode"}
            </Badge>
            {Boolean(bootstrap.data?.syncStatus?.counts?.pending) && (
              <Badge>
                {bootstrap.data?.syncStatus?.counts?.pending} pending sync
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="topbar-icon-button"
              onClick={() => {
                if (!bootstrap.isFetching) void bootstrap.refetch();
              }}
              disabled={bootstrap.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                size={16}
                className={bootstrap.isFetching ? "refreshing" : undefined}
              />
            </Button>
          </div>
        </header>

        {notice ? (
          <Notice variant={notice.tone === "good" ? "success" : "error"}>
            <span className="flex-1">{notice.text}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={14} />
            </Button>
          </Notice>
        ) : null}
        {bootstrap.error ? (
          <Notice variant="error">{messageOf(bootstrap.error)}</Notice>
        ) : null}
        {bootstrap.isLoading ? <HubLoading /> : null}

        {bootstrap.data ? (
          <>
            {view === "setup" ? (
              <SetupView
                bootstrap={bootstrap.data}
                setNotice={setNotice}
                requestManagerApproval={managerApproval.request}
              />
            ) : null}
            {view === "orders" ? (
              <OrdersView
                bootstrap={bootstrap.data}
                setNotice={setNotice}
                requestManagerApproval={managerApproval.request}
              />
            ) : null}
            {view === "alcohol" ? (
              <AlcoholView
                bootstrap={bootstrap.data}
                setNotice={setNotice}
                requestManagerApproval={managerApproval.request}
              />
            ) : null}
            {view === "kitchen" ? (
              <KitchenView bootstrap={bootstrap.data} setNotice={setNotice} />
            ) : null}
            {view === "reports" ? (
              <ReportsView requestManagerApproval={managerApproval.request} />
            ) : null}
            {view === "advanced" ? (
              <AdvancedView
                bootstrap={bootstrap.data}
                setNotice={setNotice}
                requestManagerApproval={managerApproval.request}
                onLocked={lockHub}
              />
            ) : null}
          </>
        ) : null}
      </section>

      {/* ─── Modals ─── */}
      <UnlockSetupModal
        open={unlockModalOpen}
        pin={pin}
        setPin={setPin}
        pending={unlock.isPending}
        onClose={() => setUnlockModalOpen(false)}
        onSubmit={() =>
          unlock.mutate(undefined, {
            onSuccess: () => setUnlockModalOpen(false),
          })
        }
      />
      <ManagerApprovalModal
        state={managerApproval.state}
        setState={managerApproval.setState}
      />
    </main>
  );
}

/* ─── Unlock modal ─── */

function UnlockSetupModal({
  open,
  pin,
  setPin,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pin: string;
  setPin: (pin: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Unlock setup"
    >
      <p className="text-sm text-muted">
        Enter the Manager PIN for this hub. This unlocks setup tools on this
        screen only.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          className="sr-only"
          name="username"
          tabIndex={-1}
          autoComplete="username"
          value="manager"
          readOnly
          aria-hidden="true"
        />
        <Input
          label="Manager PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          autoComplete="current-password"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={pin.length < 4 || pending}
          >
            {pending ? "Unlocking..." : "Unlock setup"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
