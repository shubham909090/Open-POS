import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, searchMenuItems } from "@gaurav-pos/shared";
import {
  CalendarCheck,
  ChefHat,
  ClipboardList,
  Printer,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { hubApi, type Bootstrap, type CsvImportResult } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { CsvImportBox } from "../ui/csv-import-box.js";
import { SetupCard } from "./setup-card.js";
import { EditableRecordList } from "./editable-record-list.js";
import { FloorEditForm } from "./floor-edit-form.js";
import { TableEditForm } from "./table-edit-form.js";
import { UnitEditForm } from "./unit-edit-form.js";
import { DishEditForm } from "./dish-edit-form.js";
import { DevicePairingCard } from "./device-pairing-card.js";
import { PrintLayoutEditor } from "./print-layout-editor.js";

const DISH_IMPORT_TEMPLATE = [
  "name,price,kitchen_or_counter,sale_category,active",
  "Veg Fried Rice,180,Kitchen,Food,true",
  "Sweet Lassi,90,Bar,Beverage,true",
].join("\n");

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
  const [receiptPrinterName, setReceiptPrinterName] = useState("");
  const [receiptHost, setReceiptHost] = useState("");
  const [receiptPort, setReceiptPort] = useState("9100");
  const [cloudUrl, setCloudUrl] = useState(bootstrap.setup?.hubConnection?.cloudUrl ?? "");
  const [installationId, setInstallationId] = useState(bootstrap.setup?.hubConnection?.installationId ?? "");
  const [syncSecret, setSyncSecret] = useState(bootstrap.setup?.hubConnection?.syncSecret ?? "");
  const [hubPublicUrl, setHubPublicUrl] = useState(bootstrap.setup?.hubConnection?.hubPublicUrl ?? "");
  const [connectionEditing, setConnectionEditing] = useState(!bootstrap.setup?.hubConnection?.configured);
  const [printerEditing, setPrinterEditing] = useState(false);
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
  const devices = useQuery({ queryKey: ["devices"], queryFn: hubApi.devices });
  const connectionConfigured = Boolean(bootstrap.setup?.hubConnection?.configured);
  const receiptPrinterConfigured = Boolean(receiptPrinter.data?.printerName || receiptPrinter.data?.printerHost);

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
      hubApi.updateReceiptPrinter({
        printerMode: receiptPrinterName ? "system" : "network",
        printerName: receiptPrinterName || undefined,
        printerHost: receiptHost,
        printerPort: Number(receiptPort || 9100),
      }),
    onSuccess: async () => {
      await invalidatePrinter();
      setPrinterEditing(false);
      setNotice({ tone: "good", text: "Cash counter printer saved." });
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
      setNotice({ tone: result.processed.failed ? "bad" : "good", text: result.processed.failed ? "Test bill print failed. Check Recent print jobs." : "Test bill print queued successfully." });
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
      <SetupCard
        title="Business Day"
        done
        icon={<CalendarCheck size={20} />}
        summary={`${bootstrap.currentBusinessDay.business_date} · rolls over at 6:00 AM IST`}
        defaultOpen={false}
      />

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
        title="Printer Mode And Cash Counter"
        done={printerOutputMode === "test" || receiptPrinterConfigured}
        icon={<Printer size={20} />}
        summary={`${printerOutputMode === "live" ? "Live printing" : "Test mode"} · ${receiptPrinterConfigured ? "cash counter saved" : "cash counter not set"}`}
      >
        <div className="printer-mode-card">
          <div className="segment-row">
            <button
              type="button"
              className={printerOutputMode === "test" ? "active" : ""}
              onClick={() => void requestPrinterMode("test")}
              disabled={updatePrinterMode.isPending}
            >
              Test Mode
            </button>
            <button
              type="button"
              className={printerOutputMode === "live" ? "active" : ""}
              onClick={() => void requestPrinterMode("live")}
              disabled={updatePrinterMode.isPending}
            >
              Live Mode
            </button>
          </div>
          <p className={printerOutputMode === "live" ? "text-sm text-muted" : "warning-text"}>
            {printerOutputMode === "live"
              ? "Live Mode sends real bills and kitchen tickets to the connected printers."
              : "Test Mode is safe for setup. Print jobs are recorded, but nothing is sent to hardware."}
          </p>
        </div>
        {receiptPrinterConfigured && !printerEditing ? (
          <div className="saved-settings-card">
            <div>
              <strong>
                {receiptPrinter.data?.printerName ? "PC printer" : "LAN printer"} saved
              </strong>
              <span>
                {receiptPrinter.data?.printerName || `${receiptPrinter.data?.printerHost}:${receiptPrinter.data?.printerPort ?? 9100}`}
              </span>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button" onClick={() => setPrinterEditing(true)}>
                Edit
              </button>
              <button type="button" className="secondary-button" onClick={() => void systemPrinters.refetch()} disabled={systemPrinters.isFetching}>
                Load PC printers
              </button>
            </div>
          </div>
        ) : (
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
            {receiptPrinterConfigured ? (
              <button type="button" className="secondary-button" onClick={() => setPrinterEditing(false)}>
                Cancel
              </button>
            ) : null}
          </form>
        )}
        <div className="printer-test-actions utility-actions">
          <button type="button" className="utility-action" onClick={() => testBillPrint.mutate()} disabled={testBillPrint.isPending}>
            <Printer size={18} /> Print test bill
          </button>
          <button type="button" className="utility-action" onClick={() => testKotPrint.mutate()} disabled={testKotPrint.isPending}>
            <ChefHat size={18} /> Print test kitchen ticket
          </button>
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

      <SetupCard
        title="Floors And Tables"
        done={bootstrap.tables.some((table) => table.active)}
        icon={<Users size={20} />}
        summary={`${bootstrap.tables.filter((table) => table.active).length} active tables`}
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); createFloor.mutate(); }}>
          <label>
            Floor name
            <input value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Main hall" />
          </label>
          <button disabled={!floorName.trim() || createFloor.isPending} type="submit">Add floor</button>
        </form>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); createTable.mutate(); }}>
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
            ),
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
            ),
          }))}
        />
      </SetupCard>

      <SetupCard
        title="Kitchens And Counters"
        done={bootstrap.productionUnits.some((unit) => unit.active)}
        icon={<ChefHat size={20} />}
        summary={`${bootstrap.productionUnits.filter((unit) => unit.active).length} active kitchens/counters`}
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); createUnit.mutate(); }}>
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
            ),
          }))}
        />
      </SetupCard>

      <SetupCard
        title="Dishes"
        done={rawSetupDishItems.some((item) => item.active)}
        icon={<ClipboardList size={20} />}
        summary={`${rawSetupDishItems.filter((item) => item.active).length} active dishes`}
      >
        <details className="setup-subdetails csv-import-details">
          <summary>
            <span>Import dishes from CSV</span>
            <small>Bulk menu setup</small>
          </summary>
          <CsvImportBox
            title="Dish menu CSV"
            templateName="dish-menu-template.csv"
            templateCsv={DISH_IMPORT_TEMPLATE}
            busy={importDishes.isPending}
            result={dishImportResult}
            onImport={(csv) => importDishes.mutate(csv)}
          />
        </details>
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
            ),
          }))}
        />
      </SetupCard>

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
