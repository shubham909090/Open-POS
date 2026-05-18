import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchMenuItems } from "@gaurav-pos/shared";
import { ChefHat, Printer, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { hubApi, type Bootstrap, type CsvImportResult } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { SetupCard } from "./setup-card.js";
import { DevicePairingCard } from "./device-pairing-card.js";
import { PrintLayoutEditor } from "./print-layout-editor.js";
import { BusinessDayCard } from "./setup-business-day-card.js";
import { DishesCard, FloorsTablesCard, KitchensCountersCard } from "./setup-catalog-cards.js";

export function SetupView({
  bootstrap,
  setNotice,
  requestManagerApproval,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const [floorName, setFloorName] = useState("");
  const [tableName, setTableName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [dishName, setDishName] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishUnit, setDishUnit] = useState("");
  const [dishGroup, setDishGroup] = useState("sg-food");
  const [dishListSearch, setDishListSearch] = useState("");
  const [dishImportResult, setDishImportResult] = useState<CsvImportResult | null>(null);
  const [tableFloorId, setTableFloorId] = useState("");
  const [receiptLabel, setReceiptLabel] = useState("Main bill printer");
  const [receiptPrinterMode, setReceiptPrinterMode] = useState<"system" | "network">("system");
  const [receiptPrinterName, setReceiptPrinterName] = useState("");
  const [receiptHost, setReceiptHost] = useState("");
  const [receiptPort, setReceiptPort] = useState("9100");
  const [alternateLabel, setAlternateLabel] = useState("Second bill printer");
  const [alternatePrinterMode, setAlternatePrinterMode] = useState<"system" | "network">("system");
  const [alternatePrinterName, setAlternatePrinterName] = useState("");
  const [alternateHost, setAlternateHost] = useState("");
  const [alternatePort, setAlternatePort] = useState("9100");
  const [cloudUrl, setCloudUrl] = useState(bootstrap.setup?.hubConnection?.cloudUrl ?? "");
  const [installationId, setInstallationId] = useState(bootstrap.setup?.hubConnection?.installationId ?? "");
  const [syncSecret, setSyncSecret] = useState(bootstrap.setup?.hubConnection?.syncSecret ?? "");
  const [hubPublicUrl, setHubPublicUrl] = useState(bootstrap.setup?.hubConnection?.hubPublicUrl ?? "");
  const [connectionEditing, setConnectionEditing] = useState(!bootstrap.setup?.hubConnection?.configured);
  const [printerEditing, setPrinterEditing] = useState(false);
  const [systemPrintersLoading, setSystemPrintersLoading] = useState(false);
  const firstFloorId = bootstrap.floors.find((floor) => floor.active)?.id ?? bootstrap.floors[0]?.id ?? "";
  const activeFloors = bootstrap.floors.filter((floor) => floor.active);
  const dishSaleGroups = bootstrap.saleGroups.filter((group) => group.active && group.kind !== "alcohol");
  const rawSetupDishItems = bootstrap.menuItems.filter((item) => item.sale_group_kind !== "alcohol");
  const setupDishItems = searchMenuItems(rawSetupDishItems, dishListSearch, { includeInactive: true });
  const dishPricePaise = Math.round(Number(dishPrice || 0) * 100);
  const printerOutputMode = bootstrap.setup?.printerOutputMode ?? "test";
  const billPrinters = useQuery({ queryKey: ["bill-printers"], queryFn: hubApi.billPrinters });
  const systemPrinters = useQuery({ queryKey: ["system-printers"], queryFn: () => hubApi.systemPrinters(), enabled: false });
  const printLayouts = useQuery({ queryKey: ["print-layouts"], queryFn: hubApi.printLayouts });
  const devices = useQuery({ queryKey: ["devices"], queryFn: hubApi.devices });
  const connectionConfigured = Boolean(bootstrap.setup?.hubConnection?.configured);
  const defaultBillPrinter = billPrinters.data?.default;
  const alternateBillPrinter = billPrinters.data?.alternate;
  const savedReceiptMode = defaultBillPrinter?.printerMode ?? (defaultBillPrinter?.printerName ? "system" : "network");
  const receiptPrinterConfigured = Boolean(defaultBillPrinter?.configured);
  const alternatePrinterConfigured = Boolean(alternateBillPrinter?.configured);
  const receiptPrinterTarget = savedReceiptMode === "system"
    ? defaultBillPrinter?.printerName
    : defaultBillPrinter?.printerHost
      ? `${defaultBillPrinter.printerHost}:${defaultBillPrinter.printerPort ?? 9100}`
      : "";
  const alternatePrinterTarget = alternateBillPrinter?.printerMode === "system"
    ? alternateBillPrinter.printerName
    : alternateBillPrinter?.printerHost
      ? `${alternateBillPrinter.printerHost}:${alternateBillPrinter.printerPort ?? 9100}`
      : "";
  const receiptPrinterReady = receiptPrinterConfigured ? receiptPrinterTarget : "No cash counter printer selected";
  const printerCardSummary = `${printerOutputMode === "live" ? "Live" : "Test"} · ${receiptPrinterConfigured ? receiptPrinterReady : "cash counter not set"}${alternatePrinterConfigured ? ` · ${alternateBillPrinter?.label}` : ""}`;
  const canSaveReceiptPrinter = receiptPrinterMode === "system" ? Boolean(receiptPrinterName) : Boolean(receiptHost.trim());
  const systemPrinterLabel = (printerName: string) => systemPrinters.data?.find((printer) => printer.name === printerName)?.displayName ?? printerName;
  const draftReceiptTarget = receiptPrinterMode === "system"
    ? receiptPrinterName
      ? systemPrinterLabel(receiptPrinterName)
      : "Choose a PC printer"
    : receiptHost.trim()
      ? `${receiptHost.trim()}:${receiptPort || 9100}`
      : "Enter LAN printer IP";
  const draftAlternateTarget = alternatePrinterMode === "system"
    ? alternatePrinterName
      ? systemPrinterLabel(alternatePrinterName)
      : "Not selected"
    : alternateHost.trim()
      ? `${alternateHost.trim()}:${alternatePort || 9100}`
      : "Not selected";
  const printerSummaryDefault = printerEditing || !receiptPrinterConfigured ? draftReceiptTarget : receiptPrinterReady;
  const printerSummaryAlternate = printerEditing || !receiptPrinterConfigured
    ? draftAlternateTarget
    : alternatePrinterConfigured
      ? alternatePrinterTarget
      : "Not configured";

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
    if (!billPrinters.data) return;
    setReceiptLabel(billPrinters.data.default.label);
    setReceiptPrinterMode(billPrinters.data.default.printerMode);
    setReceiptPrinterName(billPrinters.data.default.printerName ?? "");
    setReceiptHost(billPrinters.data.default.printerHost ?? "");
    setReceiptPort(String(billPrinters.data.default.printerPort ?? 9100));
    setAlternateLabel(billPrinters.data.alternate.label);
    setAlternatePrinterMode(billPrinters.data.alternate.printerMode);
    setAlternatePrinterName(billPrinters.data.alternate.printerName ?? "");
    setAlternateHost(billPrinters.data.alternate.printerHost ?? "");
    setAlternatePort(String(billPrinters.data.alternate.printerPort ?? 9100));
  }, [billPrinters.data]);

  useEffect(() => {
    const connection = bootstrap.setup?.hubConnection;
    if (!connection) return;
    setCloudUrl(connection.cloudUrl);
    setInstallationId(connection.installationId);
    setSyncSecret(connection.syncSecret);
    setHubPublicUrl(connection.hubPublicUrl);
  }, [bootstrap.setup?.hubConnection]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  const refreshSystemPrinters = async () => {
    if (systemPrintersLoading) return;
    setSystemPrintersLoading(true);
    try {
      const printers = await hubApi.systemPrinters({ refresh: true });
      queryClient.setQueryData(["system-printers"], printers);
      setNotice({ tone: "good", text: `${printers.length} PC printers loaded.` });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setSystemPrintersLoading(false);
    }
  };
  const invalidatePrinter = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bill-printers"] });
    await invalidate();
  };
  const updatePrinterMode = useMutation({
    mutationFn: (mode: "test" | "live") => hubApi.updatePrinterMode(mode),
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: "good",
        text: result.mode === "live" ? "Printers are live. Real tickets will print." : "Printer Test Mode is on. Tickets are logged without real printing.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const requestPrinterMode = async (mode: "test" | "live") => {
    if (mode === "live" && printerOutputMode !== "live") {
      const approval = await requestManagerApproval({
        title: "Turn on live printing",
        message: "Live Mode sends real bills and kitchen tickets to connected printers. Run test prints first.",
        defaultReason: "Enable live printer output",
        requireReason: false,
        confirmLabel: "Turn on Live Mode",
      }).catch(() => null);
      if (!approval) return;
    }
    updatePrinterMode.mutate(mode);
  };
  const saveReceiptPrinter = useMutation({
    mutationFn: () =>
      hubApi.updateBillPrinters({
        default: {
          label: receiptLabel.trim() || "Main bill printer",
          printerMode: receiptPrinterMode,
          printerName: receiptPrinterMode === "system" ? receiptPrinterName || undefined : undefined,
          printerHost: receiptPrinterMode === "network" ? receiptHost.trim() : "",
          printerPort: Number(receiptPort || 9100),
        },
        alternate: {
          label: alternateLabel.trim() || "Second bill printer",
          printerMode: alternatePrinterMode,
          printerName: alternatePrinterMode === "system" ? alternatePrinterName || undefined : undefined,
          printerHost: alternatePrinterMode === "network" ? alternateHost.trim() : "",
          printerPort: Number(alternatePort || 9100),
        },
      }),
    onSuccess: async () => {
      setPrinterEditing(false);
      await invalidatePrinter();
      setNotice({ tone: "good", text: "Bill printers saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const revealHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.hubConnection(pin),
    onSuccess: (result) => {
      setCloudUrl(result.cloudUrl);
      setInstallationId(result.installationId);
      setSyncSecret(result.syncSecret);
      setHubPublicUrl(result.hubPublicUrl);
      setConnectionEditing(true);
      setNotice({ tone: "good", text: "Cloud connection details shown." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const saveHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.updateHubConnection({ cloudUrl, installationId, syncSecret, hubPublicUrl }, pin),
    onSuccess: async () => {
      await invalidate();
      setConnectionEditing(false);
      setNotice({ tone: "good", text: "Cloud connection saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const testHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.testHubConnection(pin),
    onSuccess: (result) => setNotice({ tone: result.status === "connected" ? "good" : "bad", text: result.message }),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const approveConnectionAction = async (title: string, defaultReason: string) =>
    requestManagerApproval({ title, defaultReason, confirmLabel: "Continue" }).catch(() => null);
  const testBillPrint = useMutation({
    mutationFn: hubApi.testBillPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: result.processed.failed ? "bad" : "good",
        text: result.processed.failed
          ? `Test bill print failed: ${result.processed.error ?? "Check Recent print jobs."}`
          : "Test bill print queued successfully."
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const testKotPrint = useMutation({
    mutationFn: hubApi.testKotPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({ tone: result.processed.failed ? "bad" : "good", text: result.processed.failed ? "Test kitchen ticket failed. Check Recent print jobs." : "Test kitchen ticket queued successfully." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createFloor = useMutation({
    mutationFn: () => hubApi.createFloor(floorName),
    onSuccess: async () => {
      setFloorName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createTable = useMutation({
    mutationFn: () => hubApi.createTable(tableFloorId || firstFloorId, tableName),
    onSuccess: async () => {
      setTableName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createUnit = useMutation({
    mutationFn: () => hubApi.createUnit(unitName),
    onSuccess: async () => {
      setUnitName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createDish = useMutation({
    mutationFn: () =>
      hubApi.createDish({
        name: dishName,
        pricePaise: dishPricePaise,
        productionUnitId: dishUnit || null,
        saleGroupId: dishGroup,
        active: true,
      }),
    onSuccess: async () => {
      setDishName("");
      setDishPrice("");
      setDishUnit("");
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const importDishes = useMutation({
    mutationFn: (csv: string) => hubApi.importDishesCsv(csv),
    onSuccess: async (result) => {
      setDishImportResult(result);
      await invalidate();
      setNotice({
        tone: result.failed ? "bad" : "good",
        text: result.failed ? `${result.created} dishes imported. ${result.failed} rows need fixing.` : `${result.created} dishes imported.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <div className="grid gap-4">
      <BusinessDayCard bootstrap={bootstrap} />

      <SetupCard
        title="Hub Connection And Security"
        done={connectionConfigured}
        icon={<Settings size={20} />}
        summary={connectionConfigured ? "Cloud connection saved" : "Add cloud connection"}
      >
        {connectionConfigured && !connectionEditing ? (
          <div className="saved-settings-card">
            <div>
              <strong>{bootstrap.setup?.hubConnection?.cloudUrl || "Cloud connection saved"}</strong>
              <span>
                ID {bootstrap.setup?.hubConnection?.installationId || "saved"} · Secret hidden · Public URL {bootstrap.setup?.hubConnection?.hubPublicUrl || "not set"}
              </span>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button" onClick={() => setConnectionEditing(true)}>
                Edit
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
                onClick={async () => {
                  const approval = await approveConnectionAction("Test cloud connection", "Test hub cloud connection");
                  if (approval) testHubConnection.mutate(approval.pin);
                }}
                disabled={testHubConnection.isPending}
              >
                Test cloud connection
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Paste the hub connection values from the cloud portal here. These fields are saved on this hub and hidden unless the Manager PIN is entered.</p>
            <form className="template-form" onSubmit={(event) => event.preventDefault()}>
              <input className="sr-only" name="username" tabIndex={-1} autoComplete="username" value="hub-sync" readOnly aria-hidden="true" />
              <label>
                Cloud URL
                <input value={cloudUrl} onChange={(event) => setCloudUrl(event.target.value)} placeholder="https://your-deployment.convex.site" autoComplete="off" />
              </label>
              <label>
                Hub connection ID
                <input value={installationId} onChange={(event) => setInstallationId(event.target.value)} autoComplete="off" />
              </label>
              <label>
                Sync secret
                <input value={syncSecret} onChange={(event) => setSyncSecret(event.target.value)} type="password" autoComplete="current-password" />
              </label>
              <label>
                Hub public URL
                <input value={hubPublicUrl} onChange={(event) => setHubPublicUrl(event.target.value)} placeholder="http://192.168.1.20:3737" autoComplete="off" />
              </label>
              <div className="flex flex-wrap gap-2">
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
                {connectionConfigured ? (
                  <button type="button" className="secondary-button" onClick={() => setConnectionEditing(false)}>
                    Cancel
                  </button>
                ) : null}
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
          </>
        )}
      </SetupCard>

      <SetupCard
        title="Printing"
        done={printerOutputMode === "test" || receiptPrinterConfigured}
        icon={<Printer size={20} />}
        summary={printerCardSummary}
      >
        <div className="printer-console">
          <div className="printer-config-main">
            <div className="printer-section-header">
              <div>
                <span>Bill printers</span>
                <strong>{receiptPrinterConfigured ? receiptPrinterReady : "Choose where bills print"}</strong>
              </div>
              {receiptPrinterConfigured && !printerEditing ? (
                <button type="button" className="secondary-button" onClick={() => setPrinterEditing(true)}>
                  Edit bill printers
                </button>
              ) : null}
            </div>
            {receiptPrinterConfigured && !printerEditing ? (
              <div className="printer-saved-panel">
                <span>{defaultBillPrinter?.label ?? "Main bill printer"} · {savedReceiptMode === "system" ? "PC printer" : "LAN printer"}</span>
                <strong>{receiptPrinterReady}</strong>
                <p>{alternatePrinterConfigured ? `${alternateBillPrinter?.label}: ${alternatePrinterTarget}` : "Second bill printer is not configured yet."}</p>
              </div>
            ) : (
              <form className="printer-form printer-setup-form" onSubmit={(event) => { event.preventDefault(); saveReceiptPrinter.mutate(); }}>
                {receiptPrinterMode === "system" || alternatePrinterMode === "system" ? (
                  <div className="printer-pc-toolbar">
                    <div>
                      <strong>PC printer list</strong>
                      <span>{systemPrinters.data?.length ? `${systemPrinters.data.length} printers loaded` : "Load installed Windows printers once, then choose below."}</span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void refreshSystemPrinters()}
                      disabled={systemPrintersLoading}
                      aria-busy={systemPrintersLoading}
                    >
                      {systemPrintersLoading ? "Loading PC printers..." : "Load PC printers"}
                    </button>
                  </div>
                ) : null}

                <div className="printer-slot-card primary">
                  <div className="printer-slot-head">
                    <div>
                      <span>Default bill printer</span>
                      <strong>{draftReceiptTarget}</strong>
                    </div>
                    <span className="printer-slot-required">Required</span>
                  </div>
                  <label>
                    Printer label
                    <input value={receiptLabel} onChange={(event) => setReceiptLabel(event.target.value)} placeholder="Main bill printer" />
                  </label>
                  <div className="printer-mode-tabs">
                    <button type="button" className={receiptPrinterMode === "system" ? "active" : ""} onClick={() => setReceiptPrinterMode("system")}>
                      PC printer
                    </button>
                    <button type="button" className={receiptPrinterMode === "network" ? "active" : ""} onClick={() => setReceiptPrinterMode("network")}>
                      LAN printer
                    </button>
                  </div>
                  {receiptPrinterMode === "system" ? (
                    <div className="printer-fields-grid">
                      <label>
                        Installed printer
                        <select value={receiptPrinterName} onChange={(event) => setReceiptPrinterName(event.target.value)}>
                          <option value="">{systemPrinters.data?.length ? "Choose PC printer" : "Load PC printers first"}</option>
                          {(systemPrinters.data ?? []).map((printer) => (
                            <option key={printer.name} value={printer.name}>
                              {printer.displayName}{printer.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="printer-fields-grid network">
                      <label>
                        Printer IP
                        <input value={receiptHost} onChange={(event) => setReceiptHost(event.target.value)} placeholder="192.168.1.50" />
                      </label>
                      <label>
                        Port
                        <input value={receiptPort} onChange={(event) => setReceiptPort(event.target.value)} inputMode="numeric" placeholder="9100" />
                      </label>
                    </div>
                  )}
                </div>

                <div className="printer-slot-card">
                  <div className="printer-slot-head">
                    <div>
                      <span>Optional bill printer</span>
                      <strong>{draftAlternateTarget}</strong>
                    </div>
                    <span className="printer-slot-optional">Optional</span>
                  </div>
                  <label>
                    Printer label
                    <input value={alternateLabel} onChange={(event) => setAlternateLabel(event.target.value)} placeholder="Second bill printer" />
                  </label>
                  <div className="printer-mode-tabs">
                    <button type="button" className={alternatePrinterMode === "system" ? "active" : ""} onClick={() => setAlternatePrinterMode("system")}>
                      PC printer
                    </button>
                    <button type="button" className={alternatePrinterMode === "network" ? "active" : ""} onClick={() => setAlternatePrinterMode("network")}>
                      LAN printer
                    </button>
                  </div>
                  {alternatePrinterMode === "system" ? (
                    <div className="printer-fields-grid">
                    <label>
                      Installed printer
                      <select value={alternatePrinterName} onChange={(event) => setAlternatePrinterName(event.target.value)}>
                        <option value="">{systemPrinters.data?.length ? "Choose optional PC printer" : "Load PC printers first"}</option>
                        {(systemPrinters.data ?? []).map((printer) => (
                          <option key={printer.name} value={printer.name}>
                            {printer.displayName}{printer.isDefault ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="printer-fields-grid network">
                    <label>
                      Printer IP
                      <input value={alternateHost} onChange={(event) => setAlternateHost(event.target.value)} placeholder="192.168.1.71" />
                    </label>
                    <label>
                      Port
                      <input value={alternatePort} onChange={(event) => setAlternatePort(event.target.value)} inputMode="numeric" placeholder="9100" />
                    </label>
                  </div>
                )}
                  <p className="plain-state">Leave this empty if you only use one bill printer.</p>
                </div>
                <div className="form-actions printer-form-actions">
                  <button type="submit" disabled={saveReceiptPrinter.isPending || !canSaveReceiptPrinter}>
                    {saveReceiptPrinter.isPending ? "Saving..." : "Save bill printers"}
                  </button>
                  {receiptPrinterConfigured ? (
                    <button type="button" className="secondary-button" onClick={() => setPrinterEditing(false)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            )}
          </div>

          <aside className="printer-config-side">
            <div className="printer-summary-panel">
              <span>Current printer setup</span>
              <div>
                <strong>{receiptLabel || "Default printer"}</strong>
                <small>{printerSummaryDefault}</small>
              </div>
              <div>
                <strong>{alternateLabel || "Optional printer"}</strong>
                <small>{printerSummaryAlternate}</small>
              </div>
            </div>
            <div className={printerOutputMode === "live" ? "printer-output-panel live" : "printer-output-panel"}>
              <span>Output mode</span>
              <strong>{printerOutputMode === "live" ? "Live printing" : "Test mode"}</strong>
              <div className="segment-row">
                <button
                  type="button"
                  className={printerOutputMode === "test" ? "active" : ""}
                  onClick={() => void requestPrinterMode("test")}
                  disabled={updatePrinterMode.isPending}
                >
                  Test
                </button>
                <button
                  type="button"
                  className={printerOutputMode === "live" ? "active" : ""}
                  onClick={() => void requestPrinterMode("live")}
                  disabled={updatePrinterMode.isPending}
                >
                  Live
                </button>
              </div>
            </div>
            <div className="printer-test-actions">
              <button type="button" className="utility-action" onClick={() => testBillPrint.mutate("default")} disabled={testBillPrint.isPending}>
                <Printer size={18} /> Test default bill
              </button>
              <button type="button" className="utility-action" onClick={() => testBillPrint.mutate("alternate")} disabled={testBillPrint.isPending || !alternatePrinterConfigured}>
                <Printer size={18} /> Test alternate bill
              </button>
              <button type="button" className="utility-action" onClick={() => testKotPrint.mutate()} disabled={testKotPrint.isPending}>
                <ChefHat size={18} /> Test kitchen
              </button>
            </div>
          </aside>
        </div>
        <details className="setup-subdetails">
          <summary>
            <span>Print layout templates</span>
            <small>Receipt and kitchen ticket text</small>
          </summary>
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
        </details>
      </SetupCard>

      <FloorsTablesCard
        bootstrap={bootstrap}
        activeFloors={activeFloors}
        firstFloorId={firstFloorId}
        floorName={floorName}
        setFloorName={setFloorName}
        tableName={tableName}
        setTableName={setTableName}
        tableFloorId={tableFloorId}
        setTableFloorId={setTableFloorId}
        createFloorPending={createFloor.isPending}
        createTablePending={createTable.isPending}
        onCreateFloor={() => createFloor.mutate()}
        onCreateTable={() => createTable.mutate()}
        invalidate={invalidate}
        setNotice={setNotice}
      />

      <KitchensCountersCard
        bootstrap={bootstrap}
        unitName={unitName}
        setUnitName={setUnitName}
        createUnitPending={createUnit.isPending}
        onCreateUnit={() => createUnit.mutate()}
        invalidate={invalidate}
        setNotice={setNotice}
      />

      <DishesCard
        bootstrap={bootstrap}
        rawSetupDishItems={rawSetupDishItems}
        setupDishItems={setupDishItems}
        dishListSearch={dishListSearch}
        setDishListSearch={setDishListSearch}
        dishName={dishName}
        setDishName={setDishName}
        dishPrice={dishPrice}
        setDishPrice={setDishPrice}
        dishUnit={dishUnit}
        setDishUnit={setDishUnit}
        dishGroup={dishGroup}
        setDishGroup={setDishGroup}
        dishSaleGroups={dishSaleGroups}
        dishPricePaise={dishPricePaise}
        createDishPending={createDish.isPending}
        importDishesPending={importDishes.isPending}
        dishImportResult={dishImportResult}
        onCreateDish={() => createDish.mutate()}
        onImportDishes={(csv) => importDishes.mutate(csv)}
        invalidate={invalidate}
        setNotice={setNotice}
      />

      <DevicePairingCard
        devices={devices.data ?? []}
        loading={devices.isLoading}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
        onChanged={async () => {
          await devices.refetch();
          await invalidate();
        }}
      />
    </div>
  );
}
