import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { hubApi, type ProductionUnit } from "../../hub-api.js";

export function UnitEditForm({
  unit,
  onSaved,
  setNotice,
}: {
  unit: ProductionUnit;
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(unit.name);
  const [printerMode, setPrinterMode] = useState<"system" | "network">(
    unit.printer_mode ?? "system",
  );
  const [printerName, setPrinterName] = useState(unit.printer_name ?? "");
  const [printerHost, setPrinterHost] = useState(unit.printer_host ?? "");
  const [printerPort, setPrinterPort] = useState(
    String(unit.printer_port ?? 9100),
  );
  const [kdsEnabled, setKdsEnabled] = useState(Boolean(unit.kds_enabled));
  const [saving, setSaving] = useState(false);
  const canSave = Boolean(name.trim()) && !saving && (printerMode === "system" || Boolean(printerHost.trim()));

  const systemPrinters = useQuery({
    queryKey: ["system-printers"],
    queryFn: hubApi.systemPrinters,
    enabled: false,
  });

  return (
    <form
      className="row-edit-form unit-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi
          .updateUnit(unit.id, {
            name,
            printerMode,
            printerName: printerMode === "system" ? printerName || null : null,
            printerHost: printerMode === "network" ? printerHost : "",
            printerPort: Number(printerPort || 9100),
            kdsEnabled,
          })
          .then(onSaved)
          .then(() =>
            setNotice({
              tone: "good",
              text: "Kitchen/counter printer settings saved.",
            }),
          )
          .catch((error) =>
            setNotice({ tone: "bad", text: messageOf(error) }),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="row-edit-fields unit-edit-fields">
        <label>
          Kitchen or counter name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="printer-mode-tabs">
          <button type="button" className={printerMode === "system" ? "active" : ""} onClick={() => setPrinterMode("system")}>
            PC printer
          </button>
          <button type="button" className={printerMode === "network" ? "active" : ""} onClick={() => setPrinterMode("network")}>
            LAN printer
          </button>
        </div>
        {printerMode === "system" ? (
          <div className="printer-fields-grid">
            <label>
              PC printer
              <select
                value={printerName}
                onChange={(event) => setPrinterName(event.target.value)}
              >
                <option value="">
                  {systemPrinters.data?.length
                    ? "Choose PC printer"
                    : "Load PC printers first"}
                </option>
                {(systemPrinters.data ?? []).map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.displayName}
                    {printer.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void systemPrinters.refetch()}
              disabled={systemPrinters.isFetching}
            >
              {systemPrinters.isFetching ? "Loading..." : "Load PC printers"}
            </button>
          </div>
        ) : (
          <div className="printer-fields-grid network">
            <label>
              LAN printer IP
              <input
                value={printerHost}
                onChange={(event) => setPrinterHost(event.target.value)}
                placeholder="192.168.1.50"
              />
            </label>
            <label>
              Port
              <input
                value={printerPort}
                onChange={(event) => setPrinterPort(event.target.value)}
                inputMode="numeric"
                placeholder="9100"
              />
            </label>
          </div>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={kdsEnabled}
            onChange={(event) => setKdsEnabled(event.target.checked)}
          />
          Show this counter on Kitchen screen
        </label>
      </div>
      <div className="row-edit-actions">
        <button
          type="submit"
          disabled={!canSave}
        >
          {saving ? "Saving..." : "Save counter setup"}
        </button>
      </div>
    </form>
  );
}
