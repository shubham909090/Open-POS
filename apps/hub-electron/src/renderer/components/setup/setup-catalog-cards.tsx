import { formatInr } from "@gaurav-pos/shared";
import { ChefHat, ClipboardList, Users } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  hubApi,
  type Bootstrap,
  type CsvImportResult,
  type MenuItem,
} from "../../hub-api.js";
import type { NoticeSetter } from "../../lib/format.js";
import { CsvImportBox } from "../ui/csv-import-box.js";
import { DishEditForm } from "./dish-edit-form.js";
import { EditableRecordList } from "./editable-record-list.js";
import { FloorEditForm } from "./floor-edit-form.js";
import { SetupCard } from "./setup-card.js";
import { TableEditForm } from "./table-edit-form.js";
import { UnitEditForm } from "./unit-edit-form.js";

const DISH_IMPORT_TEMPLATE = [
  "name,price,kitchen_or_counter,sale_category,active",
  "Veg Fried Rice,180,Kitchen,Food,true",
  "Sweet Lassi,90,Bar,Beverage,true",
].join("\n");

type SaveCallback = () => Promise<void>;

export function FloorsTablesCard({
  bootstrap,
  activeFloors,
  firstFloorId,
  floorName,
  setFloorName,
  tableName,
  setTableName,
  tableFloorId,
  setTableFloorId,
  createFloorPending,
  createTablePending,
  onCreateFloor,
  onCreateTable,
  invalidate,
  setNotice,
}: {
  bootstrap: Bootstrap;
  activeFloors: Bootstrap["floors"];
  firstFloorId: string;
  floorName: string;
  setFloorName: Dispatch<SetStateAction<string>>;
  tableName: string;
  setTableName: Dispatch<SetStateAction<string>>;
  tableFloorId: string;
  setTableFloorId: Dispatch<SetStateAction<string>>;
  createFloorPending: boolean;
  createTablePending: boolean;
  onCreateFloor: () => void;
  onCreateTable: () => void;
  invalidate: SaveCallback;
  setNotice: NoticeSetter;
}) {
  return (
    <SetupCard
      title="Floors And Tables"
      done={bootstrap.tables.some((table) => table.active)}
      icon={<Users size={20} />}
      summary={`${bootstrap.tables.filter((table) => table.active).length} active tables`}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateFloor();
        }}
      >
        <label>
          Floor name
          <input
            value={floorName}
            onChange={(event) => setFloorName(event.target.value)}
            placeholder="Main hall"
          />
        </label>
        <button disabled={!floorName.trim() || createFloorPending} type="submit">
          Add floor
        </button>
      </form>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateTable();
        }}
      >
        <label>
          Floor
          <select
            value={tableFloorId}
            onChange={(event) => setTableFloorId(event.target.value)}
          >
            {activeFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Table name
          <input
            value={tableName}
            onChange={(event) => setTableName(event.target.value)}
            placeholder="T1"
          />
        </label>
        <button
          disabled={!firstFloorId || !tableName.trim() || createTablePending}
          type="submit"
        >
          Add table
        </button>
      </form>
      <EditableRecordList
        setNotice={setNotice}
        rows={bootstrap.tables.map((table) => ({
          id: table.id,
          title: table.name,
          meta: `${table.floor_name} · ${table.active ? table.status : "disabled"}`,
          active: table.active,
          onToggle: () =>
            hubApi.updateTable(table.id, { active: !table.active }).then(invalidate),
          onDelete: () => hubApi.deleteTable(table.id).then(invalidate),
          editForm: (close) => (
            <TableEditForm
              table={table}
              floors={activeFloors}
              onSaved={async () => {
                close();
                await invalidate();
              }}
              setNotice={setNotice}
            />
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
          onToggle: () =>
            hubApi.updateFloor(floor.id, { active: !floor.active }).then(invalidate),
          onDelete: () => hubApi.deleteFloor(floor.id).then(invalidate),
          editForm: (close) => (
            <FloorEditForm
              floor={floor}
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
          <input
            value={unitName}
            onChange={(event) => setUnitName(event.target.value)}
            placeholder="Main kitchen"
          />
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
          onToggle: () =>
            hubApi.updateUnit(unit.id, { active: !unit.active }).then(invalidate),
          onDelete: () => hubApi.deleteUnit(unit.id).then(invalidate),
          editForm: (close) => (
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

export function DishesCard({
  bootstrap,
  rawSetupDishItems,
  setupDishItems,
  dishListSearch,
  setDishListSearch,
  dishName,
  setDishName,
  dishPrice,
  setDishPrice,
  dishUnit,
  setDishUnit,
  dishGroup,
  setDishGroup,
  dishSaleGroups,
  dishPricePaise,
  createDishPending,
  importDishesPending,
  dishImportResult,
  onCreateDish,
  onImportDishes,
  invalidate,
  setNotice,
}: {
  bootstrap: Bootstrap;
  rawSetupDishItems: MenuItem[];
  setupDishItems: MenuItem[];
  dishListSearch: string;
  setDishListSearch: Dispatch<SetStateAction<string>>;
  dishName: string;
  setDishName: Dispatch<SetStateAction<string>>;
  dishPrice: string;
  setDishPrice: Dispatch<SetStateAction<string>>;
  dishUnit: string;
  setDishUnit: Dispatch<SetStateAction<string>>;
  dishGroup: string;
  setDishGroup: Dispatch<SetStateAction<string>>;
  dishSaleGroups: Bootstrap["saleGroups"];
  dishPricePaise: number;
  createDishPending: boolean;
  importDishesPending: boolean;
  dishImportResult: CsvImportResult | null;
  onCreateDish: () => void;
  onImportDishes: (csv: string) => void;
  invalidate: SaveCallback;
  setNotice: NoticeSetter;
}) {
  return (
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
          busy={importDishesPending}
          result={dishImportResult}
          onImport={onImportDishes}
        />
      </details>
      <form
        className="dish-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateDish();
        }}
      >
        <label>
          Dish name
          <input
            value={dishName}
            onChange={(event) => setDishName(event.target.value)}
            placeholder="Paneer tikka"
          />
        </label>
        <label>
          Price
          <input
            value={dishPrice}
            onChange={(event) => setDishPrice(event.target.value)}
            inputMode="decimal"
            placeholder="220"
          />
        </label>
        <label>
          Kitchen
          <select value={dishUnit} onChange={(event) => setDishUnit(event.target.value)}>
            <option value="">No kitchen yet</option>
            {bootstrap.productionUnits
              .filter((unit) => unit.active)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Group
          <select
            value={dishGroup}
            onChange={(event) => setDishGroup(event.target.value)}
          >
            {dishSaleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!dishName.trim() || dishPricePaise <= 0 || createDishPending}
          type="submit"
        >
          Add dish
        </button>
      </form>
      <div className="setup-search-row">
        <input
          value={dishListSearch}
          onChange={(event) => setDishListSearch(event.target.value)}
          placeholder="Search saved dishes"
        />
      </div>
      <EditableRecordList
        setNotice={setNotice}
        rows={setupDishItems.map((item) => ({
          id: item.id,
          title: item.name,
          meta: `${formatInr(item.price_paise)} · ${item.sale_group_name} · ${item.production_unit_name ?? "No kitchen assigned"} · ${item.active ? "active" : "disabled"}`,
          active: item.active,
          onToggle: () =>
            hubApi.updateDish(item.id, { active: !item.active }).then(invalidate),
          onDelete: () => hubApi.deleteDish(item.id).then(invalidate),
          editForm: (close) => (
            <DishEditForm
              item={item}
              units={bootstrap.productionUnits.filter((unit) => unit.active)}
              saleGroups={bootstrap.saleGroups.filter((group) => group.active)}
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
