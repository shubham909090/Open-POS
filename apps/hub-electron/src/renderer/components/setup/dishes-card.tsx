import { formatInr } from "@gaurav-pos/shared";
import { ClipboardList } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { hubApi, type Bootstrap, type CsvImportResult, type MenuItem } from "../../hub-api.js";
import type { NoticeSetter } from "../../lib/format.js";
import { CsvImportBox } from "../ui/csv-import-box.js";
import { DishEditForm } from "./dish-edit-form.js";
import { EditableRecordList } from "./editable-record-list.js";
import { SetupCard } from "./setup-card.js";

const DISH_IMPORT_TEMPLATE = [
  "name,price,kitchen_or_counter,sale_category,active",
  "Veg Fried Rice,180,Kitchen,Food,true",
  "Sweet Lassi,90,Bar,Beverage,true",
].join("\n");

type SaveCallback = () => Promise<void>;

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
  requestManagerApproval,
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
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const deleteAllDishes = async () => {
    const approval = await requestManagerApproval({
      title: "Delete all dishes",
      message: "Unused dishes will be deleted. Used dishes will be disabled so old bills remain safe.",
      defaultReason: "Bulk delete dishes",
      confirmLabel: "Delete dishes",
      danger: true,
    }).catch(() => null);
    if (!approval) return;
    const result = await hubApi.bulkDeleteDishes({ ...approval, approvedBy: "manager" });
    await invalidate();
    setNotice({
      tone: result.failed ? "bad" : "good",
      text: `${result.deleted} dishes deleted, ${result.disabled} disabled${result.failed ? `, ${result.failed} failed` : ""}.`,
    });
  };

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
          <select value={dishGroup} onChange={(event) => setDishGroup(event.target.value)}>
            {dishSaleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!dishName.trim() || dishPricePaise <= 0 || createDishPending} type="submit">
          Add dish
        </button>
      </form>
      <div className="setup-search-row">
        <input value={dishListSearch} onChange={(event) => setDishListSearch(event.target.value)} placeholder="Search saved dishes" />
        <button type="button" className="danger-link" disabled={rawSetupDishItems.length === 0} onClick={() => void deleteAllDishes()}>
          Delete all dishes
        </button>
      </div>
      <EditableRecordList
        setNotice={setNotice}
        hideSearch
        rows={setupDishItems.map((item) => ({
          id: item.id,
          title: item.name,
          meta: `${formatInr(item.price_paise)} · ${item.sale_group_name} · ${item.production_unit_name ?? "No kitchen assigned"} · ${item.active ? "active" : "disabled"}`,
          active: item.active,
          onToggle: () => hubApi.updateDish(item.id, { active: !item.active }).then(invalidate),
          onDelete: async () => {
            const approval = await requestManagerApproval({
              title: `Delete ${item.name}`,
              message: "Unused dishes are deleted. Used dishes are disabled so old bills remain safe.",
              defaultReason: "Delete dish",
              confirmLabel: "Delete dish",
              danger: true,
            });
            await hubApi.deleteDish(item.id, { ...approval, approvedBy: "manager" });
            await invalidate();
          },
          editForm: (close: () => void) => (
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
