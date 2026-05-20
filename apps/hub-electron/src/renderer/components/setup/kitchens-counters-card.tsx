import { ChefHat } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import type { NoticeSetter } from "../../lib/format.js";
import { EditableRecordList } from "./editable-record-list.js";
import { SetupCard } from "./setup-card.js";
import { UnitEditForm } from "./unit-edit-form.js";

type SaveCallback = () => Promise<void>;

export function KitchensCountersCard({
  bootstrap,
  unitName,
  setUnitName,
  createUnitPending,
  onCreateUnit,
  invalidate,
  setNotice,
}: {
  bootstrap: Bootstrap;
  unitName: string;
  setUnitName: Dispatch<SetStateAction<string>>;
  createUnitPending: boolean;
  onCreateUnit: () => void;
  invalidate: SaveCallback;
  setNotice: NoticeSetter;
}) {
  return (
    <SetupCard
      title="Kitchens And Counters"
      done={bootstrap.productionUnits.some((unit) => unit.active)}
      icon={<ChefHat size={20} />}
      summary={`${bootstrap.productionUnits.filter((unit) => unit.active).length} active kitchens/counters`}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateUnit();
        }}
      >
        <label>
          Kitchen or counter name
          <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Main kitchen" />
        </label>
        <button disabled={!unitName.trim() || createUnitPending} type="submit">
          Add
        </button>
      </form>
      <EditableRecordList
        setNotice={setNotice}
        rows={bootstrap.productionUnits.map((unit) => ({
          id: unit.id,
          title: unit.name,
          meta: `${unit.printer_mode === "network" ? `${unit.printer_host || "LAN printer"}:${unit.printer_port ?? 9100}` : unit.printer_name || "PC printer not selected"} · ${unit.kds_enabled ? "shown on Kitchen screen" : "hidden from Kitchen screen"}`,
          active: unit.active,
          onToggle: () => hubApi.updateUnit(unit.id, { active: !unit.active }).then(invalidate),
          onDelete: () => hubApi.deleteUnit(unit.id).then(invalidate),
          editForm: (close: () => void) => (
            <UnitEditForm
              unit={unit}
              onSaved={async () => {
                close();
                await invalidate();
              }}
              setNotice={setNotice}
            />
          ),
        }))}
      />
    </SetupCard>
  );
}
