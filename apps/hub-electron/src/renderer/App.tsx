import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, getTableDisplayState, rankMenuQuickPicks, searchMenuItems, tableDisplayClass, tableDisplayLabel, type SaleGroupKind } from "@gaurav-pos/shared";
import {
  BadgeIndianRupee,
  Beer,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  CloudDownload,
  LayoutDashboard,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Users,
  Wine,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { clearAuthToken, hubApi, setAuthToken, type AlcoholCatalog, type AlcoholStockMovement, type AlcoholStorageRow, type Bootstrap, type Floor, type MenuItem, type MenuItemVariant, type PrintLayoutSettings, type ProductionUnit, type Table, type TableOrder } from "./hub-api.js";
import { useHubStore, type HubView } from "./store.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3_000,
      retry: 1,
      refetchOnWindowFocus: true
    }
  }
});

function useOperationKeys() {
  const keysRef = useRef<Record<string, string>>({});
  const keyFor = (prefix: string, scope: unknown) => {
    const mapKey = `${prefix}:${JSON.stringify(scope)}`;
    keysRef.current[mapKey] ??= `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    return keysRef.current[mapKey];
  };
  const clear = (prefix: string, scope: unknown) => {
    delete keysRef.current[`${prefix}:${JSON.stringify(scope)}`];
  };
  return { keyFor, clear };
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HubShell />
    </QueryClientProvider>
  );
}

function HubShell() {
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const managerApproval = useManagerApproval();
  const view = useHubStore((state) => state.view);
  const setView = useHubStore((state) => state.setView);
  const sessionStatus = useQuery({ queryKey: ["admin-session-status"], queryFn: hubApi.adminSessionStatus });
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: hubApi.bootstrap });
  const hubUnlocked = Boolean(bootstrap.data && !bootstrap.error);
  const managerPinConfigured = bootstrap.data?.setup?.managerPinConfigured ?? sessionStatus.data?.managerPinConfigured ?? true;
  const firstRunNeedsPin = sessionStatus.data?.managerPinConfigured === false;
  const createPin = useMutation({
    mutationFn: () => hubApi.setManagerPin({ newPin, updatedBy: "admin" }),
    onSuccess: async () => {
      setNotice({ tone: "good", text: "Manager PIN created. Use it to unlock setup." });
      setNewPin("");
      await queryClient.invalidateQueries({ queryKey: ["admin-session-status"] });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const unlock = useMutation({
    mutationFn: () => hubApi.unlockAdminSession(pin),
    onSuccess: async (result) => {
      setAuthToken(result.token);
      setPin("");
      await queryClient.invalidateQueries();
      setNotice({ tone: "good", text: "Setup unlocked." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  async function lockHub() {
    try {
      await hubApi.lockAdminSession();
    } catch {
      // Local lock should still clear this browser even if the old token is already invalid.
    }
    clearAuthToken();
    await queryClient.invalidateQueries();
    setNotice({ tone: "good", text: "Setup locked on this device." });
  }

  if (firstRunNeedsPin) {
    return (
      <main className="first-run-shell">
        <section className="first-run-card">
          <div className="first-run-mark">
            <Settings size={28} />
          </div>
          <p className="eyebrow">First setup</p>
          <h1>Create Manager PIN</h1>
          <p>
            This PIN unlocks setup on the hub PC and approves sensitive actions like bill reprints, NC bills,
            cancellations, and printer layout changes.
          </p>
          {notice ? <div className={`notice ${notice.tone}`}>{notice.text}</div> : null}
          <form className="first-run-form" onSubmit={(event) => { event.preventDefault(); createPin.mutate(); }}>
            <label>
              Manager PIN
              <input
                value={newPin}
                onChange={(event) => setNewPin(event.target.value)}
                type="password"
                autoComplete="new-password"
                autoFocus
                placeholder="4 digits or more"
              />
            </label>
            <button type="submit" disabled={newPin.length < 4 || createPin.isPending}>
              <Save size={16} />
              Create PIN
            </button>
          </form>
          <span className="first-run-note">For safety, the first PIN can only be created from this hub PC.</span>
        </section>
      </main>
    );
  }

  return (
    <main className="hub-shell">
      <aside className="side-rail">
        <div className="brand-block">
          <span>Gaurav POS</span>
          <strong>Hub</strong>
        </div>
        <nav className="nav-stack" aria-label="Hub sections">
          <NavButton icon={<LayoutDashboard size={18} />} label="Setup" view="setup" active={view === "setup"} onClick={setView} />
          <NavButton icon={<ReceiptText size={18} />} label="Take Orders" view="orders" active={view === "orders"} onClick={setView} />
          <NavButton icon={<Wine size={18} />} label="Alcohol" view="alcohol" active={view === "alcohol"} onClick={setView} />
          <NavButton icon={<ChefHat size={18} />} label="Kitchen" view="kitchen" active={view === "kitchen"} onClick={setView} />
          <NavButton icon={<BadgeIndianRupee size={18} />} label="Reports" view="reports" active={view === "reports"} onClick={setView} />
          <NavButton icon={<Settings size={18} />} label="Advanced" view="advanced" active={view === "advanced"} onClick={setView} />
        </nav>
        <section className="unlock-card">
          {!hubUnlocked ? (
            <div className="unlock-status">
              <div>
                <span>Setup access</span>
                <strong>{managerPinConfigured ? "Locked" : "PIN needed"}</strong>
              </div>
              <button type="button" className="secondary-button" onClick={() => setUnlockModalOpen(true)}>
                {managerPinConfigured ? "Unlock setup" : "Create PIN"}
              </button>
            </div>
          ) : (
            <div className="unlock-status">
              <div>
                <span>Setup access</span>
                <strong>Unlocked</strong>
              </div>
              <button type="button" className="secondary-button" onClick={() => void lockHub()}>
                Lock
              </button>
            </div>
          )}
        </section>
      </aside>

      <section className="hub-main">
        <header className="topbar">
          <div>
            <p>{bootstrap.data ? `Business day: ${bootstrap.data.currentBusinessDay.business_date} (6 AM IST boundary)` : "Loading business day"}</p>
            <h1>{titleForView(view)}</h1>
          </div>
          <div className="topbar-actions">
            <span className={bootstrap.data?.setup?.printerOutputMode === "live" ? "status-pill" : "status-pill warn"}>
              {bootstrap.data?.setup?.printerOutputMode === "live" ? "Printers Live" : "Printer Test Mode"}
            </span>
            <span className="status-pill">Sync pending {bootstrap.data?.syncStatus?.counts?.pending ?? 0}</span>
            <button type="button" className="icon-button" onClick={() => void bootstrap.refetch()} aria-label="Refresh">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {notice ? <div className={`notice ${notice.tone}`}>{notice.text}</div> : null}
        {bootstrap.error ? <div className="notice bad">{messageOf(bootstrap.error)}</div> : null}
        {bootstrap.isLoading ? <div className="loading-panel">Loading hub data...</div> : null}

        {bootstrap.data ? (
          <>
            {view === "setup" ? <SetupView bootstrap={bootstrap.data} setNotice={setNotice} requestManagerApproval={managerApproval.request} /> : null}
            {view === "orders" ? <OrdersView bootstrap={bootstrap.data} setNotice={setNotice} requestManagerApproval={managerApproval.request} /> : null}
            {view === "alcohol" ? <AlcoholView bootstrap={bootstrap.data} setNotice={setNotice} requestManagerApproval={managerApproval.request} /> : null}
            {view === "kitchen" ? <KitchenView bootstrap={bootstrap.data} setNotice={setNotice} /> : null}
            {view === "reports" ? <ReportsView /> : null}
            {view === "advanced" ? <AdvancedView bootstrap={bootstrap.data} setNotice={setNotice} requestManagerApproval={managerApproval.request} onLocked={lockHub} /> : null}
          </>
        ) : null}
      </section>
      <UnlockSetupModal
        open={unlockModalOpen}
        pin={pin}
        setPin={setPin}
        pending={unlock.isPending}
        onClose={() => setUnlockModalOpen(false)}
        onSubmit={() => unlock.mutate(undefined, { onSuccess: () => setUnlockModalOpen(false) })}
      />
      <ManagerApprovalModal state={managerApproval.state} setState={managerApproval.setState} />
    </main>
  );
}

function NavButton({
  icon,
  label,
  view,
  active,
  onClick
}: {
  icon: ReactNode;
  label: string;
  view: HubView;
  active: boolean;
  onClick: (view: HubView) => void;
}) {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={() => onClick(view)}>
      {icon}
      {label}
    </button>
  );
}

type ManagerApproval = { pin: string; reason: string; approvedBy: string };
type ManagerApprovalRequest = (options: {
  title: string;
  message?: string;
  defaultReason?: string;
  reasonLabel?: string;
  requireReason?: boolean;
  confirmLabel?: string;
  danger?: boolean;
}) => Promise<ManagerApproval>;
type ManagerApprovalState = {
  open: boolean;
  title: string;
  message?: string;
  reason: string;
  reasonLabel: string;
  requireReason: boolean;
  confirmLabel: string;
  danger: boolean;
  pin: string;
  resolve?: (approval: ManagerApproval) => void;
  reject?: () => void;
};

function useManagerApproval() {
  const [state, setState] = useState<ManagerApprovalState>({
    open: false,
    title: "",
    reason: "",
    reasonLabel: "Reason",
    requireReason: true,
    confirmLabel: "Approve",
    danger: false,
    pin: ""
  });

  const request: ManagerApprovalRequest = (options) =>
    new Promise((resolve, reject) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        reason: options.defaultReason ?? "",
        reasonLabel: options.reasonLabel ?? "Reason",
        requireReason: options.requireReason ?? true,
        confirmLabel: options.confirmLabel ?? "Approve",
        danger: Boolean(options.danger),
        pin: "",
        resolve,
        reject
      });
    });

  return { state, setState, request };
}

function UnlockSetupModal({
  open,
  pin,
  setPin,
  pending,
  onClose,
  onSubmit
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
    <Modal title="Unlock setup" onClose={onClose}>
      <p className="plain-state">Enter the Manager PIN for this hub. This unlocks setup tools on this screen only.</p>
      <form
        className="approval-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Manager PIN
          <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" autoComplete="current-password" autoFocus />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pin.length < 4 || pending}>{pending ? "Unlocking..." : "Unlock setup"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ManagerApprovalModal({
  state,
  setState
}: {
  state: ManagerApprovalState;
  setState: (updater: ManagerApprovalState | ((state: ManagerApprovalState) => ManagerApprovalState)) => void;
}) {
  if (!state.open) return null;
  const close = () => {
    state.reject?.();
    setState({ ...state, open: false, pin: "", resolve: undefined, reject: undefined });
  };
  const canSubmit = state.pin.length >= 4 && (!state.requireReason || state.reason.trim().length >= 3);
  return (
    <Modal title={state.title} onClose={close} danger={state.danger}>
      {state.message ? <p className="plain-state">{state.message}</p> : null}
      <form
        className="approval-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          state.resolve?.({ pin: state.pin, reason: state.reason.trim(), approvedBy: "manager" });
          setState({ ...state, open: false, pin: "", resolve: undefined, reject: undefined });
        }}
      >
        <label>
          {state.reasonLabel}
          <input
            value={state.reason}
            onChange={(event) => setState((current) => ({ ...current, reason: event.target.value }))}
            placeholder={state.requireReason ? "Required" : "Optional"}
          />
        </label>
        <label>
          Manager PIN
          <input
            value={state.pin}
            onChange={(event) => setState((current) => ({ ...current, pin: event.target.value }))}
            type="password"
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>Cancel</button>
          <button type="submit" className={state.danger ? "danger-button" : ""} disabled={!canSubmit}>{state.confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose, danger = false }: { title: string; children: ReactNode; onClose: () => void; danger?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={danger ? "modal-card danger" : "modal-card"} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function SetupView({ bootstrap, setNotice, requestManagerApproval }: { bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const queryClient = useQueryClient();
  const [floorName, setFloorName] = useState("");
  const [tableName, setTableName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [dishName, setDishName] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishUnit, setDishUnit] = useState("");
  const [dishGroup, setDishGroup] = useState("sg-food");
  const [dishListSearch, setDishListSearch] = useState("");
  const [tableFloorId, setTableFloorId] = useState("");
  const [receiptPrinterName, setReceiptPrinterName] = useState("");
  const [receiptHost, setReceiptHost] = useState("");
  const [receiptPort, setReceiptPort] = useState("9100");
  const [cloudUrl, setCloudUrl] = useState(bootstrap.setup?.hubConnection?.cloudUrl ?? "");
  const [installationId, setInstallationId] = useState(bootstrap.setup?.hubConnection?.installationId ?? "");
  const [syncSecret, setSyncSecret] = useState(bootstrap.setup?.hubConnection?.syncSecret ?? "");
  const [hubPublicUrl, setHubPublicUrl] = useState(bootstrap.setup?.hubConnection?.hubPublicUrl ?? "");
  const firstFloorId = bootstrap.floors.find((floor) => floor.active)?.id ?? bootstrap.floors[0]?.id ?? "";
  const activeFloors = bootstrap.floors.filter((floor) => floor.active);
  const dishSaleGroups = bootstrap.saleGroups.filter((group) => group.active && group.kind !== "alcohol");
  const rawSetupDishItems = bootstrap.menuItems.filter((item) => item.sale_group_kind !== "alcohol");
  const setupDishItems = searchMenuItems(rawSetupDishItems, dishListSearch, { includeInactive: true });
  const dishPricePaise = Math.round(Number(dishPrice || 0) * 100);
  const printerOutputMode = bootstrap.setup?.printerOutputMode ?? "test";
  const receiptPrinter = useQuery({ queryKey: ["receipt-printer"], queryFn: hubApi.receiptPrinter });
  const systemPrinters = useQuery({ queryKey: ["system-printers"], queryFn: hubApi.systemPrinters, enabled: false });
  const printLayouts = useQuery({ queryKey: ["print-layouts"], queryFn: hubApi.printLayouts });

  useEffect(() => {
    if (!tableFloorId || !bootstrap.floors.some((floor) => floor.id === tableFloorId && floor.active)) {
      setTableFloorId(firstFloorId);
    }
  }, [bootstrap.floors, firstFloorId, tableFloorId]);

  useEffect(() => {
    if (!dishSaleGroups.some((group) => group.id === dishGroup)) {
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
    }
  }, [dishGroup, dishSaleGroups]);

  useEffect(() => {
    if (!receiptPrinter.data) return;
    setReceiptPrinterName(receiptPrinter.data.printerName ?? "");
    setReceiptHost(receiptPrinter.data.printerHost ?? "");
    setReceiptPort(String(receiptPrinter.data.printerPort ?? 9100));
  }, [receiptPrinter.data]);

  useEffect(() => {
    const connection = bootstrap.setup?.hubConnection;
    if (!connection) return;
    setCloudUrl(connection.cloudUrl);
    setInstallationId(connection.installationId);
    setSyncSecret(connection.syncSecret);
    setHubPublicUrl(connection.hubPublicUrl);
  }, [bootstrap.setup?.hubConnection]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  const invalidatePrinter = async () => {
    await queryClient.invalidateQueries({ queryKey: ["receipt-printer"] });
    await invalidate();
  };
  const updatePrinterMode = useMutation({
    mutationFn: (mode: "test" | "live") => hubApi.updatePrinterMode(mode),
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: "good",
        text: result.mode === "live" ? "Printers are live. Real tickets will print." : "Printer Test Mode is on. Tickets are logged without real printing."
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const requestPrinterMode = (mode: "test" | "live") => {
    if (mode === "live" && printerOutputMode !== "live") {
      const confirmed = window.confirm("Live Mode sends real bills and kitchen tickets to connected printers. Run test prints first. Switch to Live Mode now?");
      if (!confirmed) return;
    }
    updatePrinterMode.mutate(mode);
  };
  const saveReceiptPrinter = useMutation({
    mutationFn: () =>
      hubApi.updateReceiptPrinter({
        printerMode: receiptPrinterName ? "system" : "network",
        printerName: receiptPrinterName || undefined,
        printerHost: receiptHost,
        printerPort: Number(receiptPort || 9100)
      }),
    onSuccess: async () => {
      await invalidatePrinter();
      setNotice({ tone: "good", text: "Cash counter printer saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const revealHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.hubConnection(pin),
    onSuccess: (result) => {
      setCloudUrl(result.cloudUrl);
      setInstallationId(result.installationId);
      setSyncSecret(result.syncSecret);
      setHubPublicUrl(result.hubPublicUrl);
      setNotice({ tone: "good", text: "Cloud connection details shown." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const saveHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.updateHubConnection({ cloudUrl, installationId, syncSecret, hubPublicUrl }, pin),
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "good", text: "Cloud connection saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const testHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.testHubConnection(pin),
    onSuccess: (result) => setNotice({ tone: result.status === "connected" ? "good" : "bad", text: result.message }),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const approveConnectionAction = async (title: string, defaultReason: string) =>
    requestManagerApproval({ title, defaultReason, confirmLabel: "Continue" }).catch(() => null);
  const testBillPrint = useMutation({
    mutationFn: hubApi.testBillPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({ tone: result.processed.failed ? "bad" : "good", text: result.processed.failed ? "Test bill print failed. Check Recent print jobs." : "Test bill print queued successfully." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const testKotPrint = useMutation({
    mutationFn: hubApi.testKotPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({ tone: result.processed.failed ? "bad" : "good", text: result.processed.failed ? "Test kitchen ticket failed. Check Recent print jobs." : "Test kitchen ticket queued successfully." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createFloor = useMutation({
    mutationFn: () => hubApi.createFloor(floorName),
    onSuccess: async () => {
      setFloorName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createTable = useMutation({
    mutationFn: () => hubApi.createTable(tableFloorId || firstFloorId, tableName),
    onSuccess: async () => {
      setTableName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createUnit = useMutation({
    mutationFn: () => hubApi.createUnit(unitName),
    onSuccess: async () => {
      setUnitName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createDish = useMutation({
    mutationFn: () =>
      hubApi.createDish({
        name: dishName,
        pricePaise: dishPricePaise,
        productionUnitId: dishUnit || null,
        saleGroupId: dishGroup,
        active: true
      }),
    onSuccess: async () => {
      setDishName("");
      setDishPrice("");
      setDishUnit("");
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="setup-board">
      <SetupCard title="Business Day" done icon={<CalendarCheck size={20} />}>
        <p className="plain-state">
          Current day is {bootstrap.currentBusinessDay.business_date}. The hub starts a new business day automatically every day at 6:00 AM IST.
        </p>
      </SetupCard>

      <SetupCard title="Hub Connection And Security" done={Boolean(bootstrap.setup?.hubConnection?.configured)} icon={<Settings size={20} />}>
        <p className="plain-state">Paste the hub connection values from the cloud portal here. These fields are saved on this hub and hidden unless the Manager PIN is entered.</p>
        <form className="template-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Cloud URL
            <input value={cloudUrl} onChange={(event) => setCloudUrl(event.target.value)} placeholder="https://your-deployment.convex.site" />
          </label>
          <label>
            Hub connection ID
            <input value={installationId} onChange={(event) => setInstallationId(event.target.value)} />
          </label>
          <label>
            Sync secret
            <input value={syncSecret} onChange={(event) => setSyncSecret(event.target.value)} type="password" />
          </label>
          <label>
            Hub public URL
            <input value={hubPublicUrl} onChange={(event) => setHubPublicUrl(event.target.value)} placeholder="http://192.168.1.20:3737" />
          </label>
          <div className="action-strip">
            <button
              type="button"
              disabled={saveHubConnection.isPending}
              onClick={async () => {
                const approval = await approveConnectionAction("Save cloud connection", "Save hub cloud connection");
                if (approval) saveHubConnection.mutate(approval.pin);
              }}
            >
              Save connection
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                const approval = await approveConnectionAction("Show cloud connection secrets", "Reveal saved hub cloud connection");
                if (approval) revealHubConnection.mutate(approval.pin);
              }}
              disabled={revealHubConnection.isPending}
            >
              Show saved details
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                const approval = await approveConnectionAction("Test cloud connection", "Test hub cloud connection");
                if (approval) testHubConnection.mutate(approval.pin);
              }}
              disabled={testHubConnection.isPending}
            >
              Test cloud connection
            </button>
          </div>
        </form>
      </SetupCard>

      <SetupCard title="Printer Mode And Cash Counter" done={printerOutputMode === "test" || Boolean(receiptPrinter.data?.printerName || receiptPrinter.data?.printerHost)} icon={<Printer size={20} />}>
        <div className="printer-mode-card">
          <div className="segment-row">
            <button
              type="button"
              className={printerOutputMode === "test" ? "active" : ""}
              onClick={() => requestPrinterMode("test")}
              disabled={updatePrinterMode.isPending}
            >
              Test Mode
            </button>
            <button
              type="button"
              className={printerOutputMode === "live" ? "active" : ""}
              onClick={() => requestPrinterMode("live")}
              disabled={updatePrinterMode.isPending}
            >
              Live Mode
            </button>
          </div>
          <p className={printerOutputMode === "live" ? "plain-state" : "warning-text"}>
            {printerOutputMode === "live"
              ? "Live Mode sends real bills and kitchen tickets to the connected printers."
              : "Test Mode is safe for setup. Print jobs are recorded, but nothing is sent to hardware."}
          </p>
        </div>
        <form className="printer-form" onSubmit={(event) => { event.preventDefault(); saveReceiptPrinter.mutate(); }}>
          <label>
            PC printer
            <select value={receiptPrinterName} onChange={(event) => setReceiptPrinterName(event.target.value)}>
              <option value="">{systemPrinters.data?.length ? "Use LAN printer below" : "Load PC printers first"}</option>
              {(systemPrinters.data ?? []).map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName}{printer.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => void systemPrinters.refetch()} disabled={systemPrinters.isFetching}>
            Load PC Printers
          </button>
          <label>
            LAN printer IP
            <input value={receiptHost} onChange={(event) => setReceiptHost(event.target.value)} placeholder="192.168.1.50" />
          </label>
          <label>
            Port
            <input value={receiptPort} onChange={(event) => setReceiptPort(event.target.value)} inputMode="numeric" placeholder="9100" />
          </label>
          <button type="submit" disabled={saveReceiptPrinter.isPending}>Save Cash Counter Printer</button>
        </form>
        <div className="action-strip">
          <button type="button" onClick={() => testBillPrint.mutate()} disabled={testBillPrint.isPending}>
            <Printer size={18} /> Print test bill
          </button>
          <button type="button" onClick={() => testKotPrint.mutate()} disabled={testKotPrint.isPending}>
            <ChefHat size={18} /> Print test kitchen ticket
          </button>
        </div>
        <PrintLayoutEditor
          layouts={printLayouts.data}
          units={bootstrap.productionUnits}
          setNotice={setNotice}
          requestManagerApproval={requestManagerApproval}
          onSaved={async () => {
            await printLayouts.refetch();
            await invalidate();
          }}
        />
      </SetupCard>

      <SetupCard title="Floors And Tables" done={bootstrap.tables.some((table) => table.active)} icon={<Users size={20} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createFloor.mutate(); }}>
          <label>
            Floor name
            <input value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Main hall" />
          </label>
          <button disabled={!floorName.trim() || createFloor.isPending} type="submit">Add floor</button>
        </form>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createTable.mutate(); }}>
          <label>
            Floor
            <select value={tableFloorId} onChange={(event) => setTableFloorId(event.target.value)}>
              {activeFloors.map((floor) => (
                <option key={floor.id} value={floor.id}>{floor.name}</option>
              ))}
            </select>
          </label>
          <label>
            Table name
            <input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="T1" />
          </label>
          <button disabled={!firstFloorId || !tableName.trim() || createTable.isPending} type="submit">Add table</button>
        </form>
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.tables.map((table) => ({
            id: table.id,
            title: table.name,
            meta: `${table.floor_name} · ${table.active ? table.status : "disabled"}`,
            active: table.active,
            onToggle: () => hubApi.updateTable(table.id, { active: !table.active }).then(invalidate),
            onDelete: () => hubApi.deleteTable(table.id).then(invalidate),
            editForm: (close) => (
              <TableEditForm table={table} floors={activeFloors} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.floors.map((floor) => ({
            id: floor.id,
            title: floor.name,
            meta: floor.active ? "Floor active" : "Floor disabled",
            active: floor.active,
            onToggle: () => hubApi.updateFloor(floor.id, { active: !floor.active }).then(invalidate),
            onDelete: () => hubApi.deleteFloor(floor.id).then(invalidate),
            editForm: (close) => (
              <FloorEditForm floor={floor} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>

      <SetupCard title="Kitchens And Counters" done={bootstrap.productionUnits.some((unit) => unit.active)} icon={<ChefHat size={20} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createUnit.mutate(); }}>
          <label>
            Kitchen or counter name
            <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Main kitchen" />
          </label>
          <button disabled={!unitName.trim() || createUnit.isPending} type="submit">Add</button>
        </form>
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.productionUnits.map((unit) => ({
            id: unit.id,
            title: unit.name,
            meta: unit.active ? "Active" : "Disabled",
            active: unit.active,
            onToggle: () => hubApi.updateUnit(unit.id, { active: !unit.active }).then(invalidate),
            onDelete: () => hubApi.deleteUnit(unit.id).then(invalidate),
            editForm: (close) => (
              <UnitEditForm unit={unit} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>

      <SetupCard title="Dishes" done={rawSetupDishItems.some((item) => item.active)} icon={<ClipboardList size={20} />}>
        <form className="dish-form" onSubmit={(event) => { event.preventDefault(); createDish.mutate(); }}>
          <label>
            Dish name
            <input value={dishName} onChange={(event) => setDishName(event.target.value)} placeholder="Paneer tikka" />
          </label>
          <label>
            Price
            <input value={dishPrice} onChange={(event) => setDishPrice(event.target.value)} inputMode="decimal" placeholder="220" />
          </label>
          <label>
            Kitchen
            <select value={dishUnit} onChange={(event) => setDishUnit(event.target.value)}>
              <option value="">No kitchen yet</option>
              {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select value={dishGroup} onChange={(event) => setDishGroup(event.target.value)}>
              {dishSaleGroups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <button disabled={!dishName.trim() || dishPricePaise <= 0 || createDish.isPending} type="submit">Add dish</button>
        </form>
        <div className="setup-search-row">
          <input value={dishListSearch} onChange={(event) => setDishListSearch(event.target.value)} placeholder="Search saved dishes" />
        </div>
        <EditableRecordList
          setNotice={setNotice}
          rows={setupDishItems.map((item) => ({
            id: item.id,
            title: item.name,
            meta: `${formatInr(item.price_paise)} · ${item.sale_group_name} · ${item.production_unit_name ?? "No kitchen assigned"} · ${item.active ? "active" : "disabled"}`,
            active: item.active,
            onToggle: () => hubApi.updateDish(item.id, { active: !item.active }).then(invalidate),
            onDelete: () => hubApi.deleteDish(item.id).then(invalidate),
            editForm: (close) => (
              <DishEditForm item={item} units={bootstrap.productionUnits.filter((unit) => unit.active)} saleGroups={bootstrap.saleGroups.filter((group) => group.active)} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>
    </div>
  );
}

function AlcoholView({ bootstrap, setNotice, requestManagerApproval }: { bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const queryClient = useQueryClient();
  const alcohol = useQuery({ queryKey: ["alcohol"], queryFn: hubApi.alcohol });
  const [tab, setTab] = useState<"items" | "storage">("items");
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["alcohol"] });
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  return (
    <div className="alcohol-board">
      <div className="segment-row">
        <button type="button" className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>
          <Wine size={16} />
          Items
        </button>
        <button type="button" className={tab === "storage" ? "active" : ""} onClick={() => setTab("storage")}>
          <Beer size={16} />
          Storage
        </button>
      </div>
      {alcohol.isLoading ? <div className="loading-panel">Loading alcohol stock...</div> : null}
      {alcohol.error ? <div className="notice bad">{messageOf(alcohol.error)}</div> : null}
      {alcohol.data && tab === "items" ? <AlcoholItemsPanel bootstrap={bootstrap} catalog={alcohol.data} invalidate={invalidate} setNotice={setNotice} /> : null}
      {alcohol.data && tab === "storage" ? <AlcoholStoragePanel rows={alcohol.data.storage} invalidate={invalidate} setNotice={setNotice} requestManagerApproval={requestManagerApproval} /> : null}
    </div>
  );
}

function AlcoholItemsPanel({
  bootstrap,
  catalog,
  invalidate,
  setNotice
}: {
  bootstrap: Bootstrap;
  catalog: AlcoholCatalog;
  invalidate: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [type, setType] = useState<"plain_liquor" | "prepared_product">("plain_liquor");
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState(bootstrap.productionUnits.find((unit) => unit.name.toLowerCase().includes("bar"))?.id ?? "");
  const [largeMl, setLargeMl] = useState("750");
  const [smallMl, setSmallMl] = useState("180");
  const [sealedLarge, setSealedLarge] = useState("0");
  const [openMl, setOpenMl] = useState("0");
  const [sealedSmall, setSealedSmall] = useState("0");
  const [shotPrice, setShotPrice] = useState("");
  const [smallPrice, setSmallPrice] = useState("");
  const [largePrice, setLargePrice] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [recipe, setRecipe] = useState<Array<{ liquorMenuItemId: string; mlPerUnit: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const plainLiquors = catalog.items.filter((item) => item.type === "plain_liquor" && Boolean(item.active));
  const create = useMutation({
    mutationFn: () => {
      const largeBottleMl = Number(largeMl || 750);
      const smallBottleMl = Number(smallMl || 180);
      const variants =
        type === "plain_liquor"
          ? [
              { label: "30 ml", kind: "shot", pricePaise: rupeesToPaise(shotPrice), volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: rupeesToPaise(shotPrice) > 0 },
              { label: `${smallBottleMl} ml`, kind: "small_bottle", pricePaise: rupeesToPaise(smallPrice), volumeMl: smallBottleMl, inventoryAction: "small_bottle", sortOrder: 1, active: rupeesToPaise(smallPrice) > 0 },
              { label: `${largeBottleMl} ml`, kind: "large_bottle", pricePaise: rupeesToPaise(largePrice), volumeMl: largeBottleMl, inventoryAction: "large_bottle", sortOrder: 2, active: rupeesToPaise(largePrice) > 0 }
            ].filter((variant) => variant.active)
          : [{ label: "Regular", kind: "default", pricePaise: rupeesToPaise(productPrice), volumeMl: null, inventoryAction: "none", sortOrder: 0, active: true }];
      return hubApi.createAlcoholItem({
        type,
        name,
        productionUnitId: unitId || null,
        largeBottleMl,
        smallBottleMl,
        sealedLargeCount: Number(sealedLarge || 0),
        openLargeMl: Number(openMl || 0),
        sealedSmallCount: Number(sealedSmall || 0),
        variants,
        recipeIngredients: type === "prepared_product" ? recipe.filter((row) => row.liquorMenuItemId && Number(row.mlPerUnit) > 0).map((row) => ({ liquorMenuItemId: row.liquorMenuItemId, mlPerUnit: Number(row.mlPerUnit) })) : []
      });
    },
    onSuccess: async () => {
      setName("");
      setShotPrice("");
      setSmallPrice("");
      setLargePrice("");
      setProductPrice("");
      setRecipe([]);
      await invalidate();
      setNotice({ tone: "good", text: "Alcohol item added." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const canSubmit = name.trim() && (type === "plain_liquor" ? [shotPrice, smallPrice, largePrice].some((value) => rupeesToPaise(value) > 0) : rupeesToPaise(productPrice) > 0);

  return (
    <div className="alcohol-layout">
      <section className="panel alcohol-form-panel">
        <div className="panel-title">
          <h2>Add Alcohol Item</h2>
          <span>{type === "plain_liquor" ? "Liquor stock" : "Cocktail recipe"}</span>
        </div>
        <form className="alcohol-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value as "plain_liquor" | "prepared_product")}>
              <option value="plain_liquor">Plain liquor</option>
              <option value="prepared_product">Prepared alcohol product</option>
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "plain_liquor" ? "Royal Stag" : "Whisky Sour"} />
          </label>
          <label>
            Bar counter
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Alcohol group default</option>
              {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          {type === "plain_liquor" ? (
            <>
              <div className="three-col">
                <label>Large ml<input value={largeMl} onChange={(event) => setLargeMl(event.target.value)} inputMode="numeric" /></label>
                <label>Small ml<input value={smallMl} onChange={(event) => setSmallMl(event.target.value)} inputMode="numeric" /></label>
                <label>Open large ml<input value={openMl} onChange={(event) => setOpenMl(event.target.value)} inputMode="numeric" /></label>
              </div>
              <div className="three-col">
                <label>Large bottles<input value={sealedLarge} onChange={(event) => setSealedLarge(event.target.value)} inputMode="numeric" /></label>
                <label>Small bottles<input value={sealedSmall} onChange={(event) => setSealedSmall(event.target.value)} inputMode="numeric" /></label>
                <span />
              </div>
              <div className="three-col">
                <label>30 ml price<input value={shotPrice} onChange={(event) => setShotPrice(event.target.value)} inputMode="decimal" placeholder="120" /></label>
                <label>Small bottle price<input value={smallPrice} onChange={(event) => setSmallPrice(event.target.value)} inputMode="decimal" placeholder="480" /></label>
                <label>Large bottle price<input value={largePrice} onChange={(event) => setLargePrice(event.target.value)} inputMode="decimal" placeholder="1800" /></label>
              </div>
            </>
          ) : (
            <>
              <label>Price<input value={productPrice} onChange={(event) => setProductPrice(event.target.value)} inputMode="decimal" placeholder="350" /></label>
              <div className="recipe-list">
                {recipe.map((row, index) => (
                  <div className="recipe-row" key={index}>
                    <select value={row.liquorMenuItemId} onChange={(event) => setRecipe((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, liquorMenuItemId: event.target.value } : entry))}>
                      <option value="">Choose liquor</option>
                      {plainLiquors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input value={row.mlPerUnit} onChange={(event) => setRecipe((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, mlPerUnit: event.target.value } : entry))} inputMode="numeric" placeholder="ml" />
                    <button type="button" onClick={() => setRecipe((current) => current.filter((_, entryIndex) => entryIndex !== index))}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" className="secondary-inline" onClick={() => setRecipe((current) => [...current, { liquorMenuItemId: plainLiquors[0]?.id ?? "", mlPerUnit: "30" }])}>
                  <Plus size={14} />
                  Add liquor
                </button>
              </div>
            </>
          )}
          <button type="submit" disabled={!canSubmit || create.isPending}>Add alcohol item</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Alcohol Catalog</h2>
          <span>{catalog.items.length} items</span>
        </div>
        <div className="alcohol-item-list">
          {catalog.items.map((item) => (
            <article key={item.id} className="stock-row alcohol-catalog-row">
              <div>
                <strong>{item.name}</strong>
                <span>{item.type === "plain_liquor" ? `${item.large_bottle_ml} ml / ${item.small_bottle_ml} ml` : item.recipeIngredients.map((entry) => `${entry.ml_per_unit} ml ${entry.liquor_name}`).join(", ") || "No liquor recipe"}</span>
              </div>
              <div className="catalog-row-actions">
                <div className="variant-price-list">
                  {(item.variants ?? []).filter((variant) => Boolean(variant.active)).map((variant) => (
                    <span key={variant.id}>{variant.label} {formatInr(variant.price_paise)}</span>
                  ))}
                </div>
                <button type="button" className="secondary-inline" onClick={() => setEditingId((current) => current === item.id ? null : item.id)}>
                  <Pencil size={14} />
                  Edit
                </button>
              </div>
              {editingId === item.id ? (
                <AlcoholEditForm
                  item={item}
                  plainLiquors={plainLiquors}
                  units={bootstrap.productionUnits.filter((unit) => unit.active)}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await invalidate();
                  }}
                  setNotice={setNotice}
                />
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

type AlcoholItem = AlcoholCatalog["items"][number];
type AlcoholVariantKind = "default" | "shot" | "small_bottle" | "large_bottle";
type AlcoholInventoryAction = "none" | "large_ml" | "small_bottle" | "large_bottle";
type EditableAlcoholVariant = {
  id?: string;
  label: string;
  kind: AlcoholVariantKind;
  price: string;
  volumeMl: string;
  inventoryAction: AlcoholInventoryAction;
  sortOrder: number;
  active: boolean;
};

type MenuItemVariantOption = {
  id?: string;
  label: string;
  kind: string;
  price_paise: number;
};

function AlcoholEditForm({
  item,
  plainLiquors,
  units,
  onCancel,
  onSaved,
  setNotice
}: {
  item: AlcoholItem;
  plainLiquors: AlcoholItem[];
  units: ProductionUnit[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [type, setType] = useState<"plain_liquor" | "prepared_product">(item.type);
  const [name, setName] = useState(item.name);
  const [unitId, setUnitId] = useState(item.production_unit_id ?? "");
  const [active, setActive] = useState(Boolean(item.active));
  const [largeMl, setLargeMl] = useState(String(item.large_bottle_ml || 750));
  const [smallMl, setSmallMl] = useState(String(item.small_bottle_ml || 180));
  const [variants, setVariants] = useState<EditableAlcoholVariant[]>(() => buildEditableAlcoholVariants(item));
  const [recipe, setRecipe] = useState(() => item.recipeIngredients.map((entry) => ({ liquorMenuItemId: entry.liquor_menu_item_id, mlPerUnit: String(entry.ml_per_unit) })));
  const availableLiquors = plainLiquors.filter((liquor) => liquor.id !== item.id);
  const save = useMutation({
    mutationFn: () => {
      const normalizedVariants =
        type === "plain_liquor"
          ? variants
              .filter((variant) => rupeesToPaise(variant.price) > 0)
              .map((variant) => ({
                id: variant.id,
                label: variant.label || variantLabelForKind(variant.kind, Number(smallMl || 180), Number(largeMl || 750)),
                kind: variant.kind,
                pricePaise: rupeesToPaise(variant.price),
                volumeMl: Number(variant.volumeMl || 0) || null,
                inventoryAction: variant.inventoryAction,
                sortOrder: variant.sortOrder,
                active: variant.active
              }))
          : [
              {
                id: item.variants?.find((variant) => variant.kind === "default")?.id,
                label: "Regular",
                kind: "default" as const,
                pricePaise: rupeesToPaise(variants[0]?.price ?? ""),
                volumeMl: null,
                inventoryAction: "none" as const,
                sortOrder: 0,
                active: true
              }
            ];
      return hubApi.updateAlcoholItem(item.id, {
        type,
        name,
        productionUnitId: unitId || null,
        active,
        largeBottleMl: Number(largeMl || 750),
        smallBottleMl: Number(smallMl || 180),
        variants: normalizedVariants,
        recipeIngredients: type === "prepared_product" ? recipe.filter((row) => row.liquorMenuItemId && Number(row.mlPerUnit) > 0).map((row) => ({ liquorMenuItemId: row.liquorMenuItemId, mlPerUnit: Number(row.mlPerUnit) })) : []
      });
    },
    onSuccess: async () => {
      await onSaved();
      setNotice({ tone: "good", text: "Alcohol item updated." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const hasActivePricedVariant =
    type === "plain_liquor"
      ? variants.some((variant) => variant.active && rupeesToPaise(variant.price) > 0)
      : rupeesToPaise(variants[0]?.price ?? "") > 0;
  const canSave = name.trim() && (!active || hasActivePricedVariant);

  return (
    <form className="alcohol-edit-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <div className="three-col">
        <label>
          Type
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as "plain_liquor" | "prepared_product";
              setType(nextType);
              setVariants(nextType === "plain_liquor" ? editablePlainVariantDefaults(Number(smallMl || 180), Number(largeMl || 750)) : [{ ...defaultPreparedVariant(), price: variants.find((variant) => variant.active)?.price ?? variants[0]?.price ?? "" }]);
            }}
          >
            <option value="plain_liquor">Plain liquor</option>
            <option value="prepared_product">Prepared alcohol product</option>
          </select>
        </label>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>
          Bar counter
          <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
            <option value="">Alcohol group default</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active in menu
      </label>
      {type === "plain_liquor" ? (
        <>
          <div className="three-col">
            <label>Large ml<input value={largeMl} onChange={(event) => setLargeMl(event.target.value)} inputMode="numeric" /></label>
            <label>Small ml<input value={smallMl} onChange={(event) => setSmallMl(event.target.value)} inputMode="numeric" /></label>
            <span />
          </div>
          <div className="variant-edit-list">
            {variants.map((variant, index) => (
              <div className="variant-edit-row" key={variant.kind}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={variant.active} onChange={(event) => setVariants((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, active: event.target.checked } : entry))} />
                  Sell
                </label>
                <input value={variant.label} onChange={(event) => setVariants((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry))} placeholder="Label" />
                <input value={variant.volumeMl} onChange={(event) => setVariants((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, volumeMl: event.target.value } : entry))} inputMode="numeric" placeholder="ml" />
                <input value={variant.price} onChange={(event) => setVariants((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: event.target.value } : entry))} inputMode="decimal" placeholder="Price" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <label>Price<input value={variants[0]?.price ?? ""} onChange={(event) => setVariants((current) => [{ ...(current[0] ?? defaultPreparedVariant()), price: event.target.value }])} inputMode="decimal" /></label>
          <div className="recipe-list">
            {recipe.map((row, index) => (
              <div className="recipe-row" key={index}>
                <select value={row.liquorMenuItemId} onChange={(event) => setRecipe((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, liquorMenuItemId: event.target.value } : entry))}>
                  <option value="">Choose liquor</option>
                  {availableLiquors.map((liquor) => <option key={liquor.id} value={liquor.id}>{liquor.name}</option>)}
                </select>
                <input value={row.mlPerUnit} onChange={(event) => setRecipe((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, mlPerUnit: event.target.value } : entry))} inputMode="numeric" placeholder="ml" />
                <button type="button" onClick={() => setRecipe((current) => current.filter((_, entryIndex) => entryIndex !== index))}><X size={14} /></button>
              </div>
            ))}
            <button type="button" className="secondary-inline" onClick={() => setRecipe((current) => [...current, { liquorMenuItemId: availableLiquors[0]?.id ?? "", mlPerUnit: "30" }])}>
              <Plus size={14} />
              Add liquor
            </button>
          </div>
        </>
      )}
      <div className="form-actions">
        <button type="submit" disabled={!canSave || save.isPending}><Save size={14} />Save</button>
        <button type="button" className="secondary-inline" onClick={onCancel}><X size={14} />Cancel</button>
      </div>
    </form>
  );
}

function AlcoholStoragePanel({ rows, invalidate, setNotice, requestManagerApproval }: { rows: AlcoholStorageRow[]; invalidate: () => Promise<void>; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  return (
    <div className="storage-list">
      {rows.map((row) => (
        <AlcoholStorageCard key={row.id} row={row} invalidate={invalidate} setNotice={setNotice} requestManagerApproval={requestManagerApproval} />
      ))}
      {rows.length === 0 ? <Empty title="No liquor stock yet" text="Add plain liquor from the Items tab first." /> : null}
    </div>
  );
}

function AlcoholStorageCard({ row, invalidate, setNotice, requestManagerApproval }: { row: AlcoholStorageRow; invalidate: () => Promise<void>; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [large, setLarge] = useState("");
  const [open, setOpen] = useState("");
  const [small, setSmall] = useState("");
  const adjust = useMutation({
    mutationFn: (pin: string) => hubApi.adjustAlcoholStock(row.id, {
      mode,
      sealedLargeCount: large === "" ? undefined : Number(large),
      openLargeMl: open === "" ? undefined : Number(open),
      sealedSmallCount: small === "" ? undefined : Number(small),
      managerApproval: { pin, reason: "Alcohol stock edit", approvedBy: "manager" }
    }),
    onSuccess: async () => {
      setLarge("");
      setOpen("");
      setSmall("");
      await invalidate();
      setNotice({ tone: "good", text: "Alcohol stock updated." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  return (
    <article className="panel storage-card">
      <div className="panel-title">
        <div>
          <h2>{row.name}</h2>
          <span>{row.large_bottle_ml} ml large · {row.small_bottle_ml} ml small</span>
        </div>
        <strong>{row.total_available_ml} ml</strong>
      </div>
      <div className="stock-metrics">
        <span>Large bottles <b>{row.sealed_large_count}</b></span>
        <span>Open large <b>{row.open_large_ml} ml</b></span>
        <span>Small bottles <b>{row.sealed_small_count}</b></span>
        <span>Pending <b>{row.pending_total_ml} ml</b></span>
        <span>Expected <b>{row.expected_after_settlement_ml} ml</b></span>
      </div>
      <form
        className="stock-adjust-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const approval = await requestManagerApproval({
            title: `Approve stock edit for ${row.name}`,
            defaultReason: "Alcohol stock edit",
            confirmLabel: "Save stock",
            danger: true
          }).catch(() => null);
          if (!approval) return;
          adjust.mutate(approval.pin);
        }}
      >
        <select value={mode} onChange={(event) => setMode(event.target.value as "delta" | "set")}>
          <option value="delta">Plus / minus</option>
          <option value="set">Set exact</option>
        </select>
        <input value={large} onChange={(event) => setLarge(event.target.value)} placeholder="Large bottles" inputMode="numeric" />
        <input value={open} onChange={(event) => setOpen(event.target.value)} placeholder="Open ml" inputMode="numeric" />
        <input value={small} onChange={(event) => setSmall(event.target.value)} placeholder="Small bottles" inputMode="numeric" />
        <button type="submit" disabled={adjust.isPending}>Save</button>
      </form>
    </article>
  );
}

function OrdersView({ bootstrap, setNotice, requestManagerApproval }: { bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const selectedTableId = useHubStore((state) => state.selectedTableId);
  const selectTable = useHubStore((state) => state.selectTable);
  const search = useHubStore((state) => state.menuSearch);
  const setSearch = useHubStore((state) => state.setMenuSearch);
  const recentMenuItemIds = useHubStore((state) => state.recentMenuItemIds);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const [saleGroupFilter, setSaleGroupFilter] = useState<SaleGroupKind | "all">("all");
  const [unitFilter, setUnitFilter] = useState("");
  const selectedTable = bootstrap.tables.find((table) => table.id === selectedTableId) ?? bootstrap.tables.find((table) => table.active) ?? null;

  useEffect(() => {
    if (!selectedTableId && selectedTable) selectTable(selectedTable.id);
  }, [selectedTableId, selectedTable, selectTable]);

  const hasSearch = search.trim().length > 0;
  const searchFilters = {
    saleGroupKind: saleGroupFilter,
    productionUnitId: unitFilter || undefined
  };
  const quickPicks = hasSearch ? [] : rankMenuQuickPicks(bootstrap.menuItems, recentMenuItemIds, bootstrap.menuPopularity ?? [], searchFilters).slice(0, 10);
  const quickPickIds = new Set(quickPicks.map((pick) => pick.item.id));
  const activeItems = searchMenuItems(bootstrap.menuItems, search, searchFilters)
    .filter((item) => hasSearch || !quickPickIds.has(item.id));
  const saleGroupKinds = Array.from(new Map(bootstrap.saleGroups.filter((group) => group.active).map((group) => [group.kind, group.name])).entries());

  return (
    <div className="orders-grid">
      <section className="table-map panel">
        <div className="panel-title">
          <h2>Tables</h2>
          <span>{bootstrap.tables.filter((table) => table.active).length} active</span>
        </div>
        <div className="floor-table-list">
          {bootstrap.floors.filter((floor) => floor.active).map((floor) => {
            const floorTables = bootstrap.tables.filter((table) => table.active && table.floor_id === floor.id);
            if (!floorTables.length) return null;
            return (
              <div className="floor-group" key={floor.id}>
                <h3>{floor.name}</h3>
                <div className="table-list">
                  {floorTables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className={
                        table.id === selectedTable?.id
                          ? `table-tile ${tableDisplayClass(getTableDisplayState(table))} active`
                          : `table-tile ${tableDisplayClass(getTableDisplayState(table))}`
                      }
                      onClick={() => selectTable(table.id)}
                    >
                      <strong>{table.name}</strong>
                      <span>{tableDisplayLabel(getTableDisplayState(table))}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="menu-browser panel">
        <div className="panel-title">
          <h2>Menu</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dish" />
        </div>
        <div className="menu-filter-row" aria-label="Menu filters">
          <button type="button" className={saleGroupFilter === "all" ? "active" : ""} onClick={() => setSaleGroupFilter("all")}>All</button>
          {saleGroupKinds.map(([kind, label]) => (
            <button key={kind} type="button" className={saleGroupFilter === kind ? "active" : ""} onClick={() => setSaleGroupFilter(kind as SaleGroupKind)}>
              {label}
            </button>
          ))}
          <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} aria-label="Kitchen or counter filter">
            <option value="">All kitchens</option>
            {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
        </div>
        {selectedTable ? (
          <>
            {quickPicks.some((pick) => pick.section === "recent") ? (
              <MenuResultSection
                title="Recent"
                items={quickPicks.filter((pick) => pick.section === "recent").map((pick) => pick.item)}
                selectedTableId={selectedTable.id}
                onAdd={addDraftItem}
              />
            ) : null}
            {quickPicks.some((pick) => pick.section === "popular") ? (
              <MenuResultSection
                title="Popular today"
                items={quickPicks.filter((pick) => pick.section === "popular").map((pick) => pick.item)}
                selectedTableId={selectedTable.id}
                onAdd={addDraftItem}
              />
            ) : null}
            <MenuResultSection
              title={hasSearch ? "Best matches" : "All dishes"}
              items={activeItems}
              selectedTableId={selectedTable.id}
              onAdd={addDraftItem}
              emptyText={hasSearch ? "No dishes found. Check spelling or clear filters." : "No dishes found. Add active dishes in setup."}
            />
          </>
        ) : (
          <Empty title="Add a table first" text="Setup needs at least one active table before orders can start." />
        )}
      </section>

      <TableWorkspace tableId={selectedTable?.id ?? null} tableName={selectedTable?.name ?? ""} bootstrap={bootstrap} setNotice={setNotice} requestManagerApproval={requestManagerApproval} />
    </div>
  );
}

function MenuResultSection({
  title,
  items,
  selectedTableId,
  onAdd,
  emptyText
}: {
  title: string;
  items: MenuItem[];
  selectedTableId: string;
  onAdd: (tableId: string, item: MenuItem, variantId?: string) => void;
  emptyText?: string;
}) {
  return (
    <div className="menu-result-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="menu-grid">
          {items.map((item) => (
            <MenuCard key={item.id} item={item} onAdd={(variantId) => onAdd(selectedTableId, item, variantId)} />
          ))}
        </div>
      ) : emptyText ? (
        <Empty title="No dishes found" text={emptyText} />
      ) : null}
    </div>
  );
}

function MenuCard({ item, onAdd }: { item: MenuItem; onAdd: (variantId?: string) => void }) {
  const activeVariants = (item.variants ?? []).filter((variant) => Boolean(variant.active));
  const variants = activeVariants.length || item.sale_group_kind === "alcohol" ? activeVariants : [{ id: "", label: "Regular", kind: "default", price_paise: item.price_paise, volume_ml: null, inventory_action: "none", sort_order: 0, active: true }];
  return (
    <article className="menu-card">
      <div>
        <strong>{item.name}</strong>
        <span>{item.production_unit_name ?? "No kitchen assigned"}</span>
      </div>
      <footer>
        {variants.length === 0 ? (
          <>
            <b>Unavailable</b>
            <button type="button" disabled aria-label={`${item.name} unavailable`}>
              <Plus size={18} />
            </button>
          </>
        ) : variants.length === 1 ? (
          <>
            <b>{formatInr(variants[0]?.price_paise ?? item.price_paise)}</b>
            <button type="button" onClick={() => onAdd(variants[0]?.id || undefined)} aria-label={`Add ${item.name}`}>
              <Plus size={18} />
            </button>
          </>
        ) : (
          <div className="variant-buttons">
            {variants.map((variant) => (
              <button key={variant.id} type="button" onClick={() => onAdd(variant.id)}>
                <span>{variant.label}</span>
                <b>{formatInr(variant.price_paise)}</b>
              </button>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}

function TableWorkspace({ tableId, tableName, bootstrap, setNotice, requestManagerApproval }: { tableId: string | null; tableName: string; bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const queryClient = useQueryClient();
  const orderPanel = useHubStore((state) => state.orderPanel);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const drafts = useHubStore((state) => state.drafts);
  const addOpenDraftItem = useHubStore((state) => state.addOpenDraftItem);
  const changeDraftQty = useHubStore((state) => state.changeDraftQty);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [guests, setGuests] = useState("2");
  const [openName, setOpenName] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [openGroup, setOpenGroup] = useState("sg-food");
  const [openUnit, setOpenUnit] = useState("");
  const [shiftTargetTableId, setShiftTargetTableId] = useState("");
  const operationKeys = useOperationKeys();
  const draft = tableId ? Object.values(drafts[tableId] ?? {}) : [];
  const tableOrder = useQuery({
    queryKey: ["tableOrder", tableId],
    queryFn: () => hubApi.tableOrder(tableId as string),
    enabled: Boolean(tableId)
  });
  const data = tableOrder.data;
  const sentItems = (data?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const shiftTargets = bootstrap.tables.filter((table) => table.active && table.id !== tableId && table.status === "free");
  const draftTotal = draft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);

  const refreshTable = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    await queryClient.invalidateQueries({ queryKey: ["tableOrder", tableId] });
  };

  const submitOrder = useMutation({
    mutationFn: () => {
      if (!tableId || draft.length === 0) throw new Error("Add at least one new dish before sending to kitchen.");
      const payload = {
        tableId,
        pax: Number(guests || 1),
        items: draft.map((item) =>
          item.openName
            ? {
                openName: item.openName,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId ?? "sg-food",
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
            : { menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity }
        )
      };
      return hubApi.submitOrder(payload, operationKeys.keyFor("orders-submit", payload));
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      await refreshTable();
      setOrderPanel("sent");
      setNotice({ tone: "good", text: "Sent to kitchen. New item list is clear now." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const generateBill = useMutation({
    mutationFn: () => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to bill.");
      return hubApi.generateBill(orderId, operationKeys.keyFor("bill-generate", { orderId }));
    },
    onSuccess: async () => {
      await refreshTable();
      setOrderPanel("bill");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const cancelOrder = useMutation({
    mutationFn: (approval: ManagerApproval) => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to cancel.");
      return hubApi.cancelOrder(orderId, { managerApproval: approval });
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      await refreshTable();
      setOrderPanel("new");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const shiftItem = useMutation({
    mutationFn: (itemId: string) => {
      if (!tableId || !shiftTargetTableId) throw new Error("Choose a free target table first.");
      return hubApi.moveItems({
        fromTableId: tableId,
        toTableId: shiftTargetTableId,
        reason: "Items shifted from hub",
        items: [{ orderItemId: itemId, quantity: 1 }]
      });
    },
    onSuccess: async () => {
      await refreshTable();
      setNotice({ tone: "good", text: "Item shifted to the selected table." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  if (!tableId) {
    return (
      <section className="ticket-workspace panel">
        <Empty title="No table selected" text="Choose or add a table before taking an order." />
      </section>
    );
  }

  return (
    <section className="ticket-workspace panel">
      <div className="ticket-header">
        <div>
          <span>Selected table</span>
          <h2>{tableName}</h2>
        </div>
        <div className="total-chip">{formatInr(draftTotal + sentTotal)}</div>
      </div>
      <div className="segmented">
        <button type="button" className={orderPanel === "new" ? "active" : ""} onClick={() => setOrderPanel("new")}>New order</button>
        <button type="button" className={orderPanel === "sent" ? "active" : ""} onClick={() => setOrderPanel("sent")}>Sent items</button>
        <button type="button" className={orderPanel === "bill" ? "active" : ""} onClick={() => setOrderPanel("bill")}>Bill</button>
      </div>

      {orderPanel === "new" ? (
        <div className="ticket-section">
          <div className="guest-row">
            <label>
              Guests
              <input value={guests} onChange={(event) => setGuests(event.target.value)} inputMode="numeric" />
            </label>
            <button type="button" disabled={draft.length === 0 || submitOrder.isPending} onClick={() => submitOrder.mutate()}>
              {submitOrder.isPending ? "Sending..." : "Send to kitchen"}
            </button>
          </div>
          <form
            className="open-item-form"
            onSubmit={(event) => {
              event.preventDefault();
              const pricePaise = Math.round(Number(openPrice || 0) * 100);
              if (!openName.trim() || pricePaise <= 0) {
                setNotice({ tone: "bad", text: "Enter open item name and price." });
                return;
              }
              addOpenDraftItem(tableId, {
                name: openName.trim(),
                pricePaise,
                saleGroupId: openGroup,
                productionUnitId: openUnit || null
              });
              setOpenName("");
              setOpenPrice("");
            }}
          >
            <label>
              Open item
              <input value={openName} onChange={(event) => setOpenName(event.target.value)} placeholder="Open food / bar item" />
            </label>
            <label>
              Price
              <input value={openPrice} onChange={(event) => setOpenPrice(event.target.value)} inputMode="decimal" />
            </label>
            <label>
              Group
              <select value={openGroup} onChange={(event) => setOpenGroup(event.target.value)}>
                {bootstrap.saleGroups.filter((group) => group.active).map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>
            <label>
              Print to
              <select value={openUnit} onChange={(event) => setOpenUnit(event.target.value)}>
                <option value="">Group default / no KOT</option>
                {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
            <button type="submit">Add open item</button>
          </form>
          <LineItems
            emptyTitle="No new dishes selected"
            emptyText="Tap dishes from the menu. This list is only new items not sent yet."
            rows={draft.map((item) => ({
              id: item.lineKey,
              title: item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name,
              meta: `${formatInr(item.pricePaise)} each`,
              quantity: item.quantity,
              amount: item.pricePaise * item.quantity,
              onMinus: () => changeDraftQty(tableId, item.lineKey, -1),
              onPlus: () => changeDraftQty(tableId, item.lineKey, 1)
            }))}
          />
        </div>
      ) : null}

      {orderPanel === "sent" ? (
        <div className="ticket-section">
          <LineItems
            emptyTitle="Nothing sent yet"
            emptyText="After Send to kitchen succeeds, server-confirmed items appear here."
            rows={sentItems.map((item) => ({
              id: item.id,
              title: item.name_snapshot,
              meta: `${formatInr(item.unit_price_paise)} each · ${item.production_unit_name ?? "No kitchen assigned"}`,
              quantity: item.quantity,
              amount: item.unit_price_paise * item.quantity
            }))}
          />
          {data?.order ? (
            <div className="shift-panel">
              <label>
                Shift one item to
                <select value={shiftTargetTableId} onChange={(event) => setShiftTargetTableId(event.target.value)}>
                  <option value="">Choose free table</option>
                  {shiftTargets.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                </select>
              </label>
              <div className="shift-actions">
                {sentItems.map((item) => (
                  <button key={item.id} type="button" disabled={!shiftTargetTableId || shiftItem.isPending} onClick={() => shiftItem.mutate(item.id)}>
                    Move 1 x {item.name_snapshot}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {data?.order ? (
            <button
              type="button"
              className="danger-link"
              disabled={cancelOrder.isPending}
              onClick={async () => {
                const approval = await requestManagerApproval({
                  title: "Cancel running order",
                  defaultReason: "Order cancelled",
                  confirmLabel: cancelOrder.isPending ? "Cancelling..." : "Cancel order",
                  danger: true
                }).catch(() => null);
                if (approval) cancelOrder.mutate(approval);
              }}
            >
              {cancelOrder.isPending ? "Cancelling..." : "Cancel order"}
            </button>
          ) : null}
        </div>
      ) : null}

      {orderPanel === "bill" ? (
        <BillingPanel
          tableOrder={data}
          menuItems={bootstrap.menuItems}
          sentTotal={sentTotal}
          generateBill={() => generateBill.mutate()}
          generating={generateBill.isPending || tableOrder.isFetching}
          onSettled={refreshTable}
          setNotice={setNotice}
          requestManagerApproval={requestManagerApproval}
        />
      ) : null}
    </section>
  );
}

type RevisionItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string;
  menuItemVariantId?: string;
  openName?: string;
  pricePaise: number;
  saleGroupId: string;
  productionUnitId?: string | null;
  name: string;
  quantity: number;
};

function BillingPanel({
  tableOrder,
  menuItems,
  sentTotal,
  generateBill,
  generating,
  onSettled,
  setNotice,
  requestManagerApproval
}: {
  tableOrder?: TableOrder | null;
  menuItems: MenuItem[];
  sentTotal: number;
  generateBill: () => void;
  generating: boolean;
  onSettled: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discount, setDiscount] = useState("0");
  const [tip, setTip] = useState("0");
  const [reference, setReference] = useState("");
  const [payments, setPayments] = useState({ cash: "0", upi: "0", card: "0", online: "0" });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionItems, setRevisionItems] = useState<RevisionItem[]>([]);
  const [revisionAddMenuItemId, setRevisionAddMenuItemId] = useState("");
  const [revisionAddVariantId, setRevisionAddVariantId] = useState("");
  const [revisionSearch, setRevisionSearch] = useState("");
  const operationKeys = useOperationKeys();
  const pendingScopes = useRef<Record<string, unknown>>({});
  const bill = tableOrder?.bill;
  const revisionAddMenuItem = menuItems.find((menuItem) => menuItem.id === revisionAddMenuItemId);
  const revisionAddVariants = menuItemVariantOptions(revisionAddMenuItem);
  const revisionSearchItems = searchMenuItems(menuItems, revisionSearch);
  const existingPaid = bill?.paid_paise ?? (tableOrder?.payments ?? []).reduce((total, payment) => total + payment.amount_paise, 0);
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(100, Number(discount || 0))) / 100)
      : Math.round(Number(discount || 0) * 100)
    : 0;
  const tipPaise = Math.round(Number(tip || 0) * 100);
  const finalTotal = bill ? Math.max(0, bill.total_paise - discountPaise + tipPaise) : 0;
  const newPaid = Object.values(payments).reduce((total, value) => total + Math.round(Number(value || 0) * 100), 0);
  const remaining = Math.max(0, finalTotal - existingPaid - newPaid);
  const overpaid = Math.max(0, existingPaid + newPaid - finalTotal);

  const settle = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill before taking payment.");
      const rows = (Object.entries(payments) as Array<[keyof typeof payments, string]>)
        .map(([method, value]) => ({ method, amountPaise: Math.round(Number(value || 0) * 100), reference: reference || undefined }))
        .filter((row) => row.amountPaise > 0);
      if (rows.length === 0) throw new Error("Enter at least one payment.");
      if (remaining > 0) throw new Error("Payment is less than the bill balance.");
      if (overpaid > 0) throw new Error(`Payment is ${formatInr(overpaid)} more than the bill balance.`);
      const payload = { discountType, discountValue: discountType === "percent" ? Number(discount || 0) : discountPaise, tipPaise, payments: rows };
      const scope = { billId: bill.id, existingPaid, payload };
      pendingScopes.current["bill-settle"] = scope;
      return hubApi.settleBill(bill.id, payload, operationKeys.keyFor("bill-settle", scope));
    },
    onSuccess: async () => {
      if (pendingScopes.current["bill-settle"]) operationKeys.clear("bill-settle", pendingScopes.current["bill-settle"]);
      await onSettled();
      await queryClient.invalidateQueries({ queryKey: ["dailyReports"] });
      setPayments({ cash: "0", upi: "0", card: "0", online: "0" });
      setReference("");
      setNotice({ tone: "good", text: "Bill punched. Table state refreshed from the hub." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const printBill = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill first.");
      return hubApi.printBill(bill.id, operationKeys.keyFor("bill-print", { billId: bill.id }));
    },
    onSuccess: () => setNotice({ tone: "good", text: "Bill print queued." }),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const reprintBill = useMutation({
    mutationFn: (approval: ManagerApproval) => {
      if (!bill) throw new Error("Generate the bill first.");
      const payload = { managerApproval: approval };
      const scope = { billId: bill.id, payload };
      pendingScopes.current["bill-reprint"] = scope;
      return hubApi.reprintBill(bill.id, payload, operationKeys.keyFor("bill-reprint", scope));
    },
    onSuccess: () => {
      if (pendingScopes.current["bill-reprint"]) operationKeys.clear("bill-reprint", pendingScopes.current["bill-reprint"]);
      setNotice({ tone: "good", text: "Reprint queued after manager approval." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const markNc = useMutation({
    mutationFn: (approval: ManagerApproval) => {
      if (!bill) throw new Error("Generate the bill first.");
      const payload = { managerApproval: approval };
      const scope = { billId: bill.id, payload };
      pendingScopes.current["bill-nc"] = scope;
      return hubApi.markBillNc(bill.id, payload, operationKeys.keyFor("bill-nc", scope));
    },
    onSuccess: async () => {
      if (pendingScopes.current["bill-nc"]) operationKeys.clear("bill-nc", pendingScopes.current["bill-nc"]);
      await onSettled();
      setNotice({ tone: "good", text: "NC bill printed and excluded from sales totals." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const reviseBill = useMutation({
    mutationFn: (approval: ManagerApproval) => {
      if (!bill) throw new Error("Generate the bill first.");
      const items = revisionItems
        .filter((item) => item.quantity > 0)
        .map((item) =>
          item.menuItemId
            ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity }
            : {
                orderItemId: item.orderItemId,
                openName: item.openName ?? item.name,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId,
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
        );
      if (items.length === 0) throw new Error("A revised bill needs at least one item.");
      const payload = { items, managerApproval: approval };
      const scope = { billId: bill.id, payload };
      pendingScopes.current["bill-revise"] = scope;
      return hubApi.reviseBill(bill.id, payload, operationKeys.keyFor("bill-revise", scope));
    },
    onSuccess: async () => {
      if (pendingScopes.current["bill-revise"]) operationKeys.clear("bill-revise", pendingScopes.current["bill-revise"]);
      setRevisionOpen(false);
      await onSettled();
      setNotice({ tone: "good", text: "Bill revised and totals refreshed." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  function fillFull(method: keyof typeof payments) {
    setPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(Math.max(0, finalTotal - existingPaid) / 100) });
  }

  function openRevisionEditor() {
    const rows = (tableOrder?.items ?? [])
      .filter((item) => item.status !== "cancelled" && item.quantity > 0)
      .map((item) => ({
        key: item.id,
        orderItemId: item.id,
        menuItemId: item.menu_item_id ?? undefined,
        menuItemVariantId: item.menu_item_variant_id ?? undefined,
        openName: item.menu_item_id ? undefined : item.name_snapshot,
        pricePaise: item.unit_price_paise,
        saleGroupId: item.sale_group_id,
        productionUnitId: item.production_unit_id,
        name: item.name_snapshot,
        quantity: item.quantity
      }));
    setRevisionItems(rows);
    setRevisionOpen(true);
  }

  function changeRevisionQty(key: string, delta: number) {
    setRevisionItems((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  }

  function addRevisionDish() {
    const item = revisionAddMenuItem;
    if (!item) return;
    const variant = revisionAddVariants.find((entry) => (entry.id ?? "") === revisionAddVariantId) ?? revisionAddVariants[0];
    const variantId = variant?.id;
    const lineName = variant && variant.kind !== "default" ? `${item.name} ${variant.label}` : item.name;
    setRevisionItems((current) => {
      const existing = current.find((row) => row.menuItemId === item.id && (row.menuItemVariantId ?? "") === (variantId ?? ""));
      if (existing) return current.map((row) => row.key === existing.key ? { ...row, quantity: row.quantity + 1 } : row);
      return [
        ...current,
        {
          key: `new-${item.id}-${variantId ?? "default"}`,
          menuItemId: item.id,
          menuItemVariantId: variantId,
          pricePaise: variant?.price_paise ?? item.price_paise,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name: lineName,
          quantity: 1
        }
      ];
    });
  }

  if (!tableOrder?.order) {
    return <Empty title="No active order" text="Add dishes and send them before generating a bill." />;
  }

  if (!bill) {
    return (
      <div className="bill-start">
        <div>
          <span>Current table total</span>
          <strong>{formatInr(sentTotal)}</strong>
        </div>
        <button type="button" disabled={sentTotal <= 0 || generating} onClick={generateBill}>
          {generating ? "Generating..." : "Generate bill"}
        </button>
      </div>
    );
  }

  return (
    <div className="billing-panel">
      <div className="bill-metrics">
        <Metric label="Bill total" value={formatInr(finalTotal)} />
        <Metric label="Already paid" value={formatInr(existingPaid)} />
        <Metric label="Balance" value={formatInr(Math.max(0, finalTotal - existingPaid))} />
      </div>
      {bill.revision_number ? <p className="plain-state">Bill revision {bill.revision_number}{bill.is_nc ? ` · NC: ${bill.nc_reason ?? ""}` : ""}</p> : null}
      <div className="action-strip">
        <button type="button" disabled={printBill.isPending} onClick={() => printBill.mutate()}>Print bill only</button>
      </div>
      <div className="adjust-grid">
        <label>
          Discount
          <span className="split-input">
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "amount" | "percent")}>
              <option value="amount">Rs</option>
              <option value="percent">%</option>
            </select>
            <input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" />
          </span>
        </label>
        <label>
          Tip
          <input value={tip} onChange={(event) => setTip(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="quick-pay">
        <button type="button" onClick={() => fillFull("cash")}>Full cash</button>
        <button type="button" onClick={() => fillFull("upi")}>Full UPI</button>
        <button type="button" onClick={() => fillFull("card")}>Full card</button>
        <button type="button" onClick={() => fillFull("online")}>Full online</button>
      </div>
      <div className="payment-grid">
        {(["cash", "upi", "card", "online"] as const).map((method) => (
          <label key={method}>
            {method.toUpperCase()}
            <input value={payments[method]} onChange={(event) => setPayments((current) => ({ ...current, [method]: event.target.value }))} inputMode="decimal" />
          </label>
        ))}
      </div>
      <label>
        Payment note
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UPI ref, card slip, or captain note" />
      </label>
      <button type="button" className="punch-button" disabled={settle.isPending || newPaid <= 0 || remaining > 0 || overpaid > 0} onClick={() => settle.mutate()}>
        {settle.isPending ? "Punching..." : `Punch bill · ${remaining > 0 ? `${formatInr(remaining)} left` : "paid"}`}
      </button>
      {overpaid > 0 ? <p className="plain-state bad">Payment is {formatInr(overpaid)} more than the balance.</p> : null}
      <div className="action-strip">
        <button
          type="button"
          className="secondary-button"
          disabled={reprintBill.isPending}
          onClick={async () => {
            const approval = await requestManagerApproval({
              title: "Approve bill reprint",
              defaultReason: "Bill reprint",
              confirmLabel: reprintBill.isPending ? "Queueing..." : "Reprint bill"
            }).catch(() => null);
            if (approval) reprintBill.mutate(approval);
          }}
        >
          {reprintBill.isPending ? "Queueing..." : "Reprint bill"}
        </button>
      </div>
      {!revisionOpen ? (
        <button type="button" className="secondary-button" disabled={Boolean(bill.is_nc) || existingPaid > 0} onClick={openRevisionEditor}>
          Revise printed bill
        </button>
      ) : (
        <div className="revision-box">
          <div className="revision-head">
            <strong>Revise bill items</strong>
            <button type="button" onClick={() => setRevisionOpen(false)}>Cancel</button>
          </div>
          <div className="revision-add-row">
            <input value={revisionSearch} onChange={(event) => setRevisionSearch(event.target.value)} placeholder="Search dish to add" />
            <select
              value={revisionAddMenuItemId}
              onChange={(event) => {
                const nextItemId = event.target.value;
                const nextItem = menuItems.find((item) => item.id === nextItemId);
                const nextVariants = menuItemVariantOptions(nextItem);
                setRevisionAddMenuItemId(nextItemId);
                setRevisionAddVariantId(nextVariants[0]?.id ?? "");
              }}
            >
              <option value="">Add dish</option>
              {revisionSearchItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {formatInr(item.price_paise)}</option>
              ))}
            </select>
            {revisionAddVariants.length > 1 ? (
              <select value={revisionAddVariantId} onChange={(event) => setRevisionAddVariantId(event.target.value)}>
                {revisionAddVariants.map((variant) => (
                  <option key={variant.id ?? "default"} value={variant.id ?? ""}>
                    {variant.kind === "default" ? "Regular" : variant.label} · {formatInr(variant.price_paise)}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" disabled={!revisionAddMenuItemId} onClick={addRevisionDish}>Add</button>
          </div>
          <LineItems
            emptyTitle="No bill items"
            emptyText="Add at least one item before saving the revised bill."
            rows={revisionItems.map((item) => ({
              id: item.key,
              title: item.name,
              meta: `${formatInr(item.pricePaise)} each`,
              quantity: item.quantity,
              amount: item.pricePaise * item.quantity,
              onMinus: () => changeRevisionQty(item.key, -1),
              onPlus: () => changeRevisionQty(item.key, 1)
            }))}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={reviseBill.isPending || revisionItems.every((item) => item.quantity <= 0)}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Approve revised bill",
                defaultReason: "Bill revised",
                confirmLabel: reviseBill.isPending ? "Saving..." : "Save revised bill",
                danger: true
              }).catch(() => null);
              if (approval) reviseBill.mutate(approval);
            }}
          >
            {reviseBill.isPending ? "Saving revision..." : "Save revised bill"}
          </button>
        </div>
      )}
      <button
        type="button"
        className="danger-link"
        disabled={markNc.isPending}
        onClick={async () => {
          const approval = await requestManagerApproval({
            title: "Approve NC bill",
            defaultReason: "NC bill",
            message: "NC bills print normally, but their money is excluded from sales totals.",
            confirmLabel: markNc.isPending ? "Marking..." : "Mark NC bill",
            danger: true
          }).catch(() => null);
          if (approval) markNc.mutate(approval);
        }}
      >
        {markNc.isPending ? "Marking NC..." : "Mark NC bill"}
      </button>
    </div>
  );
}

function KitchenView({ bootstrap, setNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const selectedKdsUnitId = useHubStore((state) => state.selectedKdsUnitId);
  const setSelectedKdsUnitId = useHubStore((state) => state.setSelectedKdsUnitId);
  const activeUnits = bootstrap.productionUnits.filter((unit) => unit.active);
  const unitId = selectedKdsUnitId ?? activeUnits[0]?.id ?? "";

  useEffect(() => {
    if (!selectedKdsUnitId && activeUnits[0]) setSelectedKdsUnitId(activeUnits[0].id);
  }, [selectedKdsUnitId, activeUnits, setSelectedKdsUnitId]);

  const tickets = useQuery({ queryKey: ["kds", unitId], queryFn: () => hubApi.kds(unitId), enabled: Boolean(unitId) });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => hubApi.updateKotStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kds", unitId] });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="kitchen-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Kitchen screen</h2>
          <select value={unitId} onChange={(event) => setSelectedKdsUnitId(event.target.value)}>
            {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </div>
        {!unitId ? <Empty title="No kitchen added" text="Add a kitchen or counter in Setup." /> : null}
        <div className="kot-grid">
          {(tickets.data ?? []).map((ticket) => (
            <article key={ticket.id} className="kot-card">
              <header>
                <strong>#{ticket.sequence} · {ticket.table_name}</strong>
                <span>{ticket.status}</span>
              </header>
              <ul>
                {ticket.items.map((item, index) => <li key={`${item.name_snapshot}-${index}`}>{item.quantity_delta} x {item.name_snapshot}</li>)}
              </ul>
              <footer>
                {["preparing", "ready", "served"].map((status) => (
                  <button key={status} type="button" disabled={ticket.status === status || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: ticket.id, status })}>
                    {status}
                  </button>
                ))}
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView() {
  const currentSummary = useQuery({ queryKey: ["currentBusinessDaySummary"], queryFn: hubApi.currentBusinessDaySummary });
  const dailyReports = useQuery({ queryKey: ["dailyReports"], queryFn: hubApi.dailyReports });
  const alcoholStockMovements = useQuery({ queryKey: ["alcoholStockMovements"], queryFn: hubApi.alcoholStockMovements });
  const summary = currentSummary.data;

  return (
    <div className="reports-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Current business day</h2>
          <span>{summary?.businessDay.business_date ?? "6 AM IST boundary"}</span>
        </div>
        {summary ? (
          <>
            <div className="report-metrics">
              <Metric label="Sales" value={formatInr(summary.finalSalesPaise)} />
              <Metric label="Cash" value={formatInr(summary.cashPaymentsPaise)} />
              <Metric label="UPI/Card/Online" value={formatInr(summary.nonCashPaymentsPaise)} />
              <Metric label="Bills" value={String(summary.billCount)} />
            </div>
            <p className="plain-state">This day started at {new Date(summary.businessDay.period_start_at).toLocaleString()} and ends at {new Date(summary.businessDay.period_end_at).toLocaleString()}.</p>
            {summary.openOrders > 0 || summary.billedOrders > 0 ? <p className="warning-text">There are running or billed tables in this business day.</p> : null}
          </>
        ) : (
          <Empty title="Report loading" text="The hub creates business days automatically at 6:00 AM IST." />
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Closed day reports</h2>
          <span>{dailyReports.data?.length ?? 0} saved</span>
        </div>
        <div className="report-list">
          {(dailyReports.data ?? []).map((report) => (
            <article key={report.pos_day_id} className="report-row">
              <div>
                <strong>{report.business_date}</strong>
                <span>{report.bill_count} bills · {formatInr(report.final_sales_paise)} sales</span>
              </div>
              <div>
                <b>{formatInr(report.total_payments_paise)}</b>
                <span>finalized {new Date(report.finalized_at).toLocaleString()}</span>
              </div>
            </article>
          ))}
          {!dailyReports.data?.length ? <Empty title="No finalized reports yet" text="Reports finalize automatically after the 6 AM boundary once that day's tables are settled or cancelled." /> : null}
        </div>
      </section>

      <section className="panel reports-wide">
        <div className="panel-title">
          <h2>Alcohol stock movements</h2>
          <span>{alcoholStockMovements.data?.length ?? 0} recent</span>
        </div>
        <div className="report-list">
          {(alcoholStockMovements.data ?? []).map((movement) => (
            <article key={movement.id} className="report-row stock-movement-row">
              <div>
                <strong>{movement.item_name}</strong>
                <span>{alcoholMovementSourceLabel(movement.source_type)} · {alcoholMovementDeltaText(movement)}</span>
              </div>
              <div>
                <b>{movement.balance_sealed_large} large · {movement.balance_open_large_ml} ml · {movement.balance_sealed_small} small</b>
                <span>{new Date(movement.created_at).toLocaleString()}</span>
              </div>
            </article>
          ))}
          {!alcoholStockMovements.data?.length ? <Empty title="No alcohol stock history yet" text="Stock sales, settlements, manual edits, and negative-stock events will appear here." /> : null}
        </div>
      </section>
    </div>
  );
}

function AdvancedView({
  bootstrap,
  setNotice,
  requestManagerApproval,
  onLocked
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onLocked: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState("");
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBackups, setResetBackups] = useState(false);
  const pullCloud = useMutation({
    mutationFn: hubApi.pullCloud,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      setNotice({ tone: result.failed ? "bad" : "good", text: `Cloud updates applied: ${result.applied}${result.failed ? `, failed: ${result.failed}` : ""}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const requeueSync = useMutation({
    mutationFn: hubApi.requeueFailedSync,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      setNotice({ tone: "good", text: `Sync events requeued: ${result.requeued}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const prints = useMutation({
    mutationFn: hubApi.processPrints,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({ tone: "good", text: `Print queue checked. Printed ${result.printed}, failed ${result.failed}.` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const resolveCommandFailure = useMutation({
    mutationFn: hubApi.resolveCloudCommandFailure,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({ tone: result.resolved ? "good" : "bad", text: result.resolved ? "Cloud command warning marked resolved." : "That warning was already gone." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const savePin = useMutation({
    mutationFn: (currentPin: string) => hubApi.setManagerPin({ currentPin, newPin, updatedBy: "admin" }),
    onSuccess: async () => {
      setNewPin("");
      await onLocked();
      setNotice({ tone: "good", text: "Manager PIN changed. Unlock setup again with the new PIN." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const fullReset = useMutation({
    mutationFn: (approval: ManagerApproval) =>
      hubApi.fullReset({
        managerApproval: approval,
        confirmationText: resetPhrase,
        includeBackups: resetBackups
      }),
    onSuccess: () => {
      setNotice({ tone: "good", text: "Full reset scheduled. The hub will restart now." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="advanced-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Manager approval</h2>
        </div>
        <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            New manager PIN
            <input value={newPin} onChange={(event) => setNewPin(event.target.value)} type="password" />
          </label>
          <button
            type="button"
            disabled={newPin.length < 4 || savePin.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Change Manager PIN",
                defaultReason: "Manager PIN changed",
                message: "After this is saved, setup will lock and must be unlocked with the new PIN.",
                confirmLabel: savePin.isPending ? "Saving..." : "Save new PIN",
                danger: true
              }).catch(() => null);
              if (approval) savePin.mutate(approval.pin);
            }}
          >
            Save PIN
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Tax groups</h2>
        </div>
        <div className="record-list">
          {bootstrap.saleGroups.map((group) => (
            <SaleGroupRow key={group.id} group={group} units={bootstrap.productionUnits} setNotice={setNotice} onSaved={() => queryClient.invalidateQueries({ queryKey: ["bootstrap"] })} />
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Support tools</h2>
        </div>
        <div className="action-strip">
          <button type="button" onClick={() => pullCloud.mutate()} disabled={pullCloud.isPending}>
            <CloudDownload size={18} /> Get cloud updates
          </button>
          <button type="button" onClick={() => requeueSync.mutate()} disabled={requeueSync.isPending}>
            Retry failed sync
          </button>
          <button type="button" onClick={() => prints.mutate()} disabled={prints.isPending}>
            <Printer size={18} /> Run print queue
          </button>
        </div>
        {bootstrap.syncStatus.commandFailures?.length ? (
          <div className="record-list compact-list">
            <p className="soft-note">These cloud setup updates failed on this hub. Fix the setup in the cloud portal, send a new update, then mark the old warning resolved.</p>
            {bootstrap.syncStatus.commandFailures.map((failure) => (
              <article key={failure.commandId} className="record-row">
                <div>
                  <strong>{failure.type}</strong>
                  <span>{failure.error} · {new Date(failure.failedAt).toLocaleString()}</span>
                </div>
                <button type="button" onClick={() => resolveCommandFailure.mutate(failure.commandId)} disabled={resolveCommandFailure.isPending}>
                  Mark resolved
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Recent print jobs</h2>
        </div>
        <div className="record-list">
          {bootstrap.printJobs.map((job) => (
            <article key={job.id} className="record-row">
              <div>
                <strong>{job.target_type}</strong>
                <span>{job.status} · attempts {job.attempts}{job.last_error ? ` · ${job.last_error}` : ""}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel danger-zone">
        <div className="panel-title">
          <h2>Danger zone</h2>
          <span>Reset this hub PC</span>
        </div>
        <p className="warning-text">
          Full reset removes the local restaurant database from this PC. Use this only when you want to start setup from zero.
        </p>
        <div className="reset-options">
          <label>
            Type RESET HUB
            <input value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} placeholder="RESET HUB" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={resetBackups} onChange={(event) => setResetBackups(event.target.checked)} />
            Also delete local backup files
          </label>
          <button
            type="button"
            className="danger-button"
            disabled={resetPhrase !== "RESET HUB" || fullReset.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Full reset hub",
                defaultReason: "Full reset hub",
                message: resetBackups
                  ? "This will delete local data and local backup files, then restart the hub."
                  : "This will delete local data, keep backup files, then restart the hub.",
                confirmLabel: fullReset.isPending ? "Resetting..." : "Reset hub",
                danger: true
              }).catch(() => null);
              if (approval) fullReset.mutate(approval);
            }}
          >
            Reset hub
          </button>
        </div>
      </section>
    </div>
  );
}

function PrintLayoutEditor({
  layouts,
  units,
  setNotice,
  requestManagerApproval,
  onSaved
}: {
  layouts?: { default: PrintLayoutSettings; receipt: PrintLayoutSettings; units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettings }> };
  units: ProductionUnit[];
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onSaved: () => Promise<void>;
}) {
  const [scope, setScope] = useState<"receipt" | "unit">("receipt");
  const [unitId, setUnitId] = useState("");
  const selectedUnitId = unitId || units[0]?.id || "";
  const selectedLayout =
    scope === "receipt"
      ? layouts?.receipt
      : layouts?.units.find((entry) => entry.productionUnitId === selectedUnitId)?.layout;
  const [draft, setDraft] = useState<PrintLayoutSettings | null>(selectedLayout ?? null);

  useEffect(() => {
    if (scope === "unit" && !unitId && units[0]?.id) setUnitId(units[0].id);
  }, [scope, unitId, units]);

  useEffect(() => {
    if (selectedLayout) setDraft(selectedLayout);
  }, [selectedLayout]);

  const save = useMutation({
    mutationFn: (pin: string) => {
      if (!draft) throw new Error("Print layout is still loading");
      return hubApi.updatePrintLayout(scope, { ...draft, scope, productionUnitId: scope === "unit" ? selectedUnitId : undefined }, pin);
    },
    onSuccess: async () => {
      await onSaved();
      setNotice({ tone: "good", text: "Print layout saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  if (!draft) return <p className="plain-state">Loading print layout controls...</p>;

  const update = <K extends keyof PrintLayoutSettings>(key: K, value: PrintLayoutSettings[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };
  const preview = [
    draft.restaurantName,
    draft.billHeader || draft.kotHeader,
    scope === "receipt" && draft.showBillId ? "BILL TEST-BILL" : "KOT #1 NEW",
    draft.showTable ? "Table: T1" : "",
    draft.showDateTime ? "Time: 15 May 2026, 8:30 PM" : "",
    "--------------------------------",
    scope === "receipt" ? "Paneer Tikka  2 x ₹220.00 = ₹440.00" : "+2 Paneer Tikka",
    scope === "receipt" ? `Subtotal: ${formatInr(44000)}` : "",
    scope === "receipt" && draft.showTaxBreakup ? `CGST: ${formatInr(1100)}\nSGST: ${formatInr(1100)}` : "",
    scope === "receipt" ? `Total: ${formatInr(46200)}` : "",
    scope === "receipt" && draft.showPaymentSplit ? `Payments\nCASH: ${formatInr(30000)}\nUPI: ${formatInr(16200)}` : "",
    draft.billFooter || draft.kotFooter
  ].filter(Boolean).join("\n");

  return (
    <section className="sub-panel">
      <div className="panel-title">
        <div>
          <h3>Customize print layout</h3>
          <span>Cash counter and each kitchen/counter can have its own text layout.</span>
        </div>
      </div>
      <div className="layout-editor">
        <form className="template-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Layout for
            <select value={scope} onChange={(event) => setScope(event.target.value as "receipt" | "unit")}>
              <option value="receipt">Cash counter bill</option>
              <option value="unit">Kitchen / counter ticket</option>
            </select>
          </label>
          {scope === "unit" ? (
            <label>
              Kitchen / counter
              <select value={selectedUnitId} onChange={(event) => setUnitId(event.target.value)}>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            Paper width
            <select value={draft.lineWidthChars} onChange={(event) => update("lineWidthChars", Number(event.target.value))}>
              <option value={32}>58mm / narrow</option>
              <option value={42}>80mm standard</option>
              <option value={48}>80mm wide</option>
            </select>
          </label>
          <label>
            Header alignment
            <select value={draft.headerAlign} onChange={(event) => update("headerAlign", event.target.value as "left" | "center")}>
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Footer alignment
            <select value={draft.footerAlign} onChange={(event) => update("footerAlign", event.target.value as "left" | "center")}>
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Blank lines after print
            <input type="number" min={1} max={8} value={draft.feedLines} onChange={(event) => update("feedLines", Number(event.target.value))} />
          </label>
          <label>
            Restaurant name
            <input value={draft.restaurantName} onChange={(event) => update("restaurantName", event.target.value)} />
          </label>
          <label>
            Tax/GST/VAT line
            <input value={draft.taxRegistrationText} onChange={(event) => update("taxRegistrationText", event.target.value)} />
          </label>
          <label>
            Header text
            <input value={scope === "receipt" ? draft.billHeader : draft.kotHeader} onChange={(event) => update(scope === "receipt" ? "billHeader" : "kotHeader", event.target.value)} />
          </label>
          <label>
            Footer text
            <input value={scope === "receipt" ? draft.billFooter : draft.kotFooter} onChange={(event) => update(scope === "receipt" ? "billFooter" : "kotFooter", event.target.value)} />
          </label>
          <div className="checkbox-grid">
            <label><input type="checkbox" checked={draft.showTable} onChange={(event) => update("showTable", event.target.checked)} /> Table</label>
            <label><input type="checkbox" checked={draft.showDateTime} onChange={(event) => update("showDateTime", event.target.checked)} /> Date/time</label>
            <label><input type="checkbox" checked={draft.showTaxBreakup} onChange={(event) => update("showTaxBreakup", event.target.checked)} /> Tax breakup</label>
            <label><input type="checkbox" checked={draft.showDiscountTip} onChange={(event) => update("showDiscountTip", event.target.checked)} /> Discount/tip</label>
            <label><input type="checkbox" checked={draft.showPaymentSplit} onChange={(event) => update("showPaymentSplit", event.target.checked)} /> Payment split</label>
            <label><input type="checkbox" checked={draft.showBillId} onChange={(event) => update("showBillId", event.target.checked)} /> Bill/KOT number</label>
            <label><input type="checkbox" checked={draft.showCaptain} onChange={(event) => update("showCaptain", event.target.checked)} /> Captain on KOT</label>
            <label><input type="checkbox" checked={draft.showNcReprintRevision} onChange={(event) => update("showNcReprintRevision", event.target.checked)} /> NC/reprint labels</label>
          </div>
          <button
            type="button"
            disabled={save.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Save print layout",
                defaultReason: "Print layout changed",
                confirmLabel: save.isPending ? "Saving..." : "Save layout"
              }).catch(() => null);
              if (approval) save.mutate(approval.pin);
            }}
          >
            Save layout
          </button>
        </form>
        <pre className="print-preview">{preview}</pre>
      </div>
    </section>
  );
}

function SetupCard({ title, done, icon, children }: { title: string; done: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={done ? "setup-card done" : "setup-card"}>
      <header>
        <div className="setup-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <span>{done ? "Ready" : "Needs setup"}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

function EditableRecordList({
  setNotice,
  rows
}: {
  setNotice: NoticeSetter;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    active: boolean;
    onToggle: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
    editForm: (close: () => void) => ReactNode;
  }>;
}) {
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      setNotice({ tone: "good", text: "Saved." });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="record-list">
      {rows.map((row) => (
        <article key={row.id} className="record-row">
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="row-actions">
            <button type="button" disabled={busyId === row.id} onClick={() => setEditingId((current) => current === row.id ? "" : row.id)}>
              {editingId === row.id ? <X size={15} /> : <Pencil size={15} />}
              {editingId === row.id ? "Close" : "Edit"}
            </button>
            <button type="button" disabled={busyId === row.id} onClick={() => void run(row.id, row.onToggle)}>
              {row.active ? "Disable" : "Enable"}
            </button>
            <button type="button" className="icon-button danger" disabled={busyId === row.id} onClick={() => void run(row.id, row.onDelete)} aria-label={`Delete ${row.title}`}>
              <Trash2 size={16} />
            </button>
          </div>
          {editingId === row.id ? row.editForm(() => setEditingId("")) : null}
        </article>
      ))}
      {!rows.length ? <Empty title="Nothing added yet" text="Saved records appear here immediately." /> : null}
    </div>
  );
}

function FloorEditForm({ floor, onSaved, setNotice }: { floor: Floor; onSaved: () => Promise<void>; setNotice: NoticeSetter }) {
  const [name, setName] = useState(floor.name);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateFloor(floor.id, { name })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Floor updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Floor name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={!name.trim() || saving}>Save</button>
    </form>
  );
}

function TableEditForm({
  table,
  floors,
  onSaved,
  setNotice
}: {
  table: Table;
  floors: Floor[];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(table.name);
  const [floorId, setFloorId] = useState(table.floor_id);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateTable(table.id, { name, floorId })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Table updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Table name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Floor
        <select value={floorId} onChange={(event) => setFloorId(event.target.value)}>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!name.trim() || !floorId || saving}>Save</button>
    </form>
  );
}

function UnitEditForm({ unit, onSaved, setNotice }: { unit: ProductionUnit; onSaved: () => Promise<void>; setNotice: NoticeSetter }) {
  const [name, setName] = useState(unit.name);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateUnit(unit.id, { name })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Kitchen updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Kitchen or counter name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={!name.trim() || saving}>Save</button>
    </form>
  );
}

function DishEditForm({
  item,
  units,
  saleGroups,
  onSaved,
  setNotice
}: {
  item: MenuItem;
  units: ProductionUnit[];
  saleGroups: Bootstrap["saleGroups"];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price_paise / 100));
  const [productionUnitId, setProductionUnitId] = useState(item.production_unit_id ?? "");
  const [saleGroupId, setSaleGroupId] = useState(item.sale_group_id ?? "sg-food");
  const [saving, setSaving] = useState(false);
  const pricePaise = Math.round(Number(price || 0) * 100);
  return (
    <form className="row-edit-form dish-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateDish(item.id, { name, pricePaise, productionUnitId: productionUnitId || null, saleGroupId })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Dish updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Dish name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Price
        <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
      </label>
      <label>
        Kitchen
        <select value={productionUnitId} onChange={(event) => setProductionUnitId(event.target.value)}>
          <option value="">No kitchen assigned</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </label>
      <label>
        Group
        <select value={saleGroupId} onChange={(event) => setSaleGroupId(event.target.value)}>
          {saleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!name.trim() || pricePaise <= 0 || saving}>Save</button>
    </form>
  );
}

function SaleGroupRow({
  group,
  units,
  setNotice,
  onSaved
}: {
  group: Bootstrap["saleGroups"][number];
  units: ProductionUnit[];
  setNotice: NoticeSetter;
  onSaved: () => Promise<unknown>;
}) {
  const [defaultProductionUnitId, setDefaultProductionUnitId] = useState(group.default_production_unit_id ?? "");
  const [ticketLabel, setTicketLabel] = useState<"KOT" | "BOT">(group.ticket_label);
  const [taxText, setTaxText] = useState(() => {
    try {
      return (JSON.parse(group.tax_components_json) as Array<{ name: string; rateBps: number }>)
        .map((component) => `${component.name}:${component.rateBps / 100}`)
        .join(", ");
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  function parseTaxComponents() {
    return taxText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, percent] = part.split(":").map((value) => value.trim());
        return { name: name ?? "", rateBps: Math.round(Number(percent || 0) * 100) };
      })
      .filter((component) => component.name && Number.isFinite(component.rateBps));
  }
  return (
    <article className="record-row">
      <div>
        <strong>{group.name}</strong>
        <span>{group.kind} · {ticketLabel} · {group.default_production_unit_name ?? "No default counter"}</span>
      </div>
      <form className="row-edit-form" onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi.updateSaleGroup(group.id, {
          defaultProductionUnitId: defaultProductionUnitId || null,
          ticketLabel,
          taxComponents: parseTaxComponents()
        })
          .then(onSaved)
          .then(() => setNotice({ tone: "good", text: "Tax group saved." }))
          .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
          .finally(() => setSaving(false));
      }}>
        <label>
          Default counter
          <select value={defaultProductionUnitId} onChange={(event) => setDefaultProductionUnitId(event.target.value)}>
            <option value="">None</option>
            {units.filter((unit) => unit.active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <label>
          Ticket
          <select value={ticketLabel} onChange={(event) => setTicketLabel(event.target.value as "KOT" | "BOT")}>
            <option value="KOT">KOT</option>
            <option value="BOT">BOT</option>
          </select>
        </label>
        <label>
          Taxes
          <input value={taxText} onChange={(event) => setTaxText(event.target.value)} placeholder="CGST:2.5, SGST:2.5" />
        </label>
        <button type="submit" disabled={saving}>Save</button>
      </form>
    </article>
  );
}

function LineItems({
  rows,
  emptyTitle,
  emptyText
}: {
  rows: Array<{ id: string; title: string; meta: string; quantity: number; amount: number; onMinus?: () => void; onPlus?: () => void }>;
  emptyTitle: string;
  emptyText: string;
}) {
  if (!rows.length) return <Empty title={emptyTitle} text={emptyText} />;
  return (
    <div className="line-list">
      {rows.map((row) => (
        <article key={row.id} className="line-row">
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="qty-cluster">
            {row.onMinus ? <button type="button" onClick={row.onMinus}>-</button> : null}
            <b>{row.quantity}</b>
            {row.onPlus ? <button type="button" onClick={row.onPlus}>+</button> : null}
          </div>
          <strong>{formatInr(row.amount)}</strong>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

type NoticeSetter = (notice: { tone: "good" | "bad"; text: string }) => void;

function titleForView(view: HubView) {
  const titles: Record<HubView, string> = {
    setup: "Setup",
    orders: "Take Orders",
    alcohol: "Alcohol",
    kitchen: "Kitchen",
    reports: "Reports",
    advanced: "Advanced"
  };
  return titles[view];
}

function rupeesToPaise(value: string) {
  return Math.round(Number(value || 0) * 100);
}

function paiseToRupeeInput(value: number) {
  const rupees = value / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

function buildEditableAlcoholVariants(item: AlcoholItem): EditableAlcoholVariant[] {
  if (item.type === "prepared_product") {
    const variant = item.variants?.find((entry) => entry.kind === "default") ?? item.variants?.[0];
    return [{ ...defaultPreparedVariant(), id: variant?.id, price: variant ? paiseToRupeeInput(variant.price_paise) : "" }];
  }
  const byKind = new Map((item.variants ?? []).map((variant) => [variant.kind, variant]));
  const defaults = editablePlainVariantDefaults(item.small_bottle_ml || 180, item.large_bottle_ml || 750);
  return defaults.map((fallback) => {
    const existing = byKind.get(fallback.kind);
    return {
      ...fallback,
      id: existing?.id,
      label: existing?.label ?? fallback.label,
      price: existing ? paiseToRupeeInput(existing.price_paise) : "",
      volumeMl: existing?.volume_ml ? String(existing.volume_ml) : fallback.volumeMl,
      inventoryAction: normalizeInventoryAction(existing?.inventory_action) ?? fallback.inventoryAction,
      sortOrder: existing?.sort_order ?? fallback.sortOrder,
      active: existing ? Boolean(existing.active) : false
    };
  });
}

function editablePlainVariantDefaults(smallMl: number, largeMl: number): EditableAlcoholVariant[] {
  return [
    { label: "30 ml", kind: "shot", price: "", volumeMl: "30", inventoryAction: "large_ml", sortOrder: 0, active: false },
    { label: `${smallMl} ml`, kind: "small_bottle", price: "", volumeMl: String(smallMl), inventoryAction: "small_bottle", sortOrder: 1, active: false },
    { label: `${largeMl} ml`, kind: "large_bottle", price: "", volumeMl: String(largeMl), inventoryAction: "large_bottle", sortOrder: 2, active: false }
  ];
}

function defaultPreparedVariant(): EditableAlcoholVariant {
  return {
    label: "Regular",
    kind: "default",
    price: "",
    volumeMl: "",
    inventoryAction: "none",
    sortOrder: 0,
    active: true
  };
}

function variantLabelForKind(kind: AlcoholVariantKind, smallMl: number, largeMl: number) {
  if (kind === "shot") return "30 ml";
  if (kind === "small_bottle") return `${smallMl} ml`;
  if (kind === "large_bottle") return `${largeMl} ml`;
  return "Regular";
}

function normalizeInventoryAction(value?: string): AlcoholInventoryAction | null {
  return value === "large_ml" || value === "small_bottle" || value === "large_bottle" || value === "none" ? value : null;
}

function menuItemVariantOptions(item?: MenuItem): MenuItemVariantOption[] {
  if (!item) return [];
  const variants = (item.variants ?? []).filter((variant) => Boolean(variant.active));
  if (variants.length > 0) return variants.map((variant) => ({ id: variant.id, label: variant.label, kind: variant.kind, price_paise: variant.price_paise }));
  if (item.sale_group_kind === "alcohol") return [];
  return [{ label: "Regular", kind: "default", price_paise: item.price_paise }];
}

function alcoholMovementSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    bill_settlement: "Bill settlement",
    manual_adjustment: "Manual edit",
    negative_stock: "Negative stock"
  };
  return labels[sourceType] ?? sourceType.replaceAll("_", " ");
}

function alcoholMovementDeltaText(movement: AlcoholStockMovement) {
  const parts = [
    signedStockPart(movement.delta_sealed_large, "large"),
    signedStockPart(movement.delta_open_large_ml, "ml"),
    signedStockPart(movement.delta_sealed_small, "small")
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No stock change";
}

function signedStockPart(value: number, unit: string) {
  if (!value) return "";
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
