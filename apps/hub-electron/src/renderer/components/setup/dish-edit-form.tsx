import { useState } from "react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import {
  hubApi,
  type Bootstrap,
  type MenuItem,
  type ProductionUnit,
} from "../../hub-api.js";

export function DishEditForm({
  item,
  units,
  saleGroups,
  onSaved,
  setNotice,
}: {
  item: MenuItem;
  units: ProductionUnit[];
  saleGroups: Bootstrap["saleGroups"];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price_paise / 100));
  const [productionUnitId, setProductionUnitId] = useState(
    item.production_unit_id ?? "",
  );
  const [saleGroupId, setSaleGroupId] = useState(
    item.sale_group_id ?? "sg-food",
  );
  const [saving, setSaving] = useState(false);
  const pricePaise = Math.round(Number(price || 0) * 100);

  return (
    <form
      className="row-edit-form dish-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi
          .updateDish(item.id, {
            name,
            pricePaise,
            productionUnitId: productionUnitId || null,
            saleGroupId,
          })
          .then(onSaved)
          .then(() => setNotice({ tone: "good", text: "Dish updated." }))
          .catch((error) =>
            setNotice({ tone: "bad", text: messageOf(error) }),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="row-edit-fields">
        <label>
          Dish name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Price
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Kitchen
          <select
            value={productionUnitId}
            onChange={(event) => setProductionUnitId(event.target.value)}
          >
            <option value="">No kitchen assigned</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Group
          <select
            value={saleGroupId}
            onChange={(event) => setSaleGroupId(event.target.value)}
          >
            {saleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row-edit-actions">
        <button type="submit" disabled={!name.trim() || pricePaise <= 0 || saving}>
          Save dish
        </button>
      </div>
    </form>
  );
}
